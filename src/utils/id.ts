/**
 * Generador de UUID v4 para identificadores locales de base de datos.
 * Seguro para uso en modo offline antes de sincronizar con el servidor.
 */
export function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
