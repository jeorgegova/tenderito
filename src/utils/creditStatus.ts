export type CreditPaymentTag = 'paid' | 'partially_paid' | null;

export interface CreditItemForStatus {
  id: string;
  local_id?: string;
  server_id?: string | null;
  amount: number | string;
  status?: string;
  created_at?: string;
  date?: string;
}

export interface PaymentItemForStatus {
  id: string;
  local_id?: string;
  server_id?: string | null;
  credit_id?: string | null;
  amount: number | string;
  status?: string;
  payment_date?: string;
  created_at?: string;
  date?: string;
}

/**
 * Calcula dinámicamente el estado de pago ('paid' | 'partially_paid' | null)
 * para cada crédito/compra fiada basado en abonos específicos y generales (FIFO),
 * considerando también el saldo actual del cliente y descartando cancelados.
 *
 * Los créditos sin pagar retornan `null` (sin etiqueta).
 */
export function computeCreditPaymentStatuses(
  credits: CreditItemForStatus[],
  payments: PaymentItemForStatus[],
  customerBalance?: number | null,
): Record<string, CreditPaymentTag> {
  const result: Record<string, CreditPaymentTag> = {};

  if (!credits || credits.length === 0) {
    return result;
  }

  const setTag = (cred: CreditItemForStatus, tag: CreditPaymentTag) => {
    if (cred.id) result[cred.id] = tag;
    if (cred.local_id) result[cred.local_id] = tag;
    if (cred.server_id) result[cred.server_id] = tag;
  };

  // Si el cliente no debe nada (saldo <= 0), todos sus fiados no cancelados están pagados
  if (customerBalance !== undefined && customerBalance !== null && Number(customerBalance) <= 0) {
    for (const cred of credits) {
      const tag: CreditPaymentTag = cred.status === 'cancelled' ? null : 'paid';
      setTag(cred, tag);
    }
    return result;
  }

  // Filtrar movimientos válidos (no cancelados)
  const validCredits = credits.filter(c => c.status !== 'cancelled');
  const validPayments = (payments || []).filter(p => p.status !== 'cancelled');

  // Mapear abonos específicos por id / local_id / server_id de crédito
  const specificPaidByCredit: Record<string, number> = {};
  let generalPaymentsPool = 0;

  for (const pay of validPayments) {
    const payAmount = Number(pay.amount || 0);
    if (payAmount <= 0) continue;

    if (pay.credit_id && pay.credit_id !== '' && pay.credit_id !== 'null') {
      specificPaidByCredit[pay.credit_id] =
        (specificPaidByCredit[pay.credit_id] || 0) + payAmount;
    } else {
      generalPaymentsPool += payAmount;
    }
  }

  // Reconciliación con saldo si es conocido (cubre abonos de meses previos si la consulta vino filtrada)
  if (customerBalance !== undefined && customerBalance !== null && Number(customerBalance) > 0) {
    const totalCreditsAmount = validCredits.reduce(
      (sum, c) => sum + Number(c.amount || 0),
      0,
    );
    const impliedPaidTotal = Math.max(0, totalCreditsAmount - Number(customerBalance));
    const recordedPaidTotal =
      Object.values(specificPaidByCredit).reduce((a, b) => a + b, 0) +
      generalPaymentsPool;

    if (impliedPaidTotal > recordedPaidTotal) {
      generalPaymentsPool += impliedPaidTotal - recordedPaidTotal;
    }
  }

  // Ordenar créditos de forma cronológica ascendente (FIFO: el más antiguo se cubre primero)
  const sortedCredits = [...validCredits].sort((a, b) => {
    const timeA = new Date(a.created_at || a.date || 0).getTime();
    const timeB = new Date(b.created_at || b.date || 0).getTime();
    return timeA - timeB;
  });

  for (const cred of sortedCredits) {
    const origAmount = Number(cred.amount || 0);
    if (origAmount <= 0) {
      setTag(cred, 'paid');
      continue;
    }

    if (cred.status === 'paid') {
      setTag(cred, 'paid');
      continue;
    }

    const specificPaid =
      (cred.id ? specificPaidByCredit[cred.id] || 0 : 0) +
      (cred.local_id && cred.local_id !== cred.id
        ? specificPaidByCredit[cred.local_id] || 0
        : 0) +
      (cred.server_id && cred.server_id !== cred.id
        ? specificPaidByCredit[cred.server_id] || 0
        : 0);

    let paidAmount = Math.min(origAmount, specificPaid);
    let remaining = Math.max(0, origAmount - paidAmount);

    if (remaining > 0 && generalPaymentsPool > 0) {
      const fromPool = Math.min(remaining, generalPaymentsPool);
      paidAmount += fromPool;
      remaining -= fromPool;
      generalPaymentsPool -= fromPool;
    }

    let tag: CreditPaymentTag = null;
    if (remaining <= 0.01) {
      tag = 'paid';
    } else if (paidAmount >= 0.01 || cred.status === 'partially_paid') {
      tag = 'partially_paid';
    } else {
      tag = null; // Sin pagar -> sin etiqueta
    }

    setTag(cred, tag);
  }

  // Para cualquier crédito cancelado, asegurar tag = null
  for (const cred of credits) {
    if (cred.status === 'cancelled') {
      setTag(cred, null);
    }
  }

  return result;
}
