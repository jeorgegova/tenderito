import {supabase} from '../lib/supabase';
import type {Credit, NewCreditInput} from '../types';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';
import {scheduleSync} from './sync';

/**
 * Consulta créditos de un cliente con prioridad Offline-First (SQLite local).
 */
export async function fetchCreditsByCustomer(
  customerId: string,
): Promise<Credit[]> {
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      `SELECT * FROM credits
       WHERE customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?)
       ORDER BY created_at DESC;`,
      [customerId, customerId],
    );

    if (rows && rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.server_id || r.local_id,
        customer_id: r.customer_id,
        store_id: r.store_id || '',
        concept: r.concept,
        amount: Number(r.amount),
        due_date: r.due_date,
        status: r.status,
        estadoServidor: (r.estadoServidor || 'sincronizado') as any,
        created_by: r.created_by || '',
        created_at: r.created_at,
      }));
    }
  } catch (_e) {}

  // Fallback opcional a Supabase si SQLite aún no tiene datos y hay red
  try {
    const {data, error} = await supabase
      .from('credits')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', {ascending: false});
    if (!error && data) {
      return data as Credit[];
    }
  } catch (_netErr) {}

  return [];
}

/**
 * Créditos vencidos (due_date < hoy y no pagados) consultados prioritariamente desde SQLite local.
 */
export async function fetchOverdueCredits(): Promise<Credit[]> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      `SELECT c.*, cust.name as customer_name, cust.phone as customer_phone
       FROM credits c
       LEFT JOIN customers cust ON (c.customer_id = cust.local_id OR c.customer_id = cust.server_id)
       WHERE c.status != 'paid' AND c.due_date IS NOT NULL AND c.due_date < ?
       ORDER BY c.due_date ASC;`,
      [today],
    );

    if (rows && rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.server_id || r.local_id,
        customer_id: r.customer_id,
        store_id: r.store_id || '',
        concept: r.concept,
        amount: Number(r.amount),
        due_date: r.due_date,
        status: r.status,
        estadoServidor: (r.estadoServidor || 'sincronizado') as any,
        created_by: r.created_by || '',
        created_at: r.created_at,
        customers: {
          id: r.customer_id,
          name: r.customer_name || 'Cliente',
          phone: r.customer_phone || '',
        },
      })) as Credit[];
    }
  } catch (_e) {}

  try {
    const {data, error} = await supabase
      .from('credits')
      .select('*, customers(id, name, phone)')
      .neq('status', 'paid')
      .lt('due_date', today)
      .order('due_date', {ascending: true});
    if (!error && data) {
      return data as Credit[];
    }
  } catch (_netErr) {}

  return [];
}

/**
 * Total cuentas por cobrar = suma de balances de clientes en SQLite local.
 */
export async function fetchTotalReceivable(): Promise<number> {
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      'SELECT SUM(current_balance) as total FROM customers;',
    );
    if (rows.length > 0 && rows[0]?.total !== null && rows[0]?.total !== undefined) {
      return Number(rows[0].total || 0);
    }
  } catch (_e) {}

  try {
    const {data, error} = await supabase
      .from('customer_stores')
      .select('current_balance');
    if (!error && data) {
      return (data ?? []).reduce(
        (acc: number, c: {current_balance: number}) =>
          acc + Number(c.current_balance),
        0,
      );
    }
  } catch (_netErr) {}

  return 0;
}

/**
 * Crea un crédito / fiado:
 * 1. Lo registra primero en la base de datos local SQLite con estadoServidor = 'pendiente'.
 * 2. Actualiza el saldo deudor del cliente localmente de inmediato.
 * 3. Ejecuta inmediatamente el método sincronizar para intentar subirlo a Supabase
 *    y descargar novedades si hay red.
 * 4. Retorna el crédito de inmediato para una experiencia de usuario rápida y offline.
 */
export async function createCredit(input: NewCreditInput): Promise<Credit> {
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar primero en SQLite local con estado pendiente
  await executeQuery(
    db,
    `INSERT INTO credits (
       local_id, server_id, customer_id, store_id, concept,
       amount, due_date, status, estadoServidor, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      null,
      input.customer_id,
      null,
      input.concept,
      input.amount,
      input.due_date || null,
      'pending',
      ESTADO_SINCRONIZACION.PENDIENTE,
      ESTADO_SINCRONIZACION.PENDIENTE,
      now,
      now,
    ],
  );

  // Actualizar saldo deudor local del cliente de inmediato
  await executeQuery(
    db,
    `UPDATE customers
     SET current_balance = current_balance + ?
     WHERE local_id = ? OR server_id = ?;`,
    [input.amount, input.customer_id, input.customer_id],
  );

  const localCredit: Credit = {
    id: localId,
    customer_id: input.customer_id,
    store_id: '',
    created_by: '',
    concept: input.concept,
    amount: input.amount,
    due_date: input.due_date || null,
    status: 'pending',
    estadoServidor: ESTADO_SINCRONIZACION.PENDIENTE,
    created_at: now,
  };

  // 2. Disparar sincronización agrupada con debounce (optimiza cuota Supabase)
  scheduleSync();

  return localCredit;
}

/**
 * Marca crédito como pagado en local y sincroniza con debounce.
 */
export async function markCreditPaid(id: string): Promise<void> {
  const db = await getDbConnection();
  await executeQuery(
    db,
    `UPDATE credits
     SET status = ?, estadoServidor = ?, updated_at = ?
     WHERE local_id = ? OR server_id = ?;`,
    ['paid', ESTADO_SINCRONIZACION.PENDIENTE, new Date().toISOString(), id, id],
  );

  scheduleSync();
}
