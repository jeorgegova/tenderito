import type {NewPaymentInput, Payment} from '../types';
import {getDbConnection, getData, executeQuery, executeInTransaction} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';
import {scheduleSync} from './sync';
import {getActiveStoreId} from './storeContext';

/**
 * Consulta pagos/abonos de un cliente con prioridad absoluta Offline-First (SQLite local).
 * Retorna inmediatamente los registros almacenados en el dispositivo.
 */
export async function fetchPaymentsByCustomer(
  customerId: string,
): Promise<Payment[]> {
  const activeStoreId = await getActiveStoreId();

  try {
    const db = await getDbConnection();
    let query = `SELECT * FROM payments
       WHERE (customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?))`;
    const params: any[] = [customerId, customerId];
    if (activeStoreId) {
      query += ` AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")`;
      params.push(activeStoreId);
    }
    query += ` ORDER BY payment_date DESC;`;
    const rows = await getData(db, query, params);

    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      customer_id: r.customer_id,
      credit_id: r.credit_id,
      store_id: r.store_id || '',
      amount: Number(r.amount),
      notes: r.notes,
      payment_date: r.payment_date,
      estadoServidor: (r.sync_status || r.estadoServidor || 'synced') as any,
      created_by: r.created_by || '',
      created_at: r.created_at,
    }));
  } catch (_e) {
    return [];
  }
}

/**
 * Registra un abono / pago bajo arquitectura Offline-First:
 * 1. Guarda el pago en SQLite y actualiza el saldo deudor del cliente dentro de una transacción atómica.
 * 2. Si el saldo del cliente llega a cero, libera el cupo de cartera del plan Free.
 * 3. Retorna inmediatamente el pago a la UI (latencia 0ms, sin spinner bloqueante).
 * 4. Programa la sincronización en segundo plano con Supabase.
 */
export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const activeStoreId = await getActiveStoreId();
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  if (!input.amount || input.amount <= 0) {
    throw new Error('El valor del abono debe ser mayor a cero.');
  }

  // 1. Validar cliente y saldo pendiente en SQLite local como fuente única de verdad
  let custRows: any[] = [];
  if (activeStoreId) {
    custRows = await getData(
      db,
      `SELECT current_balance FROM customers
       WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "") LIMIT 1;`,
      [input.customer_id, input.customer_id, activeStoreId],
    );
  }
  if (custRows.length === 0) {
    custRows = await getData(
      db,
      `SELECT current_balance FROM customers
       WHERE local_id = ? OR server_id = ? LIMIT 1;`,
      [input.customer_id, input.customer_id],
    );
  }

  const currentBalance = Number(custRows[0]?.current_balance || 0);
  if (currentBalance <= 0) {
    throw new Error('Este cliente no tiene saldo pendiente por pagar.');
  }
  if (input.amount > currentBalance) {
    throw new Error(
      `El abono no puede ser mayor a la deuda pendiente ($ ${currentBalance.toLocaleString('es-CO')}).`,
    );
  }

  // Inserción y actualización atómica en SQLite local
  await executeInTransaction(db, async () => {
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
        activeStoreId || null,
        input.amount,
        input.notes ?? null,
        now,
        ESTADO_SINCRONIZACION.PENDING,
        ESTADO_SINCRONIZACION.PENDING,
        now,
        now,
      ],
    );

    // Reducir balance del cliente en SQLite local de inmediato.
    // Si el cliente llega a 0 en el plan Free, se libera su cupo de cartera.
    await executeQuery(
      db,
      `UPDATE customers
       SET current_balance = MAX(0, current_balance - ?),
           free_plan_selected = CASE WHEN (current_balance - ?) <= 0 THEN 0 ELSE free_plan_selected END
       WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "");`,
      [input.amount, input.amount, input.customer_id, input.customer_id, activeStoreId || ''],
    );

    // Si se abonó a un crédito específico y quedó completamente cubierto, actualizar status local
    if (input.credit_id) {
      await executeQuery(
        db,
        `UPDATE credits
         SET status = 'paid', updated_at = ?
         WHERE (local_id = ? OR server_id = ?) AND amount <= ?;`,
        [now, input.credit_id, input.credit_id, input.amount],
      );
    }
  });

  const localPayment: Payment = {
    id: localId,
    customer_id: input.customer_id,
    credit_id: input.credit_id ?? null,
    store_id: activeStoreId || '',
    created_by: '',
    amount: input.amount,
    notes: input.notes ?? null,
    payment_date: now,
    estadoServidor: ESTADO_SINCRONIZACION.PENDING,
    created_at: now,
  };

  // Disparar sincronización en segundo plano con debounce
  scheduleSync();

  return localPayment;
}
