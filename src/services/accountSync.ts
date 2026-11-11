import {clearLocalDatabase} from '../database/db';
import {queryClient} from '../lib/queryClient';
import {useStore} from '../store/useStore';
import {
  getLastAuthUserId,
  setLastAuthUserId,
  clearStoreContext,
  fetchUserStores,
  setActiveStoreId,
} from './storeContext';
import {sincronizar} from './sync';

/**
 * Compara la identidad del usuario autenticado con la identidad asociada a los datos locales.
 *
 * Si corresponden al mismo usuario:
 * - Conserva los datos locales en SQLite para soporte 100% Offline-First.
 * - No borra nada.
 *
 * Si corresponden a usuarios diferentes (o primer registro):
 * - Ejecuta un proceso controlado de cambio de cuenta.
 * - Limpia las tablas locales SQLite del usuario anterior (clientes, créditos, abonos, cursores).
 * - Limpia la caché en memoria de React Query.
 * - Restablece el perfil y estados en Zustand.
 * - Limpia el contexto de tienda anterior.
 * - Actualiza la identidad asociada al almacenamiento local.
 * - Descarga las tiendas autorizadas del nuevo usuario.
 * - Ejecuta sincronización completa ({force: true}) para descargar la información del nuevo usuario.
 */
export async function handleUserSessionSwitch(
  currentUserId: string,
  userType?: string | null,
): Promise<{switched: boolean}> {
  try {
    const lastUserId = await getLastAuthUserId();

    if (!lastUserId) {
      // Primer inicio de sesión registrado en el dispositivo
      await setLastAuthUserId(currentUserId);
      if (userType !== 'customer') {
        const stores = await fetchUserStores();
        if (stores.length > 0) {
          await setActiveStoreId(stores[0].store_id);
        }
      }
      return {switched: false};
    }

    if (lastUserId === currentUserId) {
      // Mismo usuario: conservar datos locales offline
      return {switched: false};
    }

    // Usuario diferente: Proceso controlado de cambio de cuenta
    console.log(
      `[AccountSync] Cambio de usuario detectado: ${lastUserId} -> ${currentUserId}. Limpiando datos del usuario anterior...`,
    );

    // 1. Limpiar datos locales SQLite del usuario anterior
    await clearLocalDatabase();

    // 2. Limpiar caché de React Query antes de activar el nuevo usuario
    queryClient.clear();

    // 3. Limpiar Zustand store
    useStore.getState().setProfile(null);
    useStore.getState().setCustomerSearch('');

    // 4. Limpiar contexto de tienda anterior
    await clearStoreContext();

    // 5. Actualizar la identidad asociada al almacenamiento local
    await setLastAuthUserId(currentUserId);

    // Si es cliente, no administra tiendas locales en SQLite
    if (userType === 'customer') {
      return {switched: true};
    }

    // 6. Consultar tiendas del nuevo tendero y fijar la primera activa
    const stores = await fetchUserStores();
    if (stores.length > 0) {
      await setActiveStoreId(stores[0].store_id);
    }

    // 7. Descargar datos frescos del nuevo tendero para funcionamiento offline
    await sincronizar({force: true});

    return {switched: true};
  } catch (error: any) {
    console.warn(
      '[AccountSync] Error en proceso controlado de cambio de cuenta:',
      error?.message,
    );
    return {switched: true};
  }
}

