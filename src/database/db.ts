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
 * Ejecuta un bloque de operaciones dentro de una transacción atómica SQLite.
 * Si alguna sentencia falla, revierte (ROLLBACK) automáticamente todos los cambios.
 */
export async function executeInTransaction(
  db: QuickSQLiteConnection,
  fn: () => Promise<void>,
): Promise<void> {
  await db.executeAsync('BEGIN TRANSACTION;');
  try {
    await fn();
    await db.executeAsync('COMMIT;');
  } catch (err) {
    try {
      await db.executeAsync('ROLLBACK;');
    } catch (_rbErr) {}
    throw err;
  }
}

/**
 * Limpia las tablas locales de datos de negocio al cerrar sesión
 * para asegurar el aislamiento estricto entre tiendas en el mismo dispositivo.
 */
export async function clearLocalDatabase() {
  try {
    const db = await getDbConnection();
    await executeQuery(db, 'DELETE FROM payments;');
    await executeQuery(db, 'DELETE FROM credits;');
    await executeQuery(db, 'DELETE FROM customers;');
    // Limpiar cursores de sincronización y parámetros de usuario, pero preservar schema_version
    await executeQuery(db, "DELETE FROM parametrizacion WHERE nombre != 'schema_version';");
  } catch (e: any) {
    console.warn('[DB] Error limpiando base de datos local:', e?.message);
  }
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
