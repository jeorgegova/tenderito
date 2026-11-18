import {getDbConnection, getData, executeQuery, executeInTransaction} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';
import {scheduleSync} from './sync';
import {getActiveStoreId} from './storeContext';
import {getBogotaTodayYMD} from '../utils/format';
import {useStore} from '../store/useStore';
import {canCreateCreditForCustomer} from './portfolio';
import {notifyCustomerMovement} from './deviceService';
import {supabase} from '../lib/supabase';
import type {Credit, NewCreditInput} from '../types';

/**
 * Consulta créditos de un cliente con prioridad absoluta Offline-First (SQLite local).
 * Retorna inmediatamente los registros almacenados en el dispositivo.
 */
export async function fetchCreditsByCustomer(
  customerId: string,
): Promise<Credit[]> {
  const activeStoreId = await getActiveStoreId();

  try {
    const db = await getDbConnection();
    let query = `SELECT * FROM credits
       WHERE (customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?))`;
    const params: any[] = [customerId, customerId];
    if (activeStoreId) {
      query += ` AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")`;
      params.push(activeStoreId);
    }
    query += ` ORDER BY created_at DESC;`;
    const rows = await getData(db, query, params);

    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      customer_id: r.customer_id,
      store_id: r.store_id || '',
      concept: r.concept,
      amount: Number(r.amount),
      due_date: r.due_date,
      status: r.status,
      estadoServidor: (r.sync_status || r.estadoServidor || 'synced') as any,
      created_by: r.created_by || '',
      created_at: r.created_at,
    }));
  } catch (_e) {
    return [];
  }
}

/**
 * Créditos vencidos (due_date < hoy y no pagados) consultados exclusivamente desde SQLite local.
 */
export async function fetchOverdueCredits(): Promise<Credit[]> {
  const today = getBogotaTodayYMD();
  const activeStoreId = await getActiveStoreId();

  try {
    const db = await getDbConnection();
    let query = `SELECT c.*, cust.name as customer_name, cust.alias as customer_alias, cust.phone as customer_phone
       FROM credits c
       LEFT JOIN customers cust ON (c.customer_id = cust.local_id OR c.customer_id = cust.server_id)
       WHERE c.status != 'paid' AND c.status != 'cancelled' AND c.due_date IS NOT NULL AND c.due_date < ?`;
    const params: any[] = [today];
    if (activeStoreId) {
      query += ` AND (c.store_id = ? OR c.store_id IS NULL OR c.store_id = "" OR c.store_id = "null")`;
      params.push(activeStoreId);
    }
    query += ` ORDER BY c.due_date ASC;`;
    const rows = await getData(db, query, params);

    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      customer_id: r.customer_id,
      store_id: r.store_id || '',
      concept: r.concept,
      amount: Number(r.amount),
      due_date: r.due_date,
      status: r.status,
      estadoServidor: (r.sync_status || r.estadoServidor || 'synced') as any,
      created_by: r.created_by || '',
      created_at: r.created_at,
      customers: {
        id: r.customer_id,
        name: r.customer_name || 'Cliente',
        alias: r.customer_alias || null,
        phone: r.customer_phone || '',
      },
    })) as Credit[];
  } catch (_e) {
    return [];
  }
}

/**
 * Total cuentas por cobrar = suma inmediata de saldos de clientes calculada desde SQLite local.
 */
export async function fetchTotalReceivable(): Promise<number> {
  const activeStoreId = await getActiveStoreId();

  try {
    const db = await getDbConnection();
    let query = 'SELECT SUM(current_balance) as total FROM customers';
    const params: any[] = [];
    if (activeStoreId) {
      query +=
        ' WHERE store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null";';
      params.push(activeStoreId);
    }
    const rows = await getData(db, query, params);
    if (rows.length > 0 && rows[0]?.total !== null && rows[0]?.total !== undefined) {
      return Number(rows[0].total || 0);
    }
  } catch (_e) {}

  return 0;
}

