import { supabase } from '../lib/supabase';
import { generateLocalId } from '../utils/id';

export interface StoreStatus {
  id: string;
  store_id: string;
  created_by: string;
  media_url: string | null;
  media_path: string | null;
  bg_color: string | null;
  caption: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
  views_count?: number;
  has_viewed?: boolean;
}

export interface StoreStatusViewItem {
  customer_id: string;
  customer_name: string;
  customer_alias: string | null;
  customer_phone: string | null;
  viewed_at: string;
}

export interface StoreStatusRingSummary {
  totalActive: number;
  unviewedCount: number;
  hasActive: boolean;
  allViewed: boolean;
}

/**
 * Consulta los estados de la tienda para la vista del tendero (vigentes o futuros).
 * Incluye el conteo de visualizaciones por estado.
 */
export async function fetchMerchantStoreStatuses(storeId: string): Promise<StoreStatus[]> {
  if (!storeId) return [];

  const now = new Date().toISOString();

  const { data: statuses, error } = await supabase
    .from('store_statuses')
    .select('*, store_status_views(count)')
    .eq('store_id', storeId)
    .gte('expires_at', now)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[storeStatuses] Error consultando estados del tendero:', error);
    throw error;
  }

  return (statuses || []).map((s: any) => ({
    id: s.id,
    store_id: s.store_id,
    created_by: s.created_by,
    media_url: s.media_url,
    media_path: s.media_path,
    bg_color: s.bg_color,
    caption: s.caption,
    starts_at: s.starts_at,
    expires_at: s.expires_at,
    created_at: s.created_at,
    views_count: s.store_status_views?.[0]?.count ?? 0,
    has_viewed: false,
  }));
}

/**
 * Consulta los estados activos para la vista de un cliente.
 * Solo trae los que están vigentes actualmente (starts_at <= now AND expires_at >= now).
 * Marca has_viewed si el cliente ya los abrió.
 */
export async function fetchCustomerStoreStatuses(
  storeId: string,
  customerId?: string,
): Promise<StoreStatus[]> {
  if (!storeId) return [];

  const now = new Date().toISOString();

  const { data: statuses, error } = await supabase
    .from('store_statuses')
    .select('*')
    .eq('store_id', storeId)
    .lte('starts_at', now)
    .gte('expires_at', now)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[storeStatuses] Error consultando estados para cliente:', error);
    throw error;
  }

  if (!statuses || statuses.length === 0) return [];

  let viewedStatusIds = new Set<string>();
  if (customerId) {
    const statusIds = statuses.map((s: any) => s.id);
    const { data: views } = await supabase
      .from('store_status_views')
      .select('status_id')
      .in('status_id', statusIds)
      .eq('customer_id', customerId);

    if (views) {
      views.forEach((v: any) => viewedStatusIds.add(v.status_id));
    }
  }

  return statuses.map((s: any) => ({
    id: s.id,
    store_id: s.store_id,
    created_by: s.created_by,
    media_url: s.media_url,
    media_path: s.media_path,
    bg_color: s.bg_color,
    caption: s.caption,
    starts_at: s.starts_at,
    expires_at: s.expires_at,
    created_at: s.created_at,
    has_viewed: viewedStatusIds.has(s.id),
  }));
}

/**
 * Resumen para pintar el anillo del círculo de la tienda (Naranja / Gris / Sin borde).
 */
export async function fetchStoreStatusRing(
  storeId: string,
  customerId?: string,
): Promise<StoreStatusRingSummary> {
  const statuses = await fetchCustomerStoreStatuses(storeId, customerId);
  const totalActive = statuses.length;
  if (totalActive === 0) {
    return { totalActive: 0, unviewedCount: 0, hasActive: false, allViewed: false };
  }

  const unviewedCount = statuses.filter(s => !s.has_viewed).length;
  return {
    totalActive,
    unviewedCount,
    hasActive: true,
    allViewed: unviewedCount === 0,
  };
}

/**
 * Consulta la lista de clientes que vieron un estado específico (para el tendero: "Visto por...").
 */
export async function fetchStatusViews(statusId: string): Promise<StoreStatusViewItem[]> {
  if (!statusId) return [];

  const { data, error } = await supabase.rpc('obtener_vistas_estado', {
    p_status_id: statusId,
  });

  if (error) {
    console.error('[storeStatuses] Error en obtener_vistas_estado:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_alias: row.customer_alias,
    customer_phone: row.customer_phone,
    viewed_at: row.viewed_at,
  }));
}

/**
 * Registra que un cliente visualizó un estado.
 */
