import {supabase} from '../lib/supabase';
import type {NewPaymentInput, Payment} from '../types';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';
import {scheduleSync} from './sync';

/**
 * Consulta pagos/abonos de un cliente con prioridad Offline-First (SQLite local).
 */
export async function fetchPaymentsByCustomer(
  customerId: string,
): Promise<Payment[]> {
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      `SELECT * FROM payments
       WHERE customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?)
       ORDER BY payment_date DESC;`,
      [customerId, customerId],
    );

    if (rows && rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.server_id || r.local_id,
        customer_id: r.customer_id,
        credit_id: r.credit_id,
        store_id: r.store_id || '',
        amount: Number(r.amount),
        notes: r.notes,
        payment_date: r.payment_date,
        estadoServidor: (r.estadoServidor || 'sincronizado') as any,
        created_by: r.created_by || '',
        created_at: r.created_at,
      }));
    }
  } catch (_e) {}

  // Fallback opcional si SQLite aún no tiene datos y hay conexión
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

  return [];
}

/**
 * Registra un abono / pago:
 * 1. Lo guarda primero en la base de datos local SQLite con estadoServidor = 'pendiente'.
 * 2. Reduce el saldo deudor del cliente de inmediato en la base de datos local.
 * 3. Ejecuta inmediatamente el método sincronizar para intentar subirlo al servidor
 *    y descargar novedades si hay red.
 * 4. Retorna el pago de inmediato para que la app continúe funcionando de forma ágil y offline.
 */
export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar primero en SQLite local con estado pendiente
  await executeQuery(
    db,
    `INSERT INTO payments (
       local_id, server_id, customer_id, credit_id, store_id,
       amount, notes, payment_date, estadoServidor, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      null,
      input.customer_id,
      input.credit_id ?? null,
      null,
      input.amount,
      input.notes ?? null,
      now,
      ESTADO_SINCRONIZACION.PENDIENTE,
      ESTADO_SINCRONIZACION.PENDIENTE,
      now,
      now,
    ],
  );

  // Reducir balance del cliente en SQLite local de inmediato
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
    estadoServidor: ESTADO_SINCRONIZACION.PENDIENTE,
    created_at: now,
  };

  // 2. Disparar sincronización agrupada con debounce (optimiza cuota Supabase)
  scheduleSync();

  return localPayment;
}
