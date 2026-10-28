// Design tokens — Tenderito
// Identidad: naranja cálido de tienda de barrio, tipografía legible, fondo neutro cálido.
// Pensada para tenderos con poca experiencia digital, lectura rápida de números.

export const Colors = {
  // Marca — naranja vivo de Tenderito
  primary:        '#FF6B00',   // naranja principal de la marca
  primaryDark:    '#E85D00',   // naranja oscuro para pressed / énfasis
  primaryLight:   '#FFF1E5',   // naranja claro para fondos de chips / badges activos
  primaryMid:     '#FFD7B8',   // bordes suaves naranja

  // Fondos limpios y modernos
  background:     '#F7F9FC',   // fondo general casi blanco, fresco y limpio
  card:           '#FFFFFF',   // superficies / tarjetas blancas
  cardAlt:        '#F1F5F9',   // neutro de soporte

  // Texto de alto contraste y legibilidad
  text:           '#142033',   // azul marino oscuro para títulos y texto principal
  textSecondary:  '#52647D',   // gris azulado para textos secundarios y subtítulos
  textMuted:      '#8E9BAE',   // gris suave para placeholders e hints

  // Semánticos
  destructive:    '#E53935',   // rojo para deudas pendientes y alertas
  destructiveAlt: '#FFF0EF',   // fondo rojo suave
  success:        '#16834A',   // verde para pagos al día y estados positivos
  successAlt:     '#E3F8EC',   // fondo verde suave
  warning:        '#D97706',
  warningAlt:     '#FEF3C7',

  // Bordes sutiles
  border:         '#E8EDF3',   // bordes discretos de tarjetas y campos
  borderStrong:   '#CBD5E1',

  // Tab bar
  tabBar:         '#FFFFFF',
  tabInactive:    '#52647D',
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
