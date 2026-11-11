/**
 * Estados de sincronización estandarizados para arquitectura Offline-First.
 * - pending: operación guardada en SQLite local y pendiente de enviar a Supabase.
 * - syncing: operación actualmente en proceso de transmisión.
 * - synced: operación confirmada y respaldada en Supabase.
 * - error: operación con error de transmisión pendiente de reintento.
 */
export const ESTADO_SINCRONIZACION = Object.freeze({
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',

  // Compatibilidad con registros existentes en español
  PENDIENTE: 'pending',
  SINCRONIZADO: 'synced',
  PENDIENTE_CREACION: 'pending',
  PENDIENTE_ACTUALIZACION: 'pending',
} as const);

export type EstadoServidor =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'pendiente'
  | 'sincronizado';

export type EstadoSincronizacion = EstadoServidor;

