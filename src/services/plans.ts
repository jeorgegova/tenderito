import {Linking} from 'react-native';
import {getDbConnection} from '../database/db';
import {getConfigParam, saveConfigParam} from '../database/tables/metadata';
import {
  getLocalSubscriptionPlans,
  insertOrReplaceSubscriptionPlan,
} from '../database/tables/plans';
import {supabase} from '../lib/supabase';
import type {Profile, SubscriptionPlanItem} from '../types';
import {showAlert} from '../components/ui/AlertModal';

export const DEFAULT_PLANS: SubscriptionPlanItem[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Hasta 10 clientes · Vitalicio',
    price: 0,
    price_text: '$0',
    customer_limit: 10,
    badge: null,
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'basic',
    name: 'Basic',
    description: 'Hasta 100 clientes',
    price: 29900,
    price_text: '$29.900/mes',
    customer_limit: 100,
    badge: 'Popular',
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Clientes ilimitados + funciones avanzadas',
    price: 59900,
    price_text: '$59.900/mes',
    customer_limit: 999999,
    badge: 'Recomendado',
    sort_order: 3,
    is_active: true,
  },
];

export const DEFAULT_SUPPORT_WHATSAPP = '573001234567';
export const DEFAULT_GRACE_PERIOD_DAYS = 10;

/**
 * Obtiene los planes de suscripción desde SQLite local o Supabase remoto.
 */
export async function fetchSubscriptionPlans(): Promise<SubscriptionPlanItem[]> {
  try {
    const db = await getDbConnection();
    const localPlans = await getLocalSubscriptionPlans(db);
    if (localPlans.length > 0) {
      return localPlans;
    }

    // Si localmente no hay planes, consultar Supabase
    const {data, error} = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', {ascending: true});

    if (!error && data && data.length > 0) {
      for (const p of data) {
        await insertOrReplaceSubscriptionPlan(db, p);
      }
      return data;
    }
  } catch (_e) {}

  return DEFAULT_PLANS;
}

/**
 * Obtiene el teléfono de WhatsApp de soporte configurado.
 */
export async function getSupportWhatsApp(): Promise<string> {
  try {
    const db = await getDbConnection();
    const phone = await getConfigParam(db, 'support_whatsapp');
    if (phone && phone.trim().length > 0) {
      return phone.trim();
    }
  } catch (_e) {}
  return DEFAULT_SUPPORT_WHATSAPP;
}

/**
 * Obtiene los días de gracia configurados.
 */
export async function getGracePeriodDays(): Promise<number> {
  try {
    const db = await getDbConnection();
    const val = await getConfigParam(db, 'grace_period_days');
    if (val && !isNaN(Number(val))) {
      return Number(val);
    }
  } catch (_e) {}
  return DEFAULT_GRACE_PERIOD_DAYS;
}

export interface SubscriptionStatusInfo {
  planId: string;
  effectivePlan: string;
  isLifetime: boolean;
  startDate: Date | null;
  endDate: Date | null;
  expiresToday: boolean;
  isExpired: boolean;
  daysSinceExpiration: number;
  remainingDays: number;
  inGracePeriod: boolean;
  isDowngradedToFree: boolean;
  needsRenewal: boolean;
  formattedStartDate: string | null;
  formattedEndDate: string | null;
}

/**
 * Calcula el estado detallado de la suscripción de un perfil:
 * - Si es Free: vitalicio.
 * - Si vence hoy: expiresToday = true.
 * - Si venció: isExpired = true.
 * - Durante 10 días tras el vencimiento: inGracePeriod = true (puede renovar).
 * - Después de 10 días sin renovar: pasa automáticamente al plan free efectivo.
 */
export function calculateSubscriptionStatus(
  profile: Profile | null,
  gracePeriodDays = DEFAULT_GRACE_PERIOD_DAYS,
): SubscriptionStatusInfo {
  const planId = (profile?.subscription_plan ?? 'free').toLowerCase();
  const isFreePlan = planId === 'free';

  const startDate = profile?.subscription_start_date
    ? new Date(profile.subscription_start_date)
    : null;
  const formattedStartDate = startDate
    ? startDate.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  // 1. El plan Free es el único vitalicio
  if (isFreePlan) {
    return {
      planId: 'free',
      effectivePlan: 'free',
      isLifetime: true,
      startDate,
      endDate: null,
      expiresToday: false,
      isExpired: false,
      daysSinceExpiration: 0,
      remainingDays: 0,
      inGracePeriod: false,
      isDowngradedToFree: false,
      needsRenewal: false,
      formattedStartDate,
      formattedEndDate: null,
    };
  }

  // 2. Plan de pago sin fecha de fin aún configurada en BD
  if (!profile?.subscription_end_date) {
    return {
      planId,
      effectivePlan: planId,
      isLifetime: false,
      startDate,
      endDate: null,
      expiresToday: false,
      isExpired: false,
      daysSinceExpiration: 0,
      remainingDays: 0,
      inGracePeriod: false,
      isDowngradedToFree: false,
      needsRenewal: false,
      formattedStartDate,
      formattedEndDate: null,
    };
  }

  const now = new Date();
  const endDate = new Date(profile.subscription_end_date);

  // Comparación a nivel de fecha (YYYY-MM-DD local)
  const isSameDay =
    now.getFullYear() === endDate.getFullYear() &&
    now.getMonth() === endDate.getMonth() &&
    now.getDate() === endDate.getDate();

  // Diferencia en milisegundos y días
  const diffMs = now.getTime() - endDate.getTime();
  const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isExpired = now.getTime() > endDate.getTime() && !isSameDay;
  const expiresToday = isSameDay;

  // Si pasaron más de los días de gracia (10 días), vuelve automáticamente al plan Free
  const isDowngradedToFree = isExpired && daysDiff > gracePeriodDays;
  const inGracePeriod = isExpired && daysDiff <= gracePeriodDays;

  // El plan efectivo es el contratado a menos que ya hayan pasado los 10 días de gracia
  const effectivePlan = isDowngradedToFree ? 'free' : planId;

  // Formato legible de fecha de fin
  const formattedEndDate = endDate.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return {
    planId,
    effectivePlan,
    isLifetime: false,
    startDate,
    endDate,
    expiresToday,
    isExpired,
    daysSinceExpiration: Math.max(0, daysDiff),
    remainingDays: isExpired ? 0 : Math.max(0, -daysDiff),
    inGracePeriod,
    isDowngradedToFree,
    needsRenewal: expiresToday || isExpired,
    formattedStartDate,
    formattedEndDate,
  };
}

