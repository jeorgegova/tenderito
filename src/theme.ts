// Design tokens — Tenderito
// Identidad: naranja cálido de tienda de barrio, tipografía legible, fondo neutro cálido.
// Pensada para tenderos con poca experiencia digital, lectura rápida de números.

export const Colors = {
  // Marca — naranja intenso del logo
  primary:        '#F97316',   // naranja principal
  primaryDark:    '#EA6A00',   // hover / pressed
  primaryLight:   '#FFF7ED',   // fondos suaves naranja
  primaryMid:     '#FFEDD5',   // chips activos

  // Fondos
  background:     '#FDF8F3',   // blanco cálido (no frío iOS)
  card:           '#FFFFFF',
  cardAlt:        '#FAF5EF',   // card secundaria

  // Texto
  text:           '#1C1008',   // casi negro con tono cálido
  textSecondary:  '#78624E',   // marrón medio, cálido
  textMuted:      '#B09880',   // hints

  // Semánticos
  destructive:    '#DC2626',
  destructiveAlt: '#FEE2E2',   // fondo rojo suave
  success:        '#16A34A',
  successAlt:     '#DCFCE7',   // fondo verde suave
  warning:        '#D97706',
  warningAlt:     '#FEF3C7',

  // Bordes / separadores
  border:         '#EDE3D8',
  borderStrong:   '#D4C4B0',

  // Tab bar
  tabBar:         '#FFFFFF',
  tabInactive:    '#C4A98C',
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
