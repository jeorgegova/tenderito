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
  {
    version: '1.1',
    description: 'Soporte offline-first: columna estadoServidor e índices',
    up: async (db: any) => {
      try {
        await db.executeAsync("ALTER TABLE customers ADD COLUMN estadoServidor TEXT DEFAULT 'sincronizado';");
      } catch (_e) {}
      try {
        await db.executeAsync("ALTER TABLE credits ADD COLUMN estadoServidor TEXT DEFAULT 'sincronizado';");
      } catch (_e) {}
      try {
        await db.executeAsync("ALTER TABLE payments ADD COLUMN estadoServidor TEXT DEFAULT 'sincronizado';");
      } catch (_e) {}
      try {
        await db.executeAsync("CREATE INDEX IF NOT EXISTS idx_customers_estado_servidor ON customers(estadoServidor);");
      } catch (_e) {}
      try {
        await db.executeAsync("CREATE INDEX IF NOT EXISTS idx_credits_estado_servidor ON credits(estadoServidor);");
      } catch (_e) {}
      try {
        await db.executeAsync("CREATE INDEX IF NOT EXISTS idx_payments_estado_servidor ON payments(estadoServidor);");
      } catch (_e) {}
    },
  },
  {
    version: '1.2',
    description: 'Soporte offline-first para planes de suscripción',
    up: async (db: any) => {
      try {
        await db.executeAsync(`
          CREATE TABLE IF NOT EXISTS subscription_plans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            price REAL NOT NULL DEFAULT 0,
            price_text TEXT NOT NULL DEFAULT '$0',
            customer_limit INTEGER NOT NULL DEFAULT 10,
            badge TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            updated_at TEXT
          );
        `);
      } catch (_e) {}
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
