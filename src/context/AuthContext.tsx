import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { performLogout } from '../lib/session';
import { handleUserSessionSwitch } from '../services/accountSync';
import {
  saveOfflineSession,
  markExplicitLogout,
  isExplicitLogout,
  getPersistedOfflineSession,
  buildSyntheticSession,
  resolveUserType,
  type UserType,
} from '../services/sessionPersistence';

export type { UserType };

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  userType: UserType | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback(async (nextSession: Session | null) => {
    if (nextSession?.user) {
      const currentUser = nextSession.user;
      const type = resolveUserType(currentUser);

      setSession(nextSession);
      setUser(currentUser);
      setUserType(type);

      // Persistir de inmediato en almacenamiento offline (AsyncStorage y SQLite)
      await saveOfflineSession({
        session: nextSession,
        user: currentUser,
        userType: type,
      });

      if (currentUser.id) {
        try {
          await handleUserSessionSwitch(currentUser.id, type);
        } catch (err) {
          console.warn('[AuthContext] Error verificando usuario asociado:', err);
        }
      }
    } else {
      // Solo se nulifica la sesión si el usuario ejecutó un logout explícito
      const loggedOut = await isExplicitLogout();
      if (loggedOut) {
        setSession(null);
        setUser(null);
        setUserType(null);
      } else {
        // Si Supabase emitió null (por ej: fallo de red o token expirado en segundo plano)
        // pero NO hubo logout explícito, recuperamos o mantenemos la sesión offline
        const offline = await getPersistedOfflineSession();
        if (offline) {
          console.log('[AuthContext] Manteniendo sesión offline para:', offline.userId);
          const synth = buildSyntheticSession(offline);
          setSession(synth);
          setUser(synth.user);
          setUserType(offline.userType);
        } else {
          setSession(null);
          setUser(null);
          setUserType(null);
        }
      }
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session?.user) {
        await applySession(data.session);

        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (!userError && userData?.user) {
          setUser(userData.user);
          setUserType(resolveUserType(userData.user));
          await saveOfflineSession({
            session: data.session,
            user: userData.user,
          });
        }
      }
    } catch (err) {
      console.warn('[AuthContext] Error refrescando sesión (manteniendo sesión offline):', err);
    }
  }, [applySession]);

  useEffect(() => {
    let mounted = true;

    // 1. Inicialización resiliente: Supabase + Fallback Offline-First inmediato
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (initialSession?.user) {
          await applySession(initialSession);
          setIsLoading(false);

          // Verificación no bloqueante en background (no tumba la sesión si hay 401 o falta de red)
          supabase.auth.getUser().then(async ({ data: { user: verifiedUser }, error: userErr }) => {
            if (!mounted) return;
            if (!userErr && verifiedUser) {
              setUser(verifiedUser);
              setUserType(resolveUserType(verifiedUser));
              await saveOfflineSession({
                session: initialSession,
                user: verifiedUser,
              });
            }
          }).catch(() => {});
          return;
        }

        // Si Supabase no devolvió sesión (reinicio del dispositivo, app offline o token expirado):
        // Consultar el almacenamiento persistente y la BD local
        const offlineSession = await getPersistedOfflineSession();
        if (!mounted) return;

        if (offlineSession?.userId) {
          console.log('[AuthContext] Sesión Supabase ausente al iniciar, restaurando sesión offline:', offlineSession.userId);
          const synthetic = buildSyntheticSession(offlineSession);
          await applySession(synthetic);
          setIsLoading(false);

          // Intentar refresh silencioso en background cuando haya red
          supabase.auth.refreshSession().then(async ({ data: refreshed, error: refErr }) => {
            if (!mounted) return;
            if (!refErr && refreshed?.session) {
              await applySession(refreshed.session);
            }
          }).catch(() => {});
          return;
        }

        // Si no hay datos locales ni sesión previa: mostrar Login
        await applySession(null);
        setIsLoading(false);
      } catch (e) {
        console.warn('[AuthContext] Error en initAuth, intentando recuperar sesión offline:', e);
        if (!mounted) return;
        const offlineSession = await getPersistedOfflineSession();
        if (offlineSession?.userId) {
          const synthetic = buildSyntheticSession(offlineSession);
          await applySession(synthetic);
        } else {
          await applySession(null);
        }
        setIsLoading(false);
      }
    };

    initAuth();

    // 2. Suscribirse a cambios de estado de autenticación de Supabase
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      if (currentSession?.user) {
        await applySession(currentSession);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        // Verificar si fue logout explícito del usuario
        const loggedOut = await isExplicitLogout();
        if (loggedOut) {
          setSession(null);
          setUser(null);
          setUserType(null);
          setIsLoading(false);
        } else {
          console.log('[AuthContext] Evento SIGNED_OUT descartado por no ser explícito. Conservando sesión local.');
          const offline = await getPersistedOfflineSession();
          if (offline) {
            const synthetic = buildSyntheticSession(offline);
            await applySession(synthetic);
          }
          setIsLoading(false);
        }
      }
    });

    // 3. Manejo del ciclo de vida de la app (AppState) para el refresco del token
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [applySession]);

  const signOut = useCallback(async () => {
    await markExplicitLogout();
    await performLogout();
    setSession(null);
    setUser(null);
    setUserType(null);
  }, []);

  const value: AuthContextType = {
    session,
    user,
    userType,
    isLoading,
    isAuthenticated: !!session && !!user,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
