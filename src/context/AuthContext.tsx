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

export type UserType = 'store' | 'customer';

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

function resolveUserType(user: User | null): UserType {
  if (!user) return 'store';
  // app_metadata es seguro y no modificable por el cliente. user_metadata sirve de fallback.
  const type =
    user.app_metadata?.user_type || user.user_metadata?.user_type;
  return type === 'customer' ? 'customer' : 'store';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback(async (nextSession: Session | null) => {
    const currentUser = nextSession?.user ?? null;
    const type = currentUser ? resolveUserType(currentUser) : null;

    if (currentUser?.id) {
      try {
        await handleUserSessionSwitch(currentUser.id, type);
      } catch (err) {
        console.warn('[AuthContext] Error verificando usuario asociado:', err);
      }
    }

    setSession(nextSession);
    setUser(currentUser);
    setUserType(type);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await applySession(data.session);

      // Verificación en segundo plano con el servidor de Supabase
      if (data.session) {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) {
          const status = (userError as any)?.status;
          if (status === 401 || status === 403) {
            await applySession(null);
          }
        } else if (userData.user) {
          setUser(userData.user);
          setUserType(resolveUserType(userData.user));
        }
      }
    } catch (err) {
      console.warn('[AuthContext] Error refrescando sesión:', err);
    }
  }, [applySession]);

  useEffect(() => {
    let mounted = true;

    // 1. Obtener la sesión almacenada en AsyncStorage (funciona 100% offline)
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;
      await applySession(initialSession);
      setIsLoading(false);

      // Verificación con el servidor en segundo plano
      if (initialSession) {
        supabase.auth.getUser().then(async ({ data: { user: verifiedUser }, error }) => {
          if (!mounted) return;
          if (error) {
            // Solo invalidar si el servidor rechazó las credenciales (401 / 403).
            // Si el error es de conexión o falta de internet, se mantiene la sesión
            // persistida en AsyncStorage para continuar trabajando sin conexión.
            const status = (error as any)?.status;
            if (status === 401 || status === 403) {
              await applySession(null);
            }
            return;
          }
          if (verifiedUser) {
            setUser(verifiedUser);
            setUserType(resolveUserType(verifiedUser));
          }
        });
      }
    });

    // 2. Suscribirse a cambios de estado de autenticación de Supabase
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mounted) return;
      await applySession(currentSession);
      setIsLoading(false);
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
    await performLogout();
    await applySession(null);
  }, [applySession]);

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

