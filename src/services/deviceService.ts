import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {getMessaging, getToken} from '@react-native-firebase/messaging';
import {supabase} from '../lib/supabase';
import {generateLocalId} from '../utils/id';

const DEVICE_ID_STORAGE_KEY = '@tenderito_device_id';
const PENDING_FCM_TOKEN_KEY = '@tenderito_pending_fcm_token';

/**
 * Obtiene el identificador único del hardware del dispositivo utilizando react-native-device-info.
 */
export async function getDeviceId(): Promise<string> {
  try {
    const uniqueId = await DeviceInfo.getUniqueId();
    if (uniqueId) {
      return uniqueId;
    }
  } catch (error) {
    console.warn('[deviceService] Error obteniendo uniqueId desde react-native-device-info:', error);
  }

  // Fallback seguro persistido en AsyncStorage por si el módulo nativo tarda en resolver
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId = generateLocalId();
      await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.warn('[deviceService] Error en fallback de deviceId:', error);
    return 'device-' + Date.now();
  }
}

/**
 * Obtiene el nombre/modelo del dispositivo (ej: "ANDROID - Pixel 7 Pro").
 */
export function getDeviceModelName(): string {
  try {
    const model = DeviceInfo.getModel();
    return model ? `${Platform.OS.toUpperCase()} - ${model}` : Platform.OS.toUpperCase();
  } catch (_e) {
    return Platform.OS.toUpperCase();
  }
}

/**
 * Obtiene la versión actual de la aplicación.
 */
export function getAppVersion(): string {
  try {
    return DeviceInfo.getVersion() || '1.0';
  } catch (_e) {
    return '1.0';
  }
}

/**
 * Registra o actualiza el token FCM del dispositivo en Supabase
 * asociado al usuario con sesión activa.
 *
 * Compatible con callback (estilo Odoo) y como Promise.
 */
export const register_fcm_token = async (
  token?: string,
  callback?: (success: boolean, response?: any) => void,
): Promise<{success: boolean; data?: any; error?: any}> => {
  try {
    let fcmToken = token;

    // Si no se proporcionó el token, intentar obtenerlo de Firebase
    if (!fcmToken) {
      try {
        const messaging = getMessaging();
        fcmToken = await getToken(messaging);
      } catch (err) {
        console.warn('[register_fcm_token] No se pudo obtener token FCM:', err);
      }
    }

    if (!fcmToken) {
      const err = new Error('No se pudo obtener el token FCM');
      callback?.(false, err);
      return {success: false, error: err};
    }

    // Guardar en caché local por si no hay sesión aún
    await AsyncStorage.setItem(PENDING_FCM_TOKEN_KEY, fcmToken);

    // Verificar si hay sesión activa en Supabase
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      console.log('[register_fcm_token] Usuario sin sesión, token guardado para vincular al iniciar sesión.');
      callback?.(true, {pending: true, token: fcmToken});
      return {success: true, data: {pending: true}};
    }

    const deviceId = await getDeviceId();

    console.log('[register_fcm_token] Registrando en Supabase:', {
      userId: user.id,
      deviceId,
      fcmToken: fcmToken.substring(0, 15) + '...',
    });

    const deviceName = getDeviceModelName();
    const appVersion = getAppVersion();

    // Llamar a la función RPC segura en Supabase
    const {data, error} = await supabase.rpc('registrar_dispositivo', {
      p_device_id: deviceId,
      p_fcm_token: fcmToken,
      p_platform: Platform.OS,
      p_device_name: deviceName,
      p_app_version: appVersion,
    });

    if (error) {
      // Fallback directo a la tabla si el RPC tuviera algún detalle de permisos
      console.warn('[register_fcm_token] Error en RPC, intentando upsert directo:', error.message);
      const {data: upsertData, error: upsertError} = await supabase
        .from('dispositivos_vinculados')
        .upsert(
          {
            user_id: user.id,
            device_id: deviceId,
            fcm_token: fcmToken,
            platform: Platform.OS,
            device_name: deviceName,
            app_version: appVersion,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {onConflict: 'user_id,device_id'},
        )
        .select()
        .single();

      if (upsertError) {
        console.error('[register_fcm_token] Error en upsert:', upsertError);
        callback?.(false, upsertError);
        return {success: false, error: upsertError};
      }

      console.log('response register_fcm_token..', null, upsertData);
      callback?.(true, upsertData);
      return {success: true, data: upsertData};
    }

    console.log('response register_fcm_token..', null, data);
    callback?.(true, data);
    return {success: true, data};
  } catch (err: any) {
    console.error('Error en register_fcm_token:', err);
    callback?.(false, err);
    return {success: false, error: err};
  }
};

