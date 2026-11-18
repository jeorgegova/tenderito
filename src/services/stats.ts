import {Linking} from 'react-native';
import {getDbConnection, getData} from '../database/db';
import {getActiveStoreId} from './storeContext';
import {BOGOTA_TZ} from '../utils/format';
import {showAlert} from '../components/ui/AlertModal';

export interface StatsFilters {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  customerIds?: string[];
  presetIndex?: number;
}

export type CustomerDebtStatus = 'al_dia' | 'abonando' | 'pendiente';

export interface CustomerStatRow {
  customer_id: string;
  name: string;
  alias: string | null;
  phone: string | null;
  current_balance: number; // Saldo pendiente actual vivo
  period_credits: number;  // Fiado en el período
  period_payments: number; // Abonado en el período
  period_credits_count: number;
  period_payments_count: number;
  status: CustomerDebtStatus;
  debt_days: number;       // Días de antigüedad estimada de la deuda viva (FIFO)
  oldest_debt_date: string | null;
  last_payment_date: string | null;
  days_since_last_payment: number | null;
}

export interface StatsAlerts {
  oldestDebtCustomer: CustomerStatRow | null; // Mayor tiempo con deuda pendiente
  topPayerCustomer: CustomerStatRow | null;   // Buen comportamiento de pago
  topDebtorCustomer: CustomerStatRow | null;  // Mayor saldo pendiente
}

export interface PeriodComparison {
  prevPeriodCredits: number;
  prevPeriodPayments: number;
  creditsChangePct: number | null;
  paymentsChangePct: number | null;
}

export interface StatsResult {
  // 1. Estado Actual de la Cartera (Estático frente al filtro de fechas)
  currentTotalReceivable: number; // Dinero que te deben hoy
  customersWithDebtCount: number; // Cantidad de clientes con deuda
  customersUpToDateCount: number; // Cantidad de clientes al día
  totalCustomersCount: number;    // Total clientes registrados

  // 2. Flujo del Período (Dinámico, obedece al filtro de fechas)
  periodCreditsTotal: number;     // Total fiado durante el período
  periodPaymentsTotal: number;    // Total recibido en abonos durante el período
  periodCreditsCount: number;     // Cantidad de fiados registrados
  periodPaymentsCount: number;    // Cantidad de abonos registrados
  periodComparison: PeriodComparison;

  // 3. Alertas y Consejos determinísticos
  alerts: StatsAlerts;
  insights: {
    messages: string[];
  };

  // 4. Filas de clientes
  rows: CustomerStatRow[];

  // Compatibilidad hacia atrás
  totalCredits: number;
  totalPayments: number;
  netBalance: number;
  customerCount: number;
}

/**
 * Normaliza cualquier formato de fecha/timestamp a 'YYYY-MM-DD' en la zona horaria de Colombia.
 */
export function toBogotaYMD(value: any): string {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) {
      return str.length >= 10 && str[4] === '-' && str[7] === '-' ? str.slice(0, 10) : '';
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (_e) {
    return str.slice(0, 10);
  }
}

/**
 * Calcula la diferencia en días entre dos fechas (formato YYYY-MM-DD o ISO).
 */
