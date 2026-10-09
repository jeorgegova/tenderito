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
