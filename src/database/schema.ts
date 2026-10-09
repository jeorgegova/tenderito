import {createCustomersTable} from './tables/customers';
import {createCreditsTable} from './tables/credits';
import {createPaymentsTable} from './tables/payments';
import {createMetadataTable} from './tables/metadata';

export const DATABASE_VERSION = '1.0';

/**
 * Crea las tablas base de la base de datos local si no existen.
 */
export async function createBaseTables(db: any) {
  await createMetadataTable(db);
  await createCustomersTable(db);
  await createCreditsTable(db);
  await createPaymentsTable(db);
}

/**
 * Guarda o actualiza la versión del esquema en la tabla de metadata.
 */
export async function saveSchemaVersion(db: any, version: string) {
  const now = new Date().toISOString();
  await db.executeAsync(
    `INSERT INTO parametrizacion (nombre, valor, updated_at)
     VALUES ('schema_version', ?, ?)
     ON CONFLICT(nombre) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at;`,
    [version, now],
  );
}

/**
 * Obtiene la versión actual del esquema almacenada localmente.
 */
export async function getSchemaVersion(db: any): Promise<string | null> {
  try {
    const res = await db.executeAsync(
      "SELECT valor FROM parametrizacion WHERE nombre = 'schema_version' LIMIT 1;",
    );
    if (res?.rows?.length > 0) {
      return res.rows.item(0).valor;
    }
    return null;
  } catch (_e) {
    return null;
  }
}