/**
 * Crea un crédito / fiado bajo arquitectura Offline-First:
 * 1. Inserta el crédito en SQLite y actualiza el saldo del cliente dentro de una transacción atómica.
 * 2. Retorna inmediatamente el crédito a la UI (latencia 0ms, sin spinner bloqueante).
 * 3. Programa la sincronización en segundo plano hacia Supabase.
 */
export async function createCredit(input: NewCreditInput): Promise<Credit> {
  const eligibility = await canCreateCreditForCustomer(
    input.customer_id,
    useStore.getState().profile,
  );

  if (!eligibility.allowed) {
    throw new Error(
      eligibility.message ?? 'No puedes registrar este fiado con tu plan actual',
    );
  }

  const activeStoreId = await getActiveStoreId();
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // Inserción y actualización atómica en SQLite local
  await executeInTransaction(db, async () => {
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
        activeStoreId || null,
        input.concept,
        input.amount,
        input.due_date || null,
        'pending',
        ESTADO_SINCRONIZACION.PENDING,
        ESTADO_SINCRONIZACION.PENDING,
        now,
        now,
      ],
    );

    // Actualizar saldo deudor local del cliente de inmediato
    await executeQuery(
      db,
      `UPDATE customers
       SET current_balance = current_balance + ?
       WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "");`,
      [input.amount, input.customer_id, input.customer_id, activeStoreId || ''],
    );
  });

  const localCredit: Credit = {
    id: localId,
    customer_id: input.customer_id,
    store_id: activeStoreId || '',
    created_by: '',
    concept: input.concept,
    amount: input.amount,
    due_date: input.due_date || null,
    status: 'pending',
    estadoServidor: ESTADO_SINCRONIZACION.PENDING,
    created_at: now,
  };

  // Disparar sincronización en segundo plano con debounce
  scheduleSync();

  return localCredit;
}

/**
 * Marca crédito como pagado en local y sincroniza en segundo plano.
 */
export async function markCreditPaid(id: string): Promise<void> {
  const db = await getDbConnection();
  await executeQuery(
    db,
    `UPDATE credits
     SET status = ?, estadoServidor = ?, sync_status = ?, updated_at = ?
     WHERE local_id = ? OR server_id = ?;`,
    [
      'paid',
      ESTADO_SINCRONIZACION.PENDING,
      ESTADO_SINCRONIZACION.PENDING,
      new Date().toISOString(),
      id,
      id,
    ],
  );

  scheduleSync();
}

/**
 * Anula un movimiento (fiado o abono) de un cliente con trazabilidad:
 * - Cambia su estado a 'cancelled' (para que se muestre tachado y gris en el historial).
 * - Si es fiado (credit): resta el monto del saldo deudor del cliente.
 * - Si es abono (payment): suma de vuelta el monto al saldo deudor del cliente.
 * - Actualiza el registro en Supabase con status = 'cancelled' (donde los triggers recalculan el saldo excluyéndolo).
 */
