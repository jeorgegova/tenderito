import {createBaseTables, saveSchemaVersion, getSchemaVersion, DATABASE_VERSION} from './schema';

/**
 * Lista de migraciones ordenadas cronológicamente.
 */
interface Migration {
  version: string;
  description: string;
  up: (db: any) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: '1.0',
    description: 'Creación de tablas iniciales: customers, credits, payments, metadata',
    up: async (db: any) => {
      await createBaseTables(db);
    },
  },
];

/**
 * Ejecuta las migraciones pendientes en orden.
 */
export async function runMigrations(db: any): Promise<void> {
  const currentVersion = await getSchemaVersion(db);

  for (const migration of MIGRATIONS) {
    if (!currentVersion || compareVersions(migration.version, currentVersion) > 0) {
      await migration.up(db);
      await saveSchemaVersion(db, migration.version);
    }
  }

  // Asegurar que las tablas base siempre existan
  await createBaseTables(db);
  await saveSchemaVersion(db, DATABASE_VERSION);
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
