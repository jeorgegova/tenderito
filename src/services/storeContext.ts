import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { UserStore } from '../types';
import { getDbConnection, getData, executeQuery } from '../database/db';
import { getConfigParam, saveConfigParam } from '../database/tables/metadata';

const ACTIVE_STORE_KEY = '@tenderito_active_store_id';
const LAST_USER_KEY = '@tenderito_last_user_id';

let memoryStoreId: string | null = null;
let initPromise: Promise<string | null> | null = null;

/**
 * Obtiene el ID de la tienda activa actual.
 * Prioridad:
 * 1. Memoria en tiempo de ejecución.
 * 2. Almacenamiento persistente local (AsyncStorage) - funciona 100% offline.
 * 3. Fallback Offline en SQLite: parametrizacion, tabla customers o credits.
 * 4. Consulta a Supabase si hay sesión y red disponible (persistiendo el resultado).
 */
export async function getActiveStoreId(): Promise<string | null> {
  if (memoryStoreId) {
    return memoryStoreId;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // 1. Intentar leer desde AsyncStorage (rápido y offline)
      const stored = await AsyncStorage.getItem(ACTIVE_STORE_KEY);
      if (stored && stored.trim() !== '' && stored !== 'null') {
        memoryStoreId = stored;
        return memoryStoreId;
      }

      // 2. Fallback Offline: Buscar en SQLite
      try {
        const db = await getDbConnection();

        // 2a. Parametrización local
        const cfgStore = await getConfigParam(db, 'active_store_id');
        if (cfgStore && cfgStore.trim() !== '' && cfgStore !== 'null') {
          memoryStoreId = cfgStore;
          await AsyncStorage.setItem(ACTIVE_STORE_KEY, cfgStore);
          return memoryStoreId;
        }

        // 2b. Tabla customers local
        const custStore = await getData(
          db,
          "SELECT store_id FROM customers WHERE store_id IS NOT NULL AND store_id != '' AND store_id != 'null' LIMIT 1;",
        );
        if (custStore.length > 0 && custStore[0].store_id) {
          const storeFound: string = custStore[0].store_id;
          memoryStoreId = storeFound;
          await AsyncStorage.setItem(ACTIVE_STORE_KEY, storeFound);
          await saveConfigParam(db, 'active_store_id', storeFound);
          return memoryStoreId;
        }

        // 2c. Tabla credits local
        const credStore = await getData(
          db,
          "SELECT store_id FROM credits WHERE store_id IS NOT NULL AND store_id != '' AND store_id != 'null' LIMIT 1;",
        );
        if (credStore.length > 0 && credStore[0].store_id) {
          const storeFound: string = credStore[0].store_id;
          memoryStoreId = storeFound;
          await AsyncStorage.setItem(ACTIVE_STORE_KEY, storeFound);
          await saveConfigParam(db, 'active_store_id', storeFound);
          return memoryStoreId;
        }
      } catch (_sqlErr) {}

      // 3. Si no hay tienda guardada localmente, consultar en Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('store_memberships')
        .select('store_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data?.store_id) {
        memoryStoreId = data.store_id;
        await AsyncStorage.setItem(ACTIVE_STORE_KEY, data.store_id);
        try {
          const db = await getDbConnection();
          await saveConfigParam(db, 'active_store_id', data.store_id);
        } catch (_dbErr) {}
        return memoryStoreId;
      }
    } catch (_e) {
      // Sin red o error al consultar Supabase
    } finally {
      initPromise = null;
    }
    return null;
  })();

  return initPromise;
}

/**
 * Establece la tienda activa actual, actualizando memoria, AsyncStorage y SQLite.
 * Si existen registros creados offline sin store_id, los asocia de inmediato a esta tienda.
 */
export async function setActiveStoreId(storeId: string): Promise<void> {
  memoryStoreId = storeId;
  try {
    await AsyncStorage.setItem(ACTIVE_STORE_KEY, storeId);
    const db = await getDbConnection();
    await saveConfigParam(db, 'active_store_id', storeId);

    // Reconciliar cualquier registro creado offline que no tenía store_id asignado
    if (storeId) {
      await executeQuery(
        db,
        "UPDATE customers SET store_id = ? WHERE store_id IS NULL OR store_id = '' OR store_id = 'null';",
        [storeId],
      );
      await executeQuery(
        db,
        "UPDATE credits SET store_id = ? WHERE store_id IS NULL OR store_id = '' OR store_id = 'null';",
        [storeId],
      );
      await executeQuery(
        db,
        "UPDATE payments SET store_id = ? WHERE store_id IS NULL OR store_id = '' OR store_id = 'null';",
        [storeId],
      );
    }
  } catch (e: any) {
    console.warn('[storeContext] Error guardando tienda activa:', e?.message);
  }
}

/**
 * Limpia el caché en memoria y la persistencia de la tienda activa.
 */
export async function clearStoreContext(): Promise<void> {
  memoryStoreId = null;
  initPromise = null;
  try {
    await AsyncStorage.removeItem(ACTIVE_STORE_KEY);
    const db = await getDbConnection();
    await saveConfigParam(db, 'active_store_id', '');
  } catch (_e) {}
}

/**
 * Consulta todas las tiendas a las que tiene acceso el usuario autenticado.
 */
export async function fetchUserStores(): Promise<UserStore[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('store_memberships')
      .select('store_id, role, stores(id, store_name, phone, address, subscription_plan)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return (data as any[]).map(row => {
      const s = row.stores || {};
      return {
        store_id: row.store_id,
        role: row.role || 'owner',
        store_name: s.store_name || 'Mi Tienda',
        phone: s.phone || null,
        address: s.address || null,
        subscription_plan: s.subscription_plan || 'free',
      };
    });
  } catch (_e) {
    return [];
  }
}

/**
 * Obtiene el ID del último usuario autenticado que utilizó el almacenamiento local.
 */
export async function getLastAuthUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_USER_KEY);
  } catch (_e) {
    return null;
  }
}

/**
 * Guarda o limpia el ID del usuario actualmente asociado a los datos locales.
 */
export async function setLastAuthUserId(userId: string | null): Promise<void> {
  try {
    if (userId) {
      await AsyncStorage.setItem(LAST_USER_KEY, userId);
    } else {
      await AsyncStorage.removeItem(LAST_USER_KEY);
    }
  } catch (_e) {}
}

