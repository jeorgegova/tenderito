/**
 * Tabla local de clientes.
 * Soporta creación y consulta offline con sincronización diferida hacia Supabase.
 */
export async function createCustomersTable(db: any) {
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      local_id TEXT PRIMARY KEY,
      server_id TEXT UNIQUE,
      store_id TEXT,
      name TEXT NOT NULL,
      document_type TEXT,
      document_number TEXT,
      phone TEXT,
      notes TEXT,
      alias TEXT,
      current_balance REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'sincronizado',
      payload TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT,
      deleted_at TEXT
    );
  `);

  await db.executeAsync(
    'CREATE INDEX IF NOT EXISTS idx_customers_sync_status ON customers(sync_status);',
  );
  await db.executeAsync(
    'CREATE INDEX IF NOT EXISTS idx_customers_server_id ON customers(server_id);',
  );
}
