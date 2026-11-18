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
          'id, store_name, subscription_plan, subscription_start_date, subscription_end_date, subscription_status',
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

        mergedProfile = {
          ...data,
          store_name: storeData.store_name || data.store_name,
          subscription_plan: plan,
          subscription_start_date:
            storeData.subscription_start_date || data.subscription_start_date,
          subscription_end_date:
            storeData.subscription_end_date || data.subscription_end_date,
          subscription_status:
            storeData.subscription_status || data.subscription_status,
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