/**
 * Desvincula el celular o token de la base de datos de Supabase.
 * Se invoca típicamente al cerrar sesión para no recibir notificaciones de cuentas ajenas.
 *
 * Compatible con callback y como Promise.
 */
export const unregister_fcm_token = async (
  data?: {deviceId?: string; token?: string} | any,
  callback?: (success: boolean, response?: any) => void,
): Promise<{success: boolean; data?: any; error?: any}> => {
  try {
    const deviceId = data?.deviceId || (await getDeviceId());
    const token = data?.token || (await AsyncStorage.getItem(PENDING_FCM_TOKEN_KEY));

    console.log('[unregister_fcm_token] Desvinculando dispositivo:', {deviceId});

    // Intentar invocar la función RPC en Supabase
    const {data: rpcResult, error: rpcError} = await supabase.rpc(
      'desvincular_dispositivo',
      {
        p_device_id: deviceId || null,
        p_fcm_token: token || null,
      },
    );

    if (rpcError) {
      console.warn('[unregister_fcm_token] Error en RPC, intentando delete directo:', rpcError.message);
      const {error: delError} = await supabase
        .from('dispositivos_vinculados')
        .delete()
        .eq('device_id', deviceId);

      if (delError) {
        console.error('[unregister_fcm_token] Error eliminando dispositivo:', delError);
        callback?.(false, delError);
        return {success: false, error: delError};
      }
    }

    // Limpiar token pendiente en storage local
    await AsyncStorage.removeItem(PENDING_FCM_TOKEN_KEY);

    console.log('response unregister_fcm_token..', null, rpcResult ?? true);
    callback?.(true, rpcResult ?? true);
    return {success: true, data: rpcResult ?? true};
  } catch (err: any) {
    console.error('Error en unregister_fcm_token:', err);
    callback?.(false, err);
    return {success: false, error: err};
  }
};

/**
 * Sincroniza el token pendiente del dispositivo tan pronto como el usuario inicie sesión.
 */
export async function syncPendingDeviceToken(): Promise<void> {
  try {
    const pendingToken = await AsyncStorage.getItem(PENDING_FCM_TOKEN_KEY);
    await register_fcm_token(pendingToken || undefined);
  } catch (error) {
    console.warn('[deviceService] Error en syncPendingDeviceToken:', error);
  }
}

/**
 * Valida si el cliente tiene un celular vinculado y le despacha la notificación push
 * automáticamente cuando se registra un movimiento (abono o fiado).
 * No requiere webhooks en Supabase: se ejecuta directamente desde la lógica de la app.
 */
export async function notifyCustomerMovement(params: {
  customerId: string;
  storeId?: string | null;
  type: 'payment' | 'credit';
  amount: number;
  concept?: string | null;
  notes?: string | null;
  movementId?: string | null;
}): Promise<{success: boolean; sent?: number; message?: string}> {
  try {
    if (!params.customerId) {
      return {success: false, message: 'customerId es obligatorio'};
    }

    console.log(
      `[notifyCustomerMovement] Iniciando notificación para cliente ${params.customerId} (tipo: ${params.type}, monto: ${params.amount})...`,
    );

    // Invocar la Edge Function en Supabase (nombre exacto desplegado: push-notification)
    const {data, error} = await supabase.functions.invoke('push-notification', {
      body: {
        table: params.type === 'payment' ? 'payments' : 'credits',
        record: {
          id: params.movementId,
          customer_id: params.customerId,
          store_id: params.storeId,
          amount: params.amount,
          concept: params.concept,
          notes: params.notes,
        },
      },
    });

    if (error) {
      console.warn('[notifyCustomerMovement] Error invocando Edge Function push-notification:', error.message);
      return {success: false, message: error.message};
    }

    console.log('[notifyCustomerMovement] Respuesta de la Edge Function:', data);
    return {success: true, sent: data?.sent ?? 0, message: data?.message};
  } catch (err: any) {
    console.warn('[notifyCustomerMovement] Error inesperado en notificación:', err);
    return {success: false, message: err?.message};
  }
}
