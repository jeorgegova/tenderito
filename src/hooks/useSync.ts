import {useEffect, useState, useCallback} from 'react';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {useQueryClient} from '@tanstack/react-query';
import {syncAll, clearCachedStoreId} from '../services/sync';
import {supabase} from '../lib/supabase';
import {useAuth} from '../context/AuthContext';

export function useSync() {
  const {isAuthenticated, userType} = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(true);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  const runSync = useCallback(
    async (options?: {force?: boolean}) => {
      // Solo sincronizar SQLite local si el usuario es un tendero autenticado
      if (isSyncing || !isAuthenticated || userType !== 'store') {
        return;
      }
      try {
        setIsSyncing(true);
        const {pushed, pulled} = await syncAll(options);
        setLastSyncDate(new Date());

        // La expiración de suscripción puede cambiar aunque no haya
        // movimientos nuevos, así que refrescamos estos estados siempre.
        await queryClient.invalidateQueries({queryKey: ['free-portfolio']});
        await queryClient.invalidateQueries({queryKey: ['profile']});

        // Solo invalidar si hubo subida o descarga de datos real
        if (pushed || pulled) {
          await queryClient.invalidateQueries();
        }
      } catch (e) {
        console.warn('Error durante sincronización:', e);
      } finally {
        setIsSyncing(false);
      }
    },
    [isSyncing, isAuthenticated, userType, queryClient],
  );

  useEffect(() => {
    if (!isAuthenticated || userType !== 'store') {
      return;
    }

    // Sincronización inicial al montar la app
    runSync();

    // Escucha cambios de conectividad de red
    const unsubscribeNet = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(
        state.isConnected && state.isInternetReachable !== false,
      );
      setIsOnline(online);

      // Si recupera conexión a internet, sincronizar automáticamente
      if (online) {
        runSync();
      }
    });

    // Escucha eventos de inicio de sesión para sincronizar datos inmediatamente
    const {data: authSub} = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          clearCachedStoreId();
          runSync({force: true});
        } else if (event === 'SIGNED_OUT') {
          clearCachedStoreId();
        }
      },
    );

    return () => {
      unsubscribeNet();
      authSub.subscription.unsubscribe();
    };
  }, [runSync, isAuthenticated, userType]);

  return {
    sync: runSync,
    isSyncing,
    isOnline,
    lastSyncDate,
  };
}
