import {supabase} from '../lib/supabase';
import type {NewPaymentInput, Payment} from '../types';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';

export async function fetchPaymentsByCustomer(
  customerId: string,
): Promise<Payment[]> {
  try {
    const {data, error} = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('payment_date', {ascending: false});
    if (!error && data) {
      return data as Payment[];
    }
  } catch (_netErr) {}

  // Fallback offline: buscar en SQLite
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      `SELECT * FROM payments
       WHERE customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?)
       ORDER BY payment_date DESC;`,
      [customerId, customerId],
    );
    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      customer_id: r.customer_id,
      credit_id: r.credit_id,
      store_id: r.store_id || '',
      amount: Number(r.amount),
      notes: r.notes,
      payment_date: r.payment_date,
      created_by: r.created_by || '',
      created_at: r.created_at,
    }));
  } catch (_e) {
    return [];
  }
}

/**
 * Registra un abono / pago:
 * 1. Lo guarda primero en SQLite local con estado 'pendiente_creacion'.
 * 2. Reduce el saldo deudor del cliente de inmediato en la base de datos local.
 * 3. Si hay red, intenta sincronizar con Supabase y actualiza a 'sincronizado'.
 * 4. Si no hay red, retorna el pago localmente de inmediato para que la app continúe funcionando.
 */
export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar en SQLite local
  await executeQuery(
    db,
    `INSERT INTO payments (
       local_id, server_id, customer_id, credit_id, store_id,
       amount, notes, payment_date, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      null,
      input.customer_id,
      input.credit_id ?? null,
      null,
      input.amount,
      input.notes ?? null,
      now,
      ESTADO_SINCRONIZACION.PENDIENTE_CREACION,
      now,
      now,
    ],
  );

  // Reducir balance del cliente en SQLite local
  await executeQuery(
    db,
    `UPDATE customers
     SET current_balance = MAX(0, current_balance - ?)
     WHERE local_id = ? OR server_id = ?;`,
    [input.amount, input.customer_id, input.customer_id],
  );

  const localPayment: Payment = {
    id: localId,
    customer_id: input.customer_id,
    credit_id: input.credit_id ?? null,
    store_id: '',
    created_by: '',
    amount: input.amount,
    notes: input.notes ?? null,
    payment_date: now,
    created_at: now,
  };

  // 2. Intentar enviar a Supabase si hay red
  try {
    let targetCustomerId = input.customer_id;
    const custRows = await getData(
      db,
      'SELECT server_id FROM customers WHERE local_id = ? LIMIT 1;',
      [input.customer_id],
    );
    if (custRows.length > 0 && custRows[0].server_id) {
      targetCustomerId = custRows[0].server_id;
    }

    let targetCreditId = input.credit_id ?? null;
    if (targetCreditId) {
      const credRows = await getData(
        db,
        'SELECT server_id FROM credits WHERE local_id = ? LIMIT 1;',
        [targetCreditId],
      );
      if (credRows.length > 0 && credRows[0].server_id) {
        targetCreditId = credRows[0].server_id;
      }
    }

    const {data, error} = await supabase.rpc('create_payment', {
      p_customer_id: targetCustomerId,
      p_credit_id: targetCreditId,
      p_amount: input.amount,
      p_notes: input.notes ?? null,
    });

    if (!error && data) {
      const serverId = data?.id || data;
      await executeQuery(
        db,
        `UPDATE payments
         SET server_id = ?, sync_status = ?, last_synced_at = ?
         WHERE local_id = ?;`,
        [serverId, ESTADO_SINCRONIZACION.SINCRONIZADO, new Date().toISOString(), localId],
      );
      return {...localPayment, id: serverId};
    }
  } catch (_e) {
    // Sin red: queda en SQLite con 'pendiente_creacion' para sincronización diferida
  }

  return localPayment;
}
