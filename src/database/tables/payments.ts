/**
 * Tabla local de abonos / pagos.
 * Permite registrar pagos en modo offline y sincronizarlos cuando vuelva la conexión.
 */
export async function createPaymentsTable(db: any) {
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS payments (
      local_id TEXT PRIMARY KEY,
      server_id TEXT UNIQUE,
      customer_id TEXT NOT NULL,
      credit_id TEXT,
      store_id TEXT,
      amount REAL NOT NULL,
      notes TEXT,
      payment_date TEXT,
      sync_status TEXT NOT NULL DEFAULT 'sincronizado',
      payload TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT
    );
  `);

  await db.executeAsync(
    'CREATE INDEX IF NOT EXISTS idx_payments_sync_status ON payments(sync_status);',
  );
  await db.executeAsync(
    'CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);',
  );
}