export function calculateDaysDifference(
  laterDateStr: string | null | undefined,
  earlierDateStr: string | null | undefined,
): number {
  if (!laterDateStr || !earlierDateStr) return 0;
  const d1 = new Date(toBogotaYMD(laterDateStr));
  const d2 = new Date(toBogotaYMD(earlierDateStr));
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffMs = d1.getTime() - d2.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Obtiene el rango de fechas del período anterior equivalente para comparativas de tendencia.
 */
function getPreviousPeriodRange(presetIndex?: number, todayStr = toBogotaYMD(new Date())): { prevFrom?: string; prevTo?: string } {
  if (presetIndex === undefined || presetIndex < 0 || presetIndex > 3) {
    return {};
  }
  const d = new Date(`${todayStr}T12:00:00-05:00`);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);

  if (presetIndex === 0) { // Hoy -> Ayer
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    const pStr = fmt(prev);
    return { prevFrom: pStr, prevTo: pStr };
  } else if (presetIndex === 1) { // 7 días -> 7 días anteriores (del día -14 al -8)
    const pTo = new Date(d);
    pTo.setDate(pTo.getDate() - 8);
    const pFrom = new Date(d);
    pFrom.setDate(pFrom.getDate() - 14);
    return { prevFrom: fmt(pFrom), prevTo: fmt(pTo) };
  } else if (presetIndex === 2) { // 30 días -> 30 días anteriores (del día -60 al -31)
    const pTo = new Date(d);
    pTo.setDate(pTo.getDate() - 31);
    const pFrom = new Date(d);
    pFrom.setDate(pFrom.getDate() - 60);
    return { prevFrom: fmt(pFrom), prevTo: fmt(pTo) };
  } else if (presetIndex === 3) { // Este mes -> Mes anterior
    const pTo = new Date(d);
    pTo.setMonth(pTo.getMonth() - 1);
    const pFrom = new Date(pTo.getFullYear(), pTo.getMonth(), 1);
    return { prevFrom: fmt(pFrom), prevTo: fmt(pTo) };
  }
  return {};
}

/**
 * Cálculo 100% offline de estadísticas a partir de la base de datos local SQLite.
 */
