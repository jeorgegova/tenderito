import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {supabase} from '../lib/supabase';

let syncInProgress: Promise<any> | null = null;

/**
 * Bloqueo de concurrencia para sincronización.
 * Previene ejecuciones simultáneas de sincronización (mismo patrón que dx_performance).
 */
export function withSyncLock<T>(work: () => Promise<T>): Promise<T> {
  if (syncInProgress) {
    return syncInProgress as Promise<T>;
  }

  syncInProgress = Promise.resolve()
    .then(work)
    .then(
      result => {
        syncInProgress = null;
        return result;
      },
      error => {
        syncInProgress = null;
        throw error;
      },
    );

  return syncInProgress;
}

/**
 * Empuja a Supabase todos los clientes creados localmente que están pendientes.
 */
async function pushPendingCustomers(db: any) {
  const pending = await getData(
    db,
    `SELECT * FROM customers WHERE sync_status = ?;`,
    [ESTADO_SINCRONIZACION.PENDIENTE_CREACION],
  );

  for (const item of pending) {
    try {
      const {data, error} = await supabase.rpc('create_customer', {
        p_name: item.name,
        p_document_type: item.document_type || 'CC',
        p_document_number: item.document_number,
        p_phone: item.phone || null,
        p_notes: item.notes || null,
        p_alias: item.alias || null,
        p_credit_limit: Number(item.credit_limit || 0),
      });

      if (error) throw error;

      const serverId = data?.id || data;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE customers
         SET server_id = ?, sync_status = ?, last_synced_at = ?
         WHERE local_id = ?;`,
        [serverId, ESTADO_SINCRONIZACION.SINCRONIZADO, now, item.local_id],
      );
    } catch (e: any) {
      console.warn(`Error sincronizando cliente local ${item.local_id}:`, e?.message);
    }
  }
}

/**
 * Empuja a Supabase todos los créditos creados localmente que están pendientes.
 */
async function pushPendingCredits(db: any) {
  const pending = await getData(
    db,
    `SELECT c.*, cust.server_id AS customer_server_id
     FROM credits c
     LEFT JOIN customers cust ON c.customer_id = cust.local_id
     WHERE c.sync_status = ?;`,
    [ESTADO_SINCRONIZACION.PENDIENTE_CREACION],
  );

  for (const item of pending) {
    try {
      const targetCustomerId = item.customer_server_id || item.customer_id;
      const {data, error} = await supabase.rpc('create_credit', {
        p_customer_id: targetCustomerId,
        p_concept: item.concept,
        p_amount: Number(item.amount),
        p_due_date: item.due_date || null,
      });

      if (error) throw error;

      const serverId = data?.id || data;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE credits
         SET server_id = ?, sync_status = ?, last_synced_at = ?
         WHERE local_id = ?;`,
        [serverId, ESTADO_SINCRONIZACION.SINCRONIZADO, now, item.local_id],
      );
    } catch (e: any) {
      console.warn(`Error sincronizando crédito local ${item.local_id}:`, e?.message);
    }
  }
}

/**
 * Empuja a Supabase todos los abonos creados localmente que están pendientes.
 */
