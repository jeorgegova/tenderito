import { supabase } from '../lib/supabase';
import { getActiveStoreId } from './storeContext';
import { useStore } from '../store/useStore';
import type { Profile } from '../types';

/**
 * Consulta el perfil completo del usuario autenticado fusionando
 * los datos de la tabla 'profiles' con la tienda activa en 'stores'
 * (para obtener el subscription_plan, fechas y estado reales).
 */
export async function fetchProfile(): Promise<Profile | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) return null;

    let mergedProfile: Profile = { ...data };

    try {
      const activeStoreId = await getActiveStoreId();
      let storeQuery = supabase
        .from('stores')
        .select(
          'id, store_name, phone, address, subscription_plan, subscription_start_date, subscription_end_date, subscription_status, grace_period_days',
        );

      if (activeStoreId) {
        storeQuery = storeQuery.eq('id', activeStoreId);
      } else {
        storeQuery = storeQuery.eq('owner_id', user.id).limit(1);
      }

      const { data: storeData } = await storeQuery.maybeSingle();

      if (storeData) {
        // La tienda activa es la fuente de verdad del plan contratado
        const plan =
          storeData.subscription_plan && storeData.subscription_plan !== 'free'
            ? storeData.subscription_plan
            : data.subscription_plan || storeData.subscription_plan || 'free';

        const profileEnd = data.subscription_end_date
          ? new Date(data.subscription_end_date).getTime()
          : 0;
        const storeEnd = storeData.subscription_end_date
          ? new Date(storeData.subscription_end_date).getTime()
          : 0;
        const bestEndDate =
          storeEnd && profileEnd
            ? storeEnd >= profileEnd
              ? storeData.subscription_end_date
              : data.subscription_end_date
            : storeData.subscription_end_date || data.subscription_end_date;

        mergedProfile = {
          ...data,
          store_name: storeData.store_name || data.store_name,
          phone: storeData.phone || data.phone,
          address: storeData.address || data.address || null,
          subscription_plan: plan,
          subscription_start_date:
            storeData.subscription_start_date || data.subscription_start_date,
          subscription_end_date: bestEndDate,
          subscription_status:
            storeData.subscription_status || data.subscription_status,
          grace_period_days:
            storeData.grace_period_days ?? data.grace_period_days ?? null,
        };
      }
    } catch (_storeErr) {}

    // Sincronizar en memoria en Zustand
    useStore.getState().setProfile(mergedProfile);

    return mergedProfile;
  } catch (_e) {
    return null;
  }
}

export interface UpdateStoreProfileInput {
  store_name: string;
  phone?: string | null;
  merchant_name?: string | null;
  address?: string | null;
}

/**
 * Actualiza los datos de la tienda propia del tendero (nombre de tienda, teléfono, comerciante, dirección).
 */
export async function updateStoreProfile(
  input: UpdateStoreProfileInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw new Error('Usuario no autenticado');

    const cleanStoreName = input.store_name.trim();
    if (!cleanStoreName) throw new Error('El nombre de la tienda es requerido');
    const cleanPhone = input.phone ? input.phone.replace(/[^0-9]/g, '') : null;
    const cleanMerchantName = input.merchant_name?.trim() || null;
    const cleanAddress =
      input.address !== undefined
        ? input.address
          ? input.address.trim()
          : null
        : undefined;

    const activeStoreId = await getActiveStoreId();

    // 1. Intentar primero con la función RPC segura 'update_store_profile' si está disponible en Supabase
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        'update_store_profile',
        {
          p_store_name: cleanStoreName,
          p_phone: cleanPhone,
          p_merchant_name: cleanMerchantName,
          p_address: cleanAddress ?? null,
          p_store_id: activeStoreId || null,
        },
      );

      if (!rpcErr && rpcRes) {
        // Sincronizar en memoria en Zustand
        const current = useStore.getState().profile;
        if (current) {
          useStore.getState().setProfile({
            ...current,
            store_name: cleanStoreName,
            phone: cleanPhone,
            merchant_name: cleanMerchantName || current.merchant_name,
            address: cleanAddress !== undefined ? cleanAddress : current.address,
          });
        }
        return { success: true };
      }
    } catch (_rpcEx) {
      // Si la RPC aún no ha sido creada en la base de datos, continúa al fallback directo
    }

    // 2. Fallback directo: Actualizar tabla stores en Supabase
    const storePayload: any = {
      store_name: cleanStoreName,
      phone: cleanPhone,
    };
    if (cleanAddress !== undefined) {
      storePayload.address = cleanAddress;
    }

    if (activeStoreId) {
      await supabase
        .from('stores')
        .update(storePayload)
        .eq('id', activeStoreId);
    } else {
      await supabase.from('stores').update(storePayload).eq('owner_id', user.id);
    }

    // 3. Actualizar tabla profiles en Supabase (sin address para evitar 400 Bad Request si la columna no existe)
    const profilePayload: any = {
      store_name: cleanStoreName,
      phone: cleanPhone,
    };
    if (cleanMerchantName) {
      profilePayload.merchant_name = cleanMerchantName;
    }

    const { error: profErr } = await supabase
      .from('profiles')
      .update(profilePayload)
      .eq('id', user.id);

    if (profErr) {
      throw profErr;
    }

    // Si cleanAddress viene definido, intentar actualizarlo en profiles en caso de que ya tenga la columna
    if (cleanAddress !== undefined) {
      try {
        await supabase
          .from('profiles')
          .update({ address: cleanAddress })
          .eq('id', user.id);
      } catch (_e) {
        // Ignorar silenciosamente si profiles no tiene la columna address
      }
    }

    // 4. Sincronizar en memoria en Zustand
    const current = useStore.getState().profile;
    if (current) {
      useStore.getState().setProfile({
        ...current,
        store_name: cleanStoreName,
        phone: cleanPhone,
        merchant_name: cleanMerchantName || current.merchant_name,
        address: cleanAddress !== undefined ? cleanAddress : current.address,
      });
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error actualizando tienda' };
  }
}
