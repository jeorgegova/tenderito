import {supabase} from '../lib/supabase';
import type {Credit, NewCreditInput} from '../types';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';

export async function fetchCreditsByCustomer(
  customerId: string,
): Promise<Credit[]> {
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

  // Fallback offline: buscar en SQLite
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      `SELECT * FROM credits
       WHERE customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?)
       ORDER BY created_at DESC;`,
      [customerId, customerId],
    );
    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      customer_id: r.customer_id,
      store_id: r.store_id || '',
      concept: r.concept,
      amount: Number(r.amount),
      due_date: r.due_date,
      status: r.status,
      created_by: r.created_by || '',
      created_at: r.created_at,
    }));
  } catch (_e) {
    return [];
  }
}

// Créditos vencidos (due_date < hoy y no pagados) para alertas
export async function fetchOverdueCredits(): Promise<Credit[]> {
  const today = new Date().toISOString().slice(0, 10);
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

  // Fallback offline: buscar en SQLite
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
    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      customer_id: r.customer_id,
      store_id: r.store_id || '',
      concept: r.concept,
      amount: Number(r.amount),
      due_date: r.due_date,
      status: r.status,
      created_by: r.created_by || '',
      created_at: r.created_at,
      customers: {
        id: r.customer_id,
        name: r.customer_name || 'Cliente',
        phone: r.customer_phone || '',
      },
    })) as Credit[];
  } catch (_e) {
    return [];
  }
}

// Total cuentas por cobrar = suma de balances de clientes
export async function fetchTotalReceivable(): Promise<number> {
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

  // Fallback offline: suma en SQLite local
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      'SELECT SUM(current_balance) as total FROM customers;',
    );
    return Number(rows[0]?.total || 0);
  } catch (_e) {
    return 0;
  }
}

/**
 * Crea un crédito / fiado:
 * 1. Lo guarda primero en SQLite local con estado 'pendiente_creacion'.
 * 2. Actualiza el saldo deudor del cliente localmente de inmediato.
 * 3. Si hay red, intenta sincronizar con Supabase y actualiza a 'sincronizado'.
 * 4. Si no hay red, retorna el crédito localmente de inmediato.
 */
export async function createCredit(input: NewCreditInput): Promise<Credit> {
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar en SQLite local
  await executeQuery(
    db,
    `INSERT INTO credits (
       local_id, server_id, customer_id, store_id, concept,
       amount, due_date, status, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      null,
      input.customer_id,
      null,
      input.concept,
      input.amount,
      input.due_date || null,
      'pending',
      ESTADO_SINCRONIZACION.PENDIENTE_CREACION,
      now,
      now,
    ],
  );

  // Actualizar saldo deudor local del cliente
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

    const {data, error} = await supabase.rpc('create_credit', {
      p_customer_id: targetCustomerId,
      p_concept: input.concept,
      p_amount: input.amount,
      p_due_date: input.due_date ?? null,
    });

    if (!error && data) {
      const serverId = data?.id || data;
      await executeQuery(
        db,
        `UPDATE credits
         SET server_id = ?, sync_status = ?, last_synced_at = ?
         WHERE local_id = ?;`,
        [serverId, ESTADO_SINCRONIZACION.SINCRONIZADO, new Date().toISOString(), localId],
      );
      return {...localCredit, id: serverId};
    }
  } catch (_e) {
    // Sin red: queda en SQLite con 'pendiente_creacion' para sincronización posterior
  }

  return localCredit;
}

export async function markCreditPaid(id: string): Promise<void> {
  try {
    await supabase.from('credits').update({status: 'paid'}).eq('id', id);
  } catch (_e) {}

  const db = await getDbConnection();
  await executeQuery(
    db,
    'UPDATE credits SET status = ? WHERE local_id = ? OR server_id = ?;',
    ['paid', id, id],
  );
}