async function fetchStatsOffline(filters: StatsFilters): Promise<StatsResult> {
  const emptyResult: StatsResult = {
    currentTotalReceivable: 0,
    customersWithDebtCount: 0,
    customersUpToDateCount: 0,
    totalCustomersCount: 0,
    periodCreditsTotal: 0,
    periodPaymentsTotal: 0,
    periodCreditsCount: 0,
    periodPaymentsCount: 0,
    periodComparison: {
      prevPeriodCredits: 0,
      prevPeriodPayments: 0,
      creditsChangePct: null,
      paymentsChangePct: null,
    },
    alerts: {
      oldestDebtCustomer: null,
      topPayerCustomer: null,
      topDebtorCustomer: null,
    },
    insights: { messages: [] },
    rows: [],
    totalCredits: 0,
    totalPayments: 0,
    netBalance: 0,
    customerCount: 0,
  };

  try {
    const activeStoreId = await getActiveStoreId();
    const db = await getDbConnection();
    const { from, to, customerIds, presetIndex } = filters;
    const todayYMD = toBogotaYMD(new Date());

    // 1. Clientes locales de la tienda
    let custSql =
      'SELECT local_id, server_id, name, alias, phone, current_balance, created_at, deleted_at FROM customers';
    const custParams: any[] = [];
    if (activeStoreId) {
      custSql +=
        ' WHERE (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
      custParams.push(activeStoreId);
    }
    const rawCustRows = await getData(db, custSql, custParams).catch(() => []);
    // Descartar clientes eliminados
    const custRows = (rawCustRows ?? []).filter((c: any) => !c.deleted_at);

    // 2. Créditos locales no cancelados
    let credSql = 'SELECT * FROM credits WHERE (status != "cancelled" OR status IS NULL)';
    const credParams: any[] = [];
    if (activeStoreId) {
      credSql += ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
      credParams.push(activeStoreId);
    }
    const rawCredits = await getData(db, credSql, credParams).catch(async () => {
      return getData(db, 'SELECT * FROM credits;', []).catch(() => []);
    });

    // 3. Abonos locales no cancelados
    let paySql = 'SELECT * FROM payments WHERE (status != "cancelled" OR status IS NULL)';
    const payParams: any[] = [];
    if (activeStoreId) {
      paySql += ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
      payParams.push(activeStoreId);
    }
    const rawPayments = await getData(db, paySql, payParams).catch(async () => {
      return getData(db, 'SELECT * FROM payments;', []).catch(() => []);
    });

    // Descartar cancelados de forma segura
    const allCredits = (rawCredits ?? []).filter((r: any) => r.status !== 'cancelled');
    const allPayments = (rawPayments ?? []).filter((r: any) => r.status !== 'cancelled');

    // Indexar créditos y pagos por cliente
    const creditsByCustomer = new Map<string, any[]>();
    for (const cr of allCredits) {
      const cid = cr.customer_id;
      if (!creditsByCustomer.has(cid)) creditsByCustomer.set(cid, []);
      creditsByCustomer.get(cid)!.push(cr);
    }

    const paymentsByCustomer = new Map<string, any[]>();
    for (const p of allPayments) {
      const cid = p.customer_id;
      if (!paymentsByCustomer.has(cid)) paymentsByCustomer.set(cid, []);
      paymentsByCustomer.get(cid)!.push(p);
    }

    // Rangos del período anterior para comparativa
    const { prevFrom, prevTo } = getPreviousPeriodRange(presetIndex, todayYMD);

    // Métricas del período actual y anterior
    let periodCreditsTotal = 0;
    let periodCreditsCount = 0;
    let periodPaymentsTotal = 0;
    let periodPaymentsCount = 0;

    let prevPeriodCredits = 0;
    let prevPeriodPayments = 0;

    for (const cr of allCredits) {
      const ymd = toBogotaYMD(cr.created_at);
      const inCurrent = (!from || ymd >= from) && (!to || ymd <= to);
      if (inCurrent) {
        periodCreditsTotal += Number(cr.amount || 0);
        periodCreditsCount++;
      }
      if (prevFrom && prevTo && ymd >= prevFrom && ymd <= prevTo) {
        prevPeriodCredits += Number(cr.amount || 0);
      }
    }

    for (const p of allPayments) {
      const ymd = toBogotaYMD(p.payment_date || p.created_at);
      const inCurrent = (!from || ymd >= from) && (!to || ymd <= to);
      if (inCurrent) {
        periodPaymentsTotal += Number(p.amount || 0);
        periodPaymentsCount++;
      }
      if (prevFrom && prevTo && ymd >= prevFrom && ymd <= prevTo) {
        prevPeriodPayments += Number(p.amount || 0);
      }
    }

    // Porcentajes de cambio vs período anterior
    let creditsChangePct: number | null = null;
    if (prevPeriodCredits > 0) {
      creditsChangePct = Math.round(((periodCreditsTotal - prevPeriodCredits) / prevPeriodCredits) * 100);
    }
    let paymentsChangePct: number | null = null;
    if (prevPeriodPayments > 0) {
      paymentsChangePct = Math.round(((periodPaymentsTotal - prevPeriodPayments) / prevPeriodPayments) * 100);
    }

    // Estado actual vivo de la cartera (no cambia con filtros de fechas)
    let currentTotalReceivable = 0;
    let customersWithDebtCount = 0;
    let customersUpToDateCount = 0;

    for (const cust of custRows) {
      const balance = Math.max(0, Number(cust.current_balance || 0));
      if (balance > 0) {
        currentTotalReceivable += balance;
        customersWithDebtCount++;
      } else {
        customersUpToDateCount++;
      }
    }

    const rows: CustomerStatRow[] = [];

    for (const cust of custRows) {
      const cId = cust.server_id || cust.local_id;
      const balance = Math.max(0, Number(cust.current_balance || 0));

      // Si se filtró por clientes específicos
      const isSelected =
        !customerIds?.length ||
        customerIds.includes(cId) ||
        customerIds.includes(cust.local_id) ||
        (cust.server_id && customerIds.includes(cust.server_id));

      if (!isSelected) continue;

      // Obtener todos los créditos del cliente
      const custCredits = [
        ...(creditsByCustomer.get(cust.local_id) ?? []),
        ...(cust.server_id ? (creditsByCustomer.get(cust.server_id) ?? []) : []),
      ];

      // Obtener todos los abonos del cliente
      const custPayments = [
        ...(paymentsByCustomer.get(cust.local_id) ?? []),
        ...(cust.server_id ? (paymentsByCustomer.get(cust.server_id) ?? []) : []),
      ];

      // Flujo en el período para este cliente
      let custPeriodCredits = 0;
      let custPeriodCreditsCount = 0;
      for (const cr of custCredits) {
        const ymd = toBogotaYMD(cr.created_at);
        if ((!from || ymd >= from) && (!to || ymd <= to)) {
          custPeriodCredits += Number(cr.amount || 0);
          custPeriodCreditsCount++;
        }
      }

      let custPeriodPayments = 0;
      let custPeriodPaymentsCount = 0;
      for (const p of custPayments) {
        const ymd = toBogotaYMD(p.payment_date || p.created_at);
        if ((!from || ymd >= from) && (!to || ymd <= to)) {
          custPeriodPayments += Number(p.amount || 0);
          custPeriodPaymentsCount++;
        }
      }

      // 1. Antigüedad de la deuda viva mediante FIFO
      let debtDays = 0;
      let oldestDebtDate: string | null = null;

      if (balance > 0) {
        const sortedCredits = [...custCredits].sort((a, b) => {
          const tA = new Date(a.created_at || '').getTime() || 0;
          const tB = new Date(b.created_at || '').getTime() || 0;
          return tB - tA;
        });

        let accumulated = 0;
        let oldestUncoveredCredit: any = null;
        for (const cr of sortedCredits) {
          accumulated += Number(cr.amount || 0);
          oldestUncoveredCredit = cr;
          if (accumulated >= balance) {
            break;
          }
        }

        if (oldestUncoveredCredit && oldestUncoveredCredit.created_at) {
          oldestDebtDate = oldestUncoveredCredit.created_at;
          debtDays = calculateDaysDifference(todayYMD, oldestDebtDate);
        } else if (cust.created_at) {
          oldestDebtDate = cust.created_at;
          debtDays = calculateDaysDifference(todayYMD, oldestDebtDate);
        }
      }

      // 2. Último abono registrado
      let lastPaymentDate: string | null = null;
      let daysSinceLastPayment: number | null = null;

      if (custPayments.length > 0) {
        const sortedPayments = [...custPayments].sort((a, b) => {
          const tA = new Date(a.payment_date || a.created_at || '').getTime() || 0;
          const tB = new Date(b.payment_date || b.created_at || '').getTime() || 0;
          return tB - tA;
        });
        const lp = sortedPayments[0];
        lastPaymentDate = lp.payment_date || lp.created_at;
        if (lastPaymentDate) {
          daysSinceLastPayment = calculateDaysDifference(todayYMD, lastPaymentDate);
        }
      }

      // 3. Estado del cliente
      let status: CustomerDebtStatus = 'al_dia';
      if (balance > 0) {
        const hasAbonoInPeriod = custPeriodPayments > 0;
        const hasRecentAbono = daysSinceLastPayment !== null && daysSinceLastPayment <= 30;
        if (hasAbonoInPeriod || hasRecentAbono) {
          status = 'abonando';
        } else {
          status = 'pendiente';
        }
      }

      rows.push({
        customer_id: cId,
        name: cust.name || 'Cliente',
        alias: cust.alias || null,
        phone: cust.phone || null,
        current_balance: balance,
        period_credits: custPeriodCredits,
        period_payments: custPeriodPayments,
        period_credits_count: custPeriodCreditsCount,
        period_payments_count: custPeriodPaymentsCount,
        status,
        debt_days: debtDays,
        oldest_debt_date: oldestDebtDate,
        last_payment_date: lastPaymentDate,
        days_since_last_payment: daysSinceLastPayment,
      });
    }

    // Ordenamiento recomendado:
    // 1. Clientes con deuda de mayor antigüedad
    // 2. Clientes con mayor saldo pendiente
    // 3. Clientes al día
    rows.sort((a, b) => {
      if (a.current_balance > 0 && b.current_balance <= 0) return -1;
      if (a.current_balance <= 0 && b.current_balance > 0) return 1;
      if (a.current_balance > 0 && b.current_balance > 0) {
        if (b.debt_days !== a.debt_days) return b.debt_days - a.debt_days;
        return b.current_balance - a.current_balance;
      }
      return a.name.localeCompare(b.name);
    });

    // Alertas determinísticas
    const debtorRows = rows.filter(r => r.current_balance > 0);
    const oldestDebtCustomer = debtorRows.length > 0
      ? [...debtorRows].sort((a, b) => b.debt_days - a.debt_days)[0]
      : null;

    const topDebtorCustomer = debtorRows.length > 0
      ? [...debtorRows].sort((a, b) => b.current_balance - a.current_balance)[0]
      : null;

    // Cliente con mayor actividad de abonos en el período
    const payingRows = rows.filter(r => r.period_payments > 0);
    const topPayerCustomer = payingRows.length > 0
      ? [...payingRows].sort((a, b) => b.period_payments - a.period_payments)[0]
      : null;

    // Mensajes determinísticos de "Tenderito te cuenta"
    const messages: string[] = [];
    if (periodPaymentsTotal > periodCreditsTotal && periodPaymentsTotal > 0) {
      messages.push('En este período has recaudado más en abonos de lo que has fiado.');
    } else if (periodCreditsTotal > periodPaymentsTotal && periodCreditsTotal > 0) {
      messages.push('En este período has fiado más de lo que has recibido en abonos.');
    }

    if (prevPeriodPayments > 0 && periodPaymentsTotal > prevPeriodPayments) {
      messages.push(`Los abonos recibidos aumentaron un ${paymentsChangePct}% respecto al período anterior.`);
    }

    const customersWithOldDebt = debtorRows.filter(r => r.debt_days > 30);
    if (customersWithOldDebt.length > 0) {
      messages.push(`Tienes ${customersWithOldDebt.length} cliente${customersWithOldDebt.length > 1 ? 's' : ''} con deuda viva desde hace más de 30 días.`);
    }

    if (customersUpToDateCount > 0) {
      messages.push(`${customersUpToDateCount} de tus clientes están totalmente al día con su cuenta.`);
    }

    return {
      currentTotalReceivable,
      customersWithDebtCount,
      customersUpToDateCount,
      totalCustomersCount: custRows.length,
      periodCreditsTotal,
      periodPaymentsTotal,
      periodCreditsCount,
      periodPaymentsCount,
      periodComparison: {
        prevPeriodCredits,
        prevPeriodPayments,
        creditsChangePct,
        paymentsChangePct,
      },
      alerts: {
        oldestDebtCustomer,
        topPayerCustomer,
        topDebtorCustomer,
      },
      insights: {
        messages: messages.slice(0, 3),
      },
      rows,
      // Retrocompatibilidad
      totalCredits: periodCreditsTotal,
      totalPayments: periodPaymentsTotal,
      netBalance: currentTotalReceivable,
      customerCount: custRows.length,
    };
  } catch (error) {
    console.error('[Stats] Error al obtener estadísticas:', error);
    return emptyResult;
  }
}

