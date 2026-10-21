import {showAlert} from '../components/ui/AlertModal';
import {clearLocalDatabase} from '../database/db';
import {useStore} from '../store/useStore';
import {supabase} from './supabase';
import {unregister_fcm_token} from '../services/deviceService';

/** Mensaje de confirmación para el acceso de clientes (portal). */
export const CUSTOMER_LOGOUT_MESSAGE =
  'Tendrás que ingresar nuevamente con tu número de documento y contraseña.';

interface LogoutOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  /** Limpia las tablas locales del negocio antes de salir (default: true). */
  clearLocalData?: boolean;
}

/**
 * Cierra la sesión activa: desvincula el dispositivo de Supabase,
 * limpia los datos locales del negocio (opcional), cierra la sesión
 * en Supabase y restablece el perfil en memoria.
 */
export async function performLogout(clearLocalData = true): Promise<void> {
  try {
    // 1. Desvincular el dispositivo en Supabase antes de cerrar la sesión
    await unregister_fcm_token().catch(err => {
      console.warn('[session] Error desvinculando dispositivo en logout:', err);
    });

    if (clearLocalData) {
      await clearLocalDatabase();
    }
    await supabase.auth.signOut();
    useStore.getState().setProfile(null);
  } catch (error: any) {
    showAlert('No se pudo cerrar sesión', error?.message);
  }
}

/**
 * Muestra la confirmación antes de cerrar sesión.
 * Reutilizable desde el perfil, el portal de clientes y el botón físico "Atrás".
 */
export function confirmLogout(options: LogoutOptions = {}): void {
  const {
    title = '¿Seguro que deseas cerrar sesión?',
    message = 'Tendrás que volver a iniciar sesión para acceder a tu tienda.',
    confirmText = 'Cerrar sesión',
    clearLocalData = true,
  } = options;

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
