// Design tokens — Tenderito
// Identidad: naranja cálido de tienda de barrio, tipografía legible, fondo neutro cálido.
// Pensada para tenderos con poca experiencia digital, lectura rápida de números.

export const Colors = {
  // Marca — naranja vivo del logo (anillos, checkmark, acentos)
  primary:        '#FF7A00',   // naranja principal brillante del logo
  primaryDark:    '#EA580C',   // hover / pressed
  primaryLight:   '#FFF7ED',   // fondos suaves naranja para chips/badges
  primaryMid:     '#FFEDD5',   // bordes suaves naranja

  // Fondos limpios y modernos (blanco nítido, libre de tonos amarillentos/cafés)
  background:     '#F8FAFC',   // Slate-50: fondo ultra limpio, moderno y fresco
  card:           '#FFFFFF',   // Blanco puro (como la libreta del logo)
  cardAlt:        '#F1F5F9',   // Slate-100: fondos neutros de soporte

  // Texto de alto contraste y legibilidad (inspirado en la tipografía 'Tenderito' del logo)
  text:           '#0F172A',   // Slate-900: azul pizarra oscuro profundo
  textSecondary:  '#475569',   // Slate-600: gris neutro elegante
  textMuted:      '#94A3B8',   // Slate-400: hints y placeholders

  // Semánticos
  destructive:    '#DC2626',
  destructiveAlt: '#FEE2E2',   // fondo rojo suave
  success:        '#16A34A',
  successAlt:     '#DCFCE7',   // fondo verde suave
  warning:        '#D97706',
  warningAlt:     '#FEF3C7',

  // Bordes / separadores limpios
  border:         '#E2E8F0',   // Slate-200: bordes nítidos y ligeros
  borderStrong:   '#CBD5E1',   // Slate-300

  // Tab bar
  tabBar:         '#FFFFFF',
  tabInactive:    '#94A3B8',   // Slate-400
} as const;

export const Radius = {
  xs:   8,
  sm:   12,
  md:   16,
  lg:   20,
  xl:   24,
  full: 999,
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

export const Typography = {
  // Títulos grandes — para montos
  hero:    {fontSize: 36, fontWeight: '800' as const, letterSpacing: -1},
  h1:      {fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5},
  h2:      {fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3},
  h3:      {fontSize: 18, fontWeight: '700' as const},
  body:    {fontSize: 15, fontWeight: '400' as const},
  label:   {fontSize: 13, fontWeight: '600' as const},
  caption: {fontSize: 11, fontWeight: '500' as const},
  eyebrow: {fontSize: 10, fontWeight: '800' as const, letterSpacing: 1.3},
} as const;

// Límites SaaS por plan
export const PLAN_LIMITS = {
  free:  10,
  basic: 100,
  pro:   Infinity,
} as const;

export type SubscriptionPlan = keyof typeof PLAN_LIMITS;

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}
