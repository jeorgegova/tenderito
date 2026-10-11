/**
 * Estados de sincronización para soporte offline-first.
 * Manejo de estados de sincronización: 'pendiente' y 'sincronizado'.
 */
export const ESTADO_SINCRONIZACION = Object.freeze({
  PENDIENTE: 'pendiente',
  SINCRONIZADO: 'sincronizado',
  ERROR: 'error',
  // Retrocompatibilidad con código existente
  PENDIENTE_CREACION: 'pendiente',
  PENDIENTE_ACTUALIZACION: 'pendiente',
} as const);

export type EstadoServidor = 'pendiente' | 'sincronizado' | 'error';
export type EstadoSincronizacion = EstadoServidor;

