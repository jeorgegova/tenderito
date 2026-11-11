// Utilidades formato reutilizables — Tenderito
// FormatMoney: miles con coma, prefijo $ / $ -
// formatDate / formatDateTime: Supabase guarda UTC, app opera en Colombia (America/Bogota, UTC-5)

export const FormatMoney = (value: number | string | null | undefined): string => {
  const str = (value ?? '0').toString();
  const negative = str.trim().startsWith('-') || Number(str) < 0;
  const numericValue = str.replace(/[^0-9]/g, '');
  if (!numericValue) return '$ 0';
  const formatted = parseInt(numericValue, 10)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '$ -' : '$ ') + formatted;
};

// Inverso FormatMoney estilo bcan: "$ 1,000" -> 1000. Vacío/"$ "/"$" -> 0.
export const parseMoney = (
  value: number | string | null | undefined,
): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const str = String(value).trim();
  const negative = str.startsWith('-');
  const numericOnly = str.replace(/[^0-9]/g, '');
  if (!numericOnly) return 0;
  const n = parseInt(numericOnly, 10);
  return Number.isFinite(n) ? (negative ? -n : n) : 0;
};

export const BOGOTA_TZ = 'America/Bogota';

/**
 * Convierte cualquier fecha (string UTC de Supabase, ISO, YYYY-MM-DD o Date)
 * a un objeto Date seguro garantizando que las fechas YYYY-MM-DD no sufran desfase horario.
 */
export function toBogotaDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (!str || str.toLowerCase().includes('infinity')) {
    return null;
  }
  // Si es solo fecha YYYY-MM-DD (ej: due_date), forzar mediodía en Colombia (-05:00) para no retroceder de día
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T12:00:00-05:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Retorna la fecha de hoy en Colombia en formato 'AAAA-MM-DD' (UTC-5)
 */
export function getBogotaTodayYMD(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (_e) {
    const now = new Date();
    const utc5Ms = now.getTime() - 5 * 60 * 60 * 1000;
    return new Date(utc5Ms).toISOString().slice(0, 10);
  }
}

/**
 * Retorna la fecha de hace N días en Colombia en formato 'AAAA-MM-DD' (UTC-5)
 */
export function getBogotaDaysAgoYMD(days: number): string {
  const todayYMD = getBogotaTodayYMD();
  const d = new Date(`${todayYMD}T12:00:00-05:00`);
  d.setDate(d.getDate() - days);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (_e) {
    const ms = d.getTime() - 5 * 60 * 60 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * Retorna la clave del mes actual en Colombia en formato 'AAAA-MM'
 */
export function getBogotaCurrentMonthKey(): string {
  return getBogotaTodayYMD().slice(0, 7);
}

/**
 * Retorna la clave 'AAAA-MM' para una fecha dada en la zona horaria de Colombia
 */
export function getBogotaMonthKey(dateInput?: string | Date | null): string {
  if (!dateInput) return getBogotaCurrentMonthKey();
  const d = toBogotaDate(dateInput);
  if (!d) return getBogotaCurrentMonthKey();
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
    }).format(d);
  } catch (_e) {
    return dateInput.toString().slice(0, 7);
  }
}

/**
 * Formatea una fecha en Colombia (ej: '11/11/2026')
 */
export function formatDate(
  value: string | Date | null | undefined,
  timeZone: string = BOGOTA_TZ,
): string {
  const d = toBogotaDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Formatea una fecha y hora en Colombia (ej: '11/11/2026, 04:30 p.m.')
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone: string = BOGOTA_TZ,
): string {
  const d = toBogotaDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Formato amigable de fecha para listas y detalles en Colombia (ej: '11 nov. 2026')
 */
export function formatDateDisplay(
  value: string | Date | null | undefined,
  timeZone: string = BOGOTA_TZ,
): string {
  const d = toBogotaDate(value);
  if (!d) return typeof value === 'string' && !value.toLowerCase().includes('infinity') ? value : 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Verifica si una fecha de vencimiento ('AAAA-MM-DD') ya venció según el día de hoy en Colombia
 */
export function isOverdueBogota(dueDateStr?: string | null): boolean {
  if (!dueDateStr) return false;
  const cleanDate = String(dueDateStr).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return false;
  return cleanDate < getBogotaTodayYMD();
}

/**
 * Calcula los límites ISO UTC para consultar un mes ('AAAA-MM') respetando la zona horaria de Colombia
 */
export function getBogotaMonthRangeUtc(monthKey: string): { startUtc: string; endUtc: string } {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonthNum = month === 12 ? 1 : month + 1;

  const mStr = String(month).padStart(2, '0');
  const nextMStr = String(nextMonthNum).padStart(2, '0');

  const startUtc = new Date(`${year}-${mStr}-01T00:00:00-05:00`).toISOString();
  const endUtc = new Date(`${nextMonthYear}-${nextMStr}-01T00:00:00-05:00`).toISOString();

  return { startUtc, endUtc };
}
