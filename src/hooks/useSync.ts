import {useEffect, useState, useCallback} from 'react';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {useQueryClient} from '@tanstack/react-query';
import {syncAll} from '../services/sync';

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(true);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  const runSync = useCallback(async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      await syncAll();
      setLastSyncDate(new Date());

      // Invalida la caché de React Query para refrescar pantallas
      await queryClient.invalidateQueries();
    } catch (e) {
      console.warn('Error durante sincronización:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queryClient]);

  useEffect(() => {
    // Escucha cambios de conectividad de red
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      // Si recupera conexión a internet, sincronizar automáticamente
      if (online) {
        runSync();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [runSync]);

  return {
    sync: runSync,
    isSyncing,
    isOnline,
    lastSyncDate,
  };
}