export async function voidMovement(params: {
  id: string;
  kind: 'credit' | 'payment';
  customerId: string;
  amount: number;
}): Promise<void> {
  const { id, kind, customerId, amount } = params;
  const activeStoreId = await getActiveStoreId();
  const db = await getDbConnection();
  const now = new Date().toISOString();

  if (kind === 'credit') {
    // 1. Validar que no se cancele más saldo del que el cliente debe actualmente
    // para evitar saldos a favor (deuda negativa oculta).
    const custRows = await getData(
      db,
      'SELECT current_balance, server_id FROM customers WHERE (local_id = ? OR server_id = ?) LIMIT 1;',
      [customerId, customerId],
    );
    const currentBal = Number(custRows[0]?.current_balance ?? 0);
    const targetCustomerServerId = custRows[0]?.server_id || customerId;

    if (amount > currentBal) {
      throw new Error(
        `No es posible anular este fiado ($${amount}) porque supera la deuda actual del cliente ($${currentBal}). Anula primero los abonos correspondientes para no generar saldo a favor.`,
      );
    }

    await executeInTransaction(db, async () => {
      const rows = await getData(
        db,
        'SELECT server_id, local_id FROM credits WHERE (server_id = ? OR local_id = ?) LIMIT 1;',
        [id, id],
      );
      const serverId = rows[0]?.server_id || (id.includes('-') && id.length === 36 ? id : null);

      await executeQuery(
        db,
        `UPDATE credits
         SET status = 'cancelled', estadoServidor = ?, sync_status = ?, updated_at = ?
         WHERE (server_id = ? OR local_id = ?);`,
        [ESTADO_SINCRONIZACION.SYNCED, ESTADO_SINCRONIZACION.SYNCED, now, id, id],
      );

      await executeQuery(
        db,
        `UPDATE customers
         SET current_balance = MAX(0, current_balance - ?)
         WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "");`,
        [amount, customerId, customerId, activeStoreId || ''],
      );

      if (serverId) {
        try {
          const { error: updErr } = await supabase.from('credits').update({ status: 'cancelled' }).eq('id', serverId);
          if (updErr) throw updErr;

          notifyCustomerMovement({
            customerId: targetCustomerServerId,
            storeId: activeStoreId,
            type: 'credit',
            status: 'cancelled',
            amount,
            movementId: serverId,
          }).catch(notifErr => {
            console.warn('[voidMovement] Error notificando crédito anulado:', notifErr?.message);
          });
        } catch (e) {
          console.warn('[voidMovement] Error anulando crédito en Supabase (se pospone para sync):', e);
          await executeQuery(
            db,
            `UPDATE credits SET sync_status = ?, estadoServidor = ? WHERE (server_id = ? OR local_id = ?);`,
            [ESTADO_SINCRONIZACION.PENDING, ESTADO_SINCRONIZACION.PENDING, id, id],
          );
        }
      }
    });
  } else {
    const custRows = await getData(
      db,
      'SELECT server_id FROM customers WHERE (local_id = ? OR server_id = ?) LIMIT 1;',
      [customerId, customerId],
    );
    const targetCustomerServerId = custRows[0]?.server_id || customerId;

    await executeInTransaction(db, async () => {
      const rows = await getData(
        db,
        'SELECT server_id, local_id FROM payments WHERE (server_id = ? OR local_id = ?) LIMIT 1;',
        [id, id],
      );
      const serverId = rows[0]?.server_id || (id.includes('-') && id.length === 36 ? id : null);

      await executeQuery(
        db,
        `UPDATE payments
         SET status = 'cancelled', estadoServidor = ?, sync_status = ?, updated_at = ?
         WHERE (server_id = ? OR local_id = ?);`,
        [ESTADO_SINCRONIZACION.SYNCED, ESTADO_SINCRONIZACION.SYNCED, now, id, id],
      );

      await executeQuery(
        db,
        `UPDATE customers
         SET current_balance = current_balance + ?
         WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "");`,
        [amount, customerId, customerId, activeStoreId || ''],
      );

      if (serverId) {
        try {
          const { error: updErr } = await supabase.from('payments').update({ status: 'cancelled' }).eq('id', serverId);
          if (updErr) throw updErr;

          notifyCustomerMovement({
            customerId: targetCustomerServerId,
            storeId: activeStoreId,
            type: 'payment',
            status: 'cancelled',
            amount,
            movementId: serverId,
          }).catch(notifErr => {
            console.warn('[voidMovement] Error notificando abono anulado:', notifErr?.message);
          });
        } catch (e) {
          console.warn('[voidMovement] Error anulando abono en Supabase (se pospone para sync):', e);
          await executeQuery(
            db,
            `UPDATE payments SET sync_status = ?, estadoServidor = ? WHERE (server_id = ? OR local_id = ?);`,
            [ESTADO_SINCRONIZACION.PENDING, ESTADO_SINCRONIZACION.PENDING, id, id],
          );
        }
      }
    });
  }

  scheduleSync();
}
