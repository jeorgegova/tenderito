import {useEffect, useState, useCallback} from 'react';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {useQueryClient} from '@tanstack/react-query';
import {
  syncAll,
  clearCachedStoreId,
  isSyncing as getIsSyncing,
  subscribeSyncStatus,
  onSyncComplete,
} from '../services/sync';
import {supabase} from '../lib/supabase';
import {useAuth} from '../context/AuthContext';

export function useSync() {
  const {isAuthenticated, userType} = useAuth();
  const [isSyncing, setIsSyncing] = useState<boolean>(getIsSyncing());
  const [isOnline, setIsOnline] = useState<boolean | null>(true);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeSyncStatus(setIsSyncing);
  }, []);

  const invalidateDomainQueries = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    return onSyncComplete(async ({pushed, pulled}) => {
      if (pushed || pulled) {
        await invalidateDomainQueries();
      }
    });
  }, [invalidateDomainQueries]);

  const runSync = useCallback(
    async (options?: {force?: boolean}) => {
      // Solo sincronizar SQLite local si el usuario es un tendero autenticado
      if (getIsSyncing() || !isAuthenticated || userType !== 'store') {
        return;
      }
      try {
        const {pushed, pulled} = await syncAll(options);
        setLastSyncDate(new Date());

        if (options?.force || pushed || pulled) {
          await invalidateDomainQueries();
        } else {
          await queryClient.invalidateQueries({queryKey: ['free-portfolio']});
          await queryClient.invalidateQueries({queryKey: ['profile']});
        }
      } catch (e) {
        console.warn('Error durante sincronización:', e);
      }
    },
    [isAuthenticated, userType, invalidateDomainQueries, queryClient],
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