async function pushPendingPayments(db: any) {
  const pending = await getData(
    db,
    `SELECT p.*,
            cust.server_id AS customer_server_id,
            cred.server_id AS credit_server_id
     FROM payments p
     LEFT JOIN customers cust ON p.customer_id = cust.local_id
     LEFT JOIN credits cred ON p.credit_id = cred.local_id
     WHERE p.sync_status = ?;`,
    [ESTADO_SINCRONIZACION.PENDIENTE_CREACION],
  );

  for (const item of pending) {
    try {
      const targetCustomerId = item.customer_server_id || item.customer_id;
      const targetCreditId = item.credit_server_id || item.credit_id || null;

      const {data, error} = await supabase.rpc('create_payment', {
        p_customer_id: targetCustomerId,
        p_credit_id: targetCreditId,
        p_amount: Number(item.amount),
        p_notes: item.notes || null,
      });

      if (error) throw error;

      const serverId = data?.id || data;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE payments
         SET server_id = ?, sync_status = ?, last_synced_at = ?
         WHERE local_id = ?;`,
        [serverId, ESTADO_SINCRONIZACION.SINCRONIZADO, now, item.local_id],
      );
    } catch (e: any) {
      console.warn(`Error sincronizando abono local ${item.local_id}:`, e?.message);
    }
  }
}

/**
 * Descarga clientes, créditos y pagos remotos desde Supabase y los almacena en SQLite.
 */
async function pullRemoteData(db: any) {
  try {
    // 1. Descargar clientes
    const {data: storeCustomers, error: custErr} = await supabase
      .from('customer_stores')
      .select('current_balance, credit_limit, alias, customers!inner(*)');

    if (!custErr && storeCustomers) {
      const now = new Date().toISOString();
      for (const row of storeCustomers as any[]) {
        const c = row.customers;
        await executeQuery(
          db,
          `INSERT INTO customers (
             local_id, server_id, name, document_type, document_number,
             phone, notes, alias, current_balance, credit_limit,
             sync_status, last_synced_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(local_id) DO UPDATE SET
             server_id = excluded.server_id,
             name = excluded.name,
             alias = excluded.alias,
             current_balance = excluded.current_balance,
             credit_limit = excluded.credit_limit,
             sync_status = excluded.sync_status,
             last_synced_at = excluded.last_synced_at;`,
          [
            c.id,
            c.id,
            c.name,
            c.document_type || 'CC',
            c.document_number,
            c.phone || '',
            c.notes || '',
            row.alias || '',
            Number(row.current_balance || 0),
            Number(row.credit_limit || 0),
            ESTADO_SINCRONIZACION.SINCRONIZADO,
            now,
            c.created_at || now,
            c.updated_at || now,
          ],
        );
      }
    }

    // 2. Descargar créditos
    const {data: remoteCredits, error: credErr} = await supabase
      .from('credits')
      .select('*')
      .order('created_at', {ascending: false})
      .limit(300);

    if (!credErr && remoteCredits) {
      const now = new Date().toISOString();
      for (const cr of remoteCredits as any[]) {
        await executeQuery(
          db,
          `INSERT INTO credits (
             local_id, server_id, customer_id, store_id, concept,
             amount, due_date, status, sync_status, last_synced_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(local_id) DO UPDATE SET
             server_id = excluded.server_id,
             status = excluded.status,
             sync_status = excluded.sync_status,
             last_synced_at = excluded.last_synced_at;`,
          [
            cr.id,
            cr.id,
            cr.customer_id,
            cr.store_id,
            cr.concept,
            Number(cr.amount),
            cr.due_date,
            cr.status,
            ESTADO_SINCRONIZACION.SINCRONIZADO,
            now,
            cr.created_at || now,
          ],
        );
      }
    }

    // 3. Descargar pagos
    const {data: remotePayments, error: payErr} = await supabase
      .from('payments')
      .select('*')
      .order('payment_date', {ascending: false})
      .limit(300);

    if (!payErr && remotePayments) {
      const now = new Date().toISOString();
      for (const p of remotePayments as any[]) {
        await executeQuery(
          db,
          `INSERT INTO payments (
             local_id, server_id, customer_id, credit_id, store_id,
             amount, notes, payment_date, sync_status, last_synced_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(local_id) DO UPDATE SET
             server_id = excluded.server_id,
             sync_status = excluded.sync_status,
             last_synced_at = excluded.last_synced_at;`,
          [
            p.id,
            p.id,
            p.customer_id,
            p.credit_id,
            p.store_id,
            Number(p.amount),
            p.notes,
            p.payment_date,
            ESTADO_SINCRONIZACION.SINCRONIZADO,
            now,
            p.created_at || now,
          ],
        );
      }
    }
  } catch (e: any) {
    console.warn('Error descargando datos remotos:', e?.message);
  }
}

/**
 * Función principal de sincronización:
 * 1. Envía datos locales pendientes a Supabase.
 * 2. Descarga datos actualizados del servidor a SQLite local.
 */
export async function syncAll(): Promise<{pushed: boolean; pulled: boolean}> {
  return withSyncLock(async () => {
    const db = await getDbConnection();
    await pushPendingCustomers(db);
    await pushPendingCredits(db);
    await pushPendingPayments(db);
    await pullRemoteData(db);
    return {pushed: true, pulled: true};
  });
}
