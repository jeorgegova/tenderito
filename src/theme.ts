// Design tokens estilo Apple / iOS moderno — Tenderito
// Paleta: Naranja marca, blanco/superficies, rojo alerta, neutros.

export const Colors = {
  primary: "#FF6B00",
  primaryAlt: "#F97316",
  background: "#F2F2F7", // iOS grouped
  card: "#FFFFFF",
  cardAlt: "#F8F9FA",
  destructive: "#DC2626",
  destructiveAlt: "#EF4444",
  text: "#111827",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
  success: "#16A34A",
  warning: "#F59E0B",
} as const;

export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  full: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// Límites SaaS por plan
export const PLAN_LIMITS = {
  free: 10,
  basic: 100,
  pro: Infinity,
} as const;

export type SubscriptionPlan = keyof typeof PLAN_LIMITS;

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
