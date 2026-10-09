/**
 * Tabla local de créditos / fiados.
 * Permite registrar créditos aun si el dispositivo está sin conexión.
 */
export async function createCreditsTable(db: any) {
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS credits (
      local_id TEXT PRIMARY KEY,
      server_id TEXT UNIQUE,
      customer_id TEXT NOT NULL,
      store_id TEXT,
      concept TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      sync_status TEXT NOT NULL DEFAULT 'sincronizado',
      payload TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT
    );
  `);

  await db.executeAsync(
    'CREATE INDEX IF NOT EXISTS idx_credits_sync_status ON credits(sync_status);',
  );
  await db.executeAsync(
    'CREATE INDEX IF NOT EXISTS idx_credits_customer_id ON credits(customer_id);',
  );
}
