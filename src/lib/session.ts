import NetInfo from '@react-native-community/netinfo';
import {showAlert} from '../components/ui/AlertModal';
import {clearLocalDatabase, getDbConnection} from '../database/db';
import {useStore} from '../store/useStore';
import {supabase} from './supabase';
import {unregister_fcm_token} from '../services/deviceService';
import {queryClient} from './queryClient';
import {clearStoreContext, setLastAuthUserId} from '../services/storeContext';
import {countPendingLocalItems, syncAll} from '../services/sync';

/** Mensaje de confirmación para el acceso de clientes (portal). */
export const CUSTOMER_LOGOUT_MESSAGE =
  'Tendrás que ingresar nuevamente con tu número de documento y contraseña.';

interface LogoutOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  /** Limpia las tablas locales del negocio antes de salir (default: false). */
  clearLocalData?: boolean;
}

/**
 * Consulta en SQLite si existen operaciones locales pendientes y el estado de la red.
 */
export async function checkPendingSyncStatus(): Promise<{
  pendingCount: number;
  isOnline: boolean;
}> {
  try {
    const db = await getDbConnection();
    const pendingCount = await countPendingLocalItems(db);
    const netState = await NetInfo.fetch();
    const isOnline = Boolean(
      netState.isConnected && netState.isInternetReachable !== false,
    );
    return {pendingCount, isOnline};
  } catch (_e) {
    return {pendingCount: 0, isOnline: false};
  }
}

/**
 * Cierra la sesión activa: desvincula el dispositivo de Supabase,
 * limpia la caché en memoria y cierra la sesión en Supabase.
 * Los datos locales en SQLite se conservan por defecto para permitir que
 * el mismo tendero vuelva a iniciar sesión offline; la limpieza completa
 * se dispara automáticamente cuando un usuario diferente inicia sesión.
 */
export async function performLogout(clearLocalData = false): Promise<void> {
  try {
    const db = await getDbConnection();
    const pendingCount = await countPendingLocalItems(db);

    // Protección estricta: Si existen operaciones pendientes, NUNCA limpiar SQLite local
    const shouldClear = clearLocalData && pendingCount === 0;

    // 1. Desvincular el dispositivo en Supabase antes de cerrar la sesión
    await unregister_fcm_token().catch(err => {
      console.warn('[session] Error desvinculando dispositivo en logout:', err);
    });

    if (shouldClear) {
      await clearLocalDatabase();
      await clearStoreContext();
      await setLastAuthUserId(null);
    }

    await supabase.auth.signOut();
    queryClient.clear();
    useStore.getState().setProfile(null);
    useStore.getState().setCustomerSearch('');
  } catch (error: any) {
    showAlert('No se pudo cerrar sesión', error?.message);
  }
}

/**
 * Muestra la confirmación antes de cerrar sesión con PROTECCIÓN ESTRICTA de operaciones pendientes:
 * 1. Verifica si existen operaciones pendientes de sincronización en SQLite.
 * 2. Si no hay pendientes, permite cerrar sesión normalmente.
 * 3. Si hay pendientes e Internet, ofrece sincronizar antes de cerrar sesión.
 * 4. Si no hay conexión o la sincronización no confirma todos los pendientes, IMPIDE el cierre de sesión
 *    para evitar que el usuario pierda fiados o abonos registrados offline.
 */
export async function confirmLogout(options: LogoutOptions = {}): Promise<void> {
  const {
    title = '¿Seguro que deseas cerrar sesión?',
    message = 'Tendrás que volver a iniciar sesión para acceder a tu tienda.',
    confirmText = 'Cerrar sesión',
    clearLocalData = false,
  } = options;

  const {pendingCount, isOnline} = await checkPendingSyncStatus();

  // Si hay operaciones pendientes: Bloqueo de seguridad
  if (pendingCount > 0) {
    if (!isOnline) {
      showAlert({
        title: 'Operaciones pendientes sin conexión',
        message: `Tienes ${pendingCount} operacion(es) guardada(s) localmente (fiados, abonos o clientes) que aún no se han subido al servidor. Para no perder tu información, conéctate a Internet y espera que se sincronicen antes de cerrar sesión.`,
        type: 'warning',
        buttons: [{text: 'Entendido', style: 'cancel'}],
      });
      return;
    }

    // Hay conexión a Internet: permitir sincronizar y salir de forma segura
    showAlert({
      title: 'Sincronizar antes de salir',
      message: `Tienes ${pendingCount} operacion(es) pendientes de respaldar. ¿Deseas sincronizarlas con el servidor ahora para cerrar sesión de forma segura?`,
      type: 'warning',
      buttons: [
        {text: 'Cancelar', style: 'cancel'},
        {
          text: 'Sincronizar y salir',
          style: 'default',
          onPress: async () => {
            try {
              await syncAll({force: true});
              const db = await getDbConnection();
              const remaining = await countPendingLocalItems(db);
              if (remaining === 0) {
                await performLogout(clearLocalData);
              } else {
                showAlert({
                  title: 'Sincronización incompleta',
                  message: `Aún quedan ${remaining} registro(s) pendientes de confirmación en el servidor. Por seguridad de tus datos, la sesión no se cerrará hasta que todo quede respaldado.`,
                  type: 'destructive',
                });
              }
            } catch (err: any) {
              showAlert({
                title: 'Error de sincronización',
                message: err?.message || 'No fue posible confirmar todas las operaciones.',
                type: 'destructive',
              });
            }
          },
        },
      ],
    });
    return;
  }

  // Si no hay operaciones pendientes, diálogo estándar de confirmación
  showAlert({
    title,
    message,
    type: 'warning',
    buttons: [
      {text: 'Cancelar', style: 'cancel'},
      {
        text: confirmText,
        style: 'destructive',
        onPress: async () => {
          await performLogout(clearLocalData);
        },
      },
    ],
  });
}
