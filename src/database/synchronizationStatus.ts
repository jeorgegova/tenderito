/**
 * Estados de sincronización para soporte offline-first.
 * Basado en el patrón de dx_performance.
 */
export const ESTADO_SINCRONIZACION = Object.freeze({
  PENDIENTE_CREACION: 'pendiente_creacion',
  PENDIENTE_ACTUALIZACION: 'pendiente_actualizacion',
  SINCRONIZADO: 'sincronizado',
  ERROR: 'error',
} as const);

export type EstadoSincronizacion =
  (typeof ESTADO_SINCRONIZACION)[keyof typeof ESTADO_SINCRONIZACION];