/**
 * Consulta de estadísticas: SQLite como fuente única de verdad.
 */
export async function fetchStats(filters: StatsFilters = {}): Promise<StatsResult> {
  return fetchStatsOffline(filters);
}

/**
 * Abre WhatsApp con mensaje amable y preescrito de recordatorio de saldo.
 */
export async function openWhatsAppCustomerReminder(
  phone: string | null | undefined,
  customerName: string,
  balance: number,
  storeName?: string,
) {
  if (!phone) return;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (!cleanPhone) return;
  const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
  const store = storeName?.trim() || 'tu tienda de confianza';
  const balanceStr = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(balance);

  const message = `Hola ${customerName}, te saludamos de ${store}. Te recordamos que tienes un saldo pendiente de ${balanceStr}. Cuando puedas, te invitamos a ponerte al día. ¡Muchas gracias!`;
  const encodedMsg = encodeURIComponent(message);
  const waAppUrl = `whatsapp://send?phone=${fullPhone}&text=${encodedMsg}`;
  const waWebUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedMsg}`;

  try {
    const canOpen = await Linking.canOpenURL(waAppUrl);
    if (canOpen) {
      await Linking.openURL(waAppUrl);
    } else {
      await Linking.openURL(waWebUrl);
    }
  } catch (_e) {
    showAlert('WhatsApp no disponible', `Puedes escribirle directamente al número: ${phone}`);
  }
}
