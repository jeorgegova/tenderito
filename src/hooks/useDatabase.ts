import {useEffect, useState} from 'react';
import {getDbConnection} from '../database/db';

export function useDatabase() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await getDbConnection();
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