export async function markStatusAsViewed(statusId: string, customerId: string): Promise<void> {
  if (!statusId || !customerId) return;

  try {
    // Intentar registrar mediante RPC con SECURITY DEFINER para garantizar bypass seguro de RLS
    const { error: rpcError } = await supabase.rpc('registrar_vista_estado', {
      p_status_id: statusId,
      p_customer_id: customerId,
    });

    if (rpcError) {
      console.warn('[storeStatuses] Error llamando registrar_vista_estado RPC, fallback a upsert:', rpcError.message);
      const { error: upsertError } = await supabase
        .from('store_status_views')
        .upsert(
          { status_id: statusId, customer_id: customerId, viewed_at: new Date().toISOString() },
          { onConflict: 'status_id,customer_id' }
        );
      if (upsertError) {
        console.warn('[storeStatuses] Error en fallback upsert store_status_views:', upsertError.message);
      }
    }
  } catch (err) {
    console.warn('[storeStatuses] Error registrando visualización:', err);
  }
}

/**
 * Crea y publica un nuevo estado publicitario para la tienda (React Native).
 */
export async function createStoreStatus(params: {
  storeId: string;
  file?: { uri: string; type?: string; fileName?: string } | null;
  caption: string;
  startsAt: string;
  expiresAt: string;
  bgColor?: string;
}): Promise<{ success: boolean; data?: StoreStatus; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'No hay sesión de usuario activa.' };
    }

    const trimmedCaption = params.caption.trim();
    if (!trimmedCaption) {
      return { success: false, error: 'Debes ingresar una descripción para el estado.' };
    }
    if (trimmedCaption.length > 120) {
      return { success: false, error: 'La descripción no puede superar los 120 caracteres.' };
    }

    const statusId = generateLocalId();
    let mediaUrl: string | null = null;
    let mediaPath: string | null = null;

    // Subir imagen a Supabase Storage si se proporcionó
    if (params.file && params.file.uri) {
      const ext = params.file.type?.includes('png') ? 'png' : 'jpg';
      mediaPath = `${params.storeId}/${statusId}.${ext}`;

      const formData = new FormData();
      formData.append('file', {
        uri: params.file.uri,
        name: params.file.fileName || `${statusId}.${ext}`,
        type: params.file.type || 'image/jpeg',
      } as any);

      const { error: uploadError } = await supabase.storage
        .from('store-statuses')
        .upload(mediaPath, formData, {
          contentType: params.file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('[storeStatuses] Error subiendo imagen en móvil:', uploadError);
        return { success: false, error: `Error subiendo la imagen: ${uploadError.message}` };
      }

      const { data: publicData } = supabase.storage
        .from('store-statuses')
        .getPublicUrl(mediaPath);

      mediaUrl = publicData.publicUrl;
    }

    // Insertar registro en la tabla store_statuses
    const insertPayload = {
      id: statusId,
      store_id: params.storeId,
      created_by: user.id,
      media_url: mediaUrl,
      media_path: mediaPath,
      bg_color: params.bgColor || '#FF6B00',
      caption: trimmedCaption,
      starts_at: params.startsAt,
      expires_at: params.expiresAt,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('store_statuses')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      if (mediaPath) {
        await supabase.storage.from('store-statuses').remove([mediaPath]).catch(() => {});
      }
      return { success: false, error: insertError.message };
    }

    // Invocar Edge Function para enviar notificaciones push a los clientes de la tienda
    try {
      console.log('[storeStatuses] Enviando notificación push para nuevo estado:', inserted.id);
      const payload = {
        table: 'store_statuses',
        eventType: 'store_status',
        type: 'store_status',
        record: inserted,
        store_id: params.storeId,
        caption: trimmedCaption,
        data: {
          type: 'store_status',
          store_id: params.storeId,
          status_id: inserted.id,
          caption: trimmedCaption,
        },
      };

      // Intentar primero con 'push-notification' (nombre desplegado en Supabase) y fallback a 'push-notifications'
      let pushRes = await supabase.functions.invoke('push-notification', { body: payload });

      if (pushRes.error) {
        console.log('[storeStatuses] Fallback probando push-notifications plural...', pushRes.error.message);
        pushRes = await supabase.functions.invoke('push-notifications', { body: payload });
      }

      if (pushRes.error) {
        console.warn('[storeStatuses] Error llamando Edge Function de notificación:', pushRes.error.message);
      } else {
        console.log('[storeStatuses] Notificación push procesada exitosamente:', pushRes.data);
      }
    } catch (pushErr) {
      console.warn('[storeStatuses] Error llamando Edge Function de notificación:', pushErr);
    }

    return { success: true, data: inserted };
  } catch (err: any) {
    console.error('[storeStatuses] Error inesperado en createStoreStatus:', err);
    return { success: false, error: err?.message || 'Error inesperado al crear el estado.' };
  }
}

/**
 * Elimina un estado publicitario (y su imagen asociada en Storage).
 */
export async function deleteStoreStatus(
  statusId: string,
  mediaPath?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: deleteError } = await supabase
      .from('store_statuses')
      .delete()
      .eq('id', statusId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    if (mediaPath) {
      await supabase.storage.from('store-statuses').remove([mediaPath]).catch(() => {});
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error eliminando estado.' };
  }
}