/**
 * Formatea un número telefónico para mostrarlo legiblemente al tendero.
 */
function formatDisplayPhone(rawPhone: string): string {
  const clean = rawPhone.replace(/[^0-9]/g, '');
  if (clean.length === 12 && clean.startsWith('57')) {
    return `+57 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  return `+${clean}`;
}

/**
 * Abre WhatsApp con mensaje preescrito para suscripción o renovación.
 * Si WhatsApp no está instalado en el dispositivo, informa al usuario
 * el número al cual escribir para activar o renovar su plan.
 */
export async function openWhatsAppPlanRequest({
  storeName,
  planName,
  isRenewal = false,
  phoneNumber,
}: {
  storeName: string;
  planName: string;
  isRenewal?: boolean;
  phoneNumber?: string;
}): Promise<void> {
  const rawPhone = phoneNumber || (await getSupportWhatsApp());
  const phone = rawPhone.replace(/[^0-9]/g, '');
  const displayPhone = formatDisplayPhone(phone);
  const cleanStore = storeName ? storeName.trim() : 'mi tienda';
  const cleanPlan = planName ? planName.trim() : 'de suscripción';

  let message = '';
  if (isRenewal) {
    message = `Hola, soy la tienda ${cleanStore} y deseo renovar mi suscripción al plan ${cleanPlan}`;
  } else {
    message = `Hola, soy la tienda ${cleanStore} y deseo subscribirme al plan ${cleanPlan}`;
  }

  const encodedMsg = encodeURIComponent(message);
  const waAppUrl = `whatsapp://send?phone=${phone}&text=${encodedMsg}`;

  // 1. Verificar si WhatsApp está instalado
  let whatsappInstalled = false;
  try {
    whatsappInstalled = await Linking.canOpenURL(waAppUrl);
  } catch (_e) {
    whatsappInstalled = false;
  }

  // 2. Si está instalado, abrir la app directamente
  if (whatsappInstalled) {
    try {
      await Linking.openURL(waAppUrl);
      return;
    } catch (_openErr) {}
  }

  // 3. Si no tiene WhatsApp instalado, indicarle escribir al número para activar o renovar
  const actionText = isRenewal ? 'renovar' : 'activar';
  showAlert({
    title: 'WhatsApp no disponible',
    message: `No se encontró WhatsApp instalado en tu teléfono.\n\nPor favor escribe al número ${displayPhone} para ${actionText} tu plan:\n\n"${message}"`,
    type: 'info',
    buttons: [
      {
        text: 'Llamar al número',
        style: 'default',
        onPress: () => {
          Linking.openURL(`tel:+${phone}`).catch(() => {});
        },
      },
      {
        text: 'Entendido',
        style: 'cancel',
      },
    ],
  });
}

/**
 * Cambia inmediatamente al plan Free (único cambio autónomo permitido en la app).
 */
export async function downgradeToFreePlan(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) {
      return {success: false, error: 'No autenticado'};
    }

    // Intentar invocar la RPC downgrade_to_free si existe
    const {error: rpcErr} = await supabase.rpc('downgrade_to_free');
    if (rpcErr) {
      // Fallback: actualizar directamente profiles y stores
      const {error: profErr} = await supabase
        .from('profiles')
        .update({
          subscription_plan: 'free',
          subscription_start_date: new Date().toISOString(),
          subscription_end_date: null,
          subscription_status: 'active',
        })
        .eq('id', user.id);

      if (profErr) {
        return {success: false, error: profErr.message};
      }

      await supabase
        .from('stores')
        .update({
          subscription_plan: 'free',
          subscription_start_date: new Date().toISOString(),
          subscription_end_date: null,
          subscription_status: 'active',
        })
        .eq('owner_id', user.id);
    }

    return {success: true};
  } catch (err: any) {
    return {success: false, error: err?.message ?? 'Error inesperado'};
  }
}
