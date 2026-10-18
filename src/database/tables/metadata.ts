/**
 * Tabla de parametrización / metadata de la base de datos local.
 * Almacena versión de esquema, cursores de sincronización y configuración.
 */
export async function createMetadataTable(db: any) {
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS parametrizacion (
      nombre TEXT PRIMARY KEY,
      valor TEXT,
      updated_at TEXT
    );
  `);
}

/**
 * Obtiene la última fecha de sincronización (writeDate) registrada para una tabla dada.
 */
export async function getWriteDate(db: any, tableName: string): Promise<string | null> {
  try {
    const res = await db.executeAsync(
      "SELECT valor FROM parametrizacion WHERE nombre = ? LIMIT 1;",
      [`writeDate_${tableName}`],
    );
    if (res?.rows?.length > 0) {
      return res.rows.item(0).valor;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Guarda o actualiza la última fecha de sincronización (writeDate) para una tabla dada.
 */
export async function saveWriteDate(db: any, tableName: string, writeDate: string): Promise<void> {
  const now = new Date().toISOString();
  await db.executeAsync(
    `INSERT INTO parametrizacion (nombre, valor, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(nombre) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at;`,
    [`writeDate_${tableName}`, writeDate, now],
  );
}

/**
 * Obtiene un valor de parametrización por clave.
 */
export async function getConfigParam(db: any, key: string): Promise<string | null> {
  try {
    const res = await db.executeAsync(
      "SELECT valor FROM parametrizacion WHERE nombre = ? LIMIT 1;",
      [key],
    );
    if (res?.rows?.length > 0) {
      return res.rows.item(0).valor;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Guarda o actualiza un valor de parametrización por clave.
 */
export async function saveConfigParam(db: any, key: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  await db.executeAsync(
    `INSERT INTO parametrizacion (nombre, valor, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(nombre) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at;`,
    [key, value, now],
  );
}


