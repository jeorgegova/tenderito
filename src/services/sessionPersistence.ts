import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { getDbConnection, getData } from '../database/db';
import { getConfigParam, saveConfigParam } from '../database/tables/metadata';

export const OFFLINE_SESSION_STORAGE_KEY = '@tenderito_offline_session';
export const EXPLICIT_LOGOUT_STORAGE_KEY = '@tenderito_explicit_logout';

export type UserType = 'store' | 'customer';

export interface OfflineSessionData {
  userId: string;
  email: string;
  userType: UserType;
  storeId?: string | null;
  userMetadata?: any;
  appMetadata?: any;
  accessToken?: string;
  refreshToken?: string;
  updatedAt: string;
}

/**
 * Determina el tipo de usuario ('customer' | 'store') a partir de metadata.
 */
export function resolveUserType(user: User | null): UserType {
  if (!user) return 'store';
  const type =
    user.app_metadata?.user_type || user.user_metadata?.user_type;
  return type === 'customer' ? 'customer' : 'store';
}

/**
 * Guarda o actualiza la sesión offline en almacenamiento persistente (AsyncStorage y SQLite).
 */
export async function saveOfflineSession(params: {
  session?: Session | null;
  user?: User | null;
  userType?: UserType | null;
  storeId?: string | null;
}): Promise<void> {
  try {
    const user = params.user || params.session?.user;
    if (!user?.id) return;

    const userType = params.userType || resolveUserType(user);
    const email = user.email || user.user_metadata?.email || '';

    const data: OfflineSessionData = {
      userId: user.id,
      email,
      userType,
      storeId: params.storeId || null,
      userMetadata: user.user_metadata || {},
      appMetadata: user.app_metadata || {},
      accessToken: params.session?.access_token,
      refreshToken: params.session?.refresh_token,
      updatedAt: new Date().toISOString(),
    };

    // 1. Guardar en AsyncStorage
    await AsyncStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, 'false');

    // 2. Guardar en SQLite (parametrización) para máxima resiliencia ante reinicios o updates de la app
    try {
      const db = await getDbConnection();
      await saveConfigParam(db, 'offline_session_json', JSON.stringify(data));
      await saveConfigParam(db, 'auth_user_id', user.id);
      await saveConfigParam(db, 'auth_user_email', email);
      await saveConfigParam(db, 'auth_user_type', userType);
      await saveConfigParam(db, 'is_logged_out', '0');
    } catch (_dbErr) {
      // Si la BD local aún se está iniciando, no bloquea
    }
  } catch (err) {
    console.warn('[sessionPersistence] Error guardando sesión offline:', err);
  }
}

/**
 * Marca que el usuario cerró sesión de forma intencional y explícita.
 */
export async function markExplicitLogout(): Promise<void> {
  try {
    await AsyncStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, 'true');
    await AsyncStorage.removeItem(OFFLINE_SESSION_STORAGE_KEY);

    try {
      const db = await getDbConnection();
      await saveConfigParam(db, 'is_logged_out', '1');
      await saveConfigParam(db, 'offline_session_json', '');
    } catch (_dbErr) {}
  } catch (err) {
    console.warn('[sessionPersistence] Error marcando logout explícito:', err);
  }
}

/**
 * Verifica si el usuario realizó un cierre de sesión explícito.
 */
export async function isExplicitLogout(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY);
    if (flag === 'true') return true;

    try {
      const db = await getDbConnection();
      const dbFlag = await getConfigParam(db, 'is_logged_out');
      if (dbFlag === '1') return true;
    } catch (_e) {}

    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Recupera la sesión local offline.
 * Si el usuario no hizo un logout explícito y existen datos en la BD local o en storage,
 * reconstruye la sesión activa para evitar que se solicite contraseña.
 */
export async function getPersistedOfflineSession(): Promise<OfflineSessionData | null> {
  try {
    const loggedOut = await isExplicitLogout();
    if (loggedOut) {
      return null;
    }

    // 1. Intentar desde AsyncStorage
    const stored = await AsyncStorage.getItem(OFFLINE_SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OfflineSessionData;
        if (parsed?.userId) {
          return parsed;
        }
      } catch (_jsonErr) {}
    }

    // 2. Fallback: Intentar desde SQLite parametrizacion
    try {
      const db = await getDbConnection();
      const dbSessionStr = await getConfigParam(db, 'offline_session_json');
      if (dbSessionStr) {
        try {
          const parsed = JSON.parse(dbSessionStr) as OfflineSessionData;
          if (parsed?.userId) {
            await AsyncStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, dbSessionStr);
            await AsyncStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, 'false');
            return parsed;
          }
        } catch (_jsonErr) {}
      }

      // 3. Fallback: Buscar parámetros individuales en parametrización
      const authUserId = await getConfigParam(db, 'auth_user_id');
      if (authUserId) {
        const authEmail = (await getConfigParam(db, 'auth_user_email')) || '';
        const authUserType = ((await getConfigParam(db, 'auth_user_type')) as UserType) || 'store';
        const activeStoreId = await getConfigParam(db, 'active_store_id');

        const recovered: OfflineSessionData = {
          userId: authUserId,
          email: authEmail,
          userType: authUserType,
          storeId: activeStoreId || null,
          updatedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, JSON.stringify(recovered));
        await AsyncStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, 'false');
        return recovered;
      }

      // 4. Fallback final: Si la BD local tiene datos (clientes o tienda activa guardada),
      // recuperar la identidad del tendero para no cerrar sesión jamás
      const custStore = await getData(
        db,
        "SELECT store_id FROM customers WHERE store_id IS NOT NULL AND store_id != '' LIMIT 1;",
      );
      const lastUser = await AsyncStorage.getItem('@tenderito_last_user_id');
      if (lastUser && custStore.length > 0) {
        const recovered: OfflineSessionData = {
          userId: lastUser,
          email: '',
          userType: 'store',
          storeId: custStore[0].store_id,
          updatedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, JSON.stringify(recovered));
        await AsyncStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, 'false');
        return recovered;
      }
    } catch (_dbErr) {
      console.warn('[sessionPersistence] Error leyendo fallback en BD local:', _dbErr);
    }

    return null;
  } catch (err) {
    console.warn('[sessionPersistence] Error en getPersistedOfflineSession:', err);
    return null;
  }
}

/**
 * Construye un objeto Session y User válido de Supabase a partir de la sesión offline,
 * con vigencia extendida para permitir navegación y consultas offline sin restricciones.
 */
export function buildSyntheticSession(offline: OfflineSessionData): Session {
  const user: User = {
    id: offline.userId,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
      user_type: offline.userType,
      ...(offline.appMetadata || {}),
    },
    user_metadata: {
      user_type: offline.userType,
      email: offline.email,
      ...(offline.userMetadata || {}),
    },
    aud: 'authenticated',
    created_at: offline.updatedAt || new Date().toISOString(),
    email: offline.email || undefined,
    phone: '',
    role: 'authenticated',
    updated_at: new Date().toISOString(),
  };

  const syntheticSession: Session = {
    access_token: offline.accessToken || 'offline_cached_token',
    token_type: 'bearer',
    expires_in: 31536000, // 1 año offline
    expires_at: Math.floor(Date.now() / 1000) + 31536000,
    refresh_token: offline.refreshToken || 'offline_refresh_token',
    user,
  };

  return syntheticSession;
}
