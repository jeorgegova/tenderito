import {useEffect, useState} from 'react';
import {getDbConnection, executeQuery} from '../database/db';
import {getActiveStoreId} from '../services/storeContext';

export function useDatabase() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const db = await getDbConnection();

        // Recuperar operaciones que pudieron haber quedado interrumpidas en estado 'syncing'
        // por un cierre inesperado de la aplicación, regresándolas a 'pending'
        await executeQuery(
          db,
          `UPDATE customers SET sync_status = 'pending', estadoServidor = 'pending'
           WHERE sync_status = 'syncing' OR estadoServidor = 'syncing';`,
        );
        await executeQuery(
          db,
          `UPDATE credits SET sync_status = 'pending', estadoServidor = 'pending'
           WHERE sync_status = 'syncing' OR estadoServidor = 'syncing';`,
        );
        await executeQuery(
          db,
          `UPDATE payments SET sync_status = 'pending', estadoServidor = 'pending'
           WHERE sync_status = 'syncing' OR estadoServidor = 'syncing';`,
        );

        // Inicializar contexto de tienda activa desde SQLite / persistencia local
        const storeId = await getActiveStoreId();
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

        if (mounted) {
          setIsReady(true);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return {isReady, error};
}
