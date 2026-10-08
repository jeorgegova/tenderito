// Utilidades formato reutilizables — Tenderito
// FormatMoney: miles con coma, prefijo $ / $ -
// formatDate / formatDateTime: Supabase guarda UTC, app muestra America/Bogota (UTC-5 fijo)

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
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const BOGOTA_TZ = 'America/Bogota';

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(
  value: string | Date | null | undefined,
  timeZone: string = BOGOTA_TZ,
): string {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone: string = BOGOTA_TZ,
): string {
  const d = toDate(value);
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
