import {open, QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {runMigrations} from './migrations';

let dbInstance: QuickSQLiteConnection | null = null;
let initPromise: Promise<QuickSQLiteConnection> | null = null;

/**
 * Obtiene o inicializa la conexión con la base de datos local SQLite.
 * Ejecuta migraciones de manera idempotente.
 */
export async function getDbConnection(): Promise<QuickSQLiteConnection> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = open({name: 'tenderito.db'});
      await runMigrations(db);
      dbInstance = db;
      return dbInstance;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Ejecuta una consulta SELECT y retorna un arreglo plano de objetos JavaScript.
 */
export async function getData<T = any>(
  db: QuickSQLiteConnection,
  query: string,
  params: any[] = [],
): Promise<T[]> {
  const result = await db.executeAsync(query, params);
  const rows: T[] = [];
  if (result?.rows) {
    const len = result.rows.length;
    for (let i = 0; i < len; i++) {
      rows.push(result.rows.item(i) as T);
    }
  }
  return rows;
}

/**
 * Ejecuta una consulta de escritura (INSERT, UPDATE, DELETE).
 */
export async function executeQuery(
  db: QuickSQLiteConnection,
  query: string,
  params: any[] = [],
) {
  return await db.executeAsync(query, params);
}

/**
 * Cierra la base de datos si está abierta.
 */
export function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (_e) {}
    dbInstance = null;
    initPromise = null;
  }
}
