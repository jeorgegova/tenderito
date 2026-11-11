import NetInfo from '@react-native-community/netinfo';
import {getDbConnection, getData, executeQuery, executeInTransaction} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {getWriteDate, saveWriteDate, saveConfigParam} from '../database/tables/metadata';
import {insertOrReplaceSubscriptionPlan} from '../database/tables/plans';
import {supabase} from '../lib/supabase';
import {useStore} from '../store/useStore';
import {notifyCustomerMovement} from './deviceService';
import {refreshSubscriptionLifecycle} from './portfolio';
import {getActiveStoreId, clearStoreContext} from './storeContext';

export {getActiveStoreId, clearStoreContext};

let syncInProgress: Promise<any> | null = null;
let lastPullTimestamp = 0;
let debounceTimer: NodeJS.Timeout | null = null;

// Reintentos con backoff exponencial
let consecutiveFailures = 0;
let nextAllowedRetryTime = 0;

// Parámetros de optimización de cuota y tráfico Supabase
const MIN_PULL_INTERVAL_MS = 60_000; // Mínimo 1 minuto entre descargas completas automáticas
const DEBOUNCE_DELAY_MS = 2_500; // 2.5 segundos para agrupar múltiples escrituras consecutivas
const MAX_CONCURRENT_PUSH = 3; // Límite estricto de peticiones simultáneas hacia Supabase
const PULL_PAGE_LIMIT = 150; // Limitar tamaño de lote para minimizar egress

export function clearCachedStoreId() {
  clearStoreContext();
  lastPullTimestamp = 0;
  consecutiveFailures = 0;
  nextAllowedRetryTime = 0;
}

/**
 * Recupera cualquier operación local que haya quedado en estado 'syncing'
 * debido a un cierre inesperado o caída de la aplicación, regresándola a 'pending'.
 */
export async function recoverInterruptedSync(db: any): Promise<void> {
  try {
    await executeQuery(
      db,
      `UPDATE customers SET sync_status = 'pending', estadoServidor = 'pending'
       WHERE sync_status = 'syncing' OR estadoServidor = 'syncing';`,
    );
    await executeQuery(
      db,
      `UPDATE credits SET sync_status = 'pending', estadoServidor = 'pending'
       WHERE sync_status = 'syncing' OR estadoServidor = 'syncing';`,
    );
    await executeQuery(
      db,
      `UPDATE payments SET sync_status = 'pending', estadoServidor = 'pending'
       WHERE sync_status = 'syncing' OR estadoServidor = 'syncing';`,
    );
  } catch (_e) {}
}

/**
 * Bloqueo de concurrencia para sincronización.
 * Previene ejecuciones simultáneas de sincronización y condiciones de carrera.
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
 * Helper para procesar tareas con concurrencia limitada para evitar
 * saturar el rate limit (429) de Supabase.
 */
async function processInChunks<T>(
  items: T[],
  chunkSize: number,
  task: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map(task));
  }
}

/**
 * Cuenta cuántos registros pendientes de sincronizar existen en SQLite local.
 * Consulta ultra rápida que no toca la red.
 */
export async function countPendingLocalItems(db: any): Promise<number> {
  try {
    const rows = await getData(
      db,
      `SELECT (
         (SELECT COUNT(*) FROM customers WHERE estadoServidor IN ('pending', 'pendiente', 'syncing', 'error') OR sync_status IN ('pending', 'pendiente', 'syncing', 'error')) +
         (SELECT COUNT(*) FROM credits WHERE estadoServidor IN ('pending', 'pendiente', 'syncing', 'error') OR sync_status IN ('pending', 'pendiente', 'syncing', 'error')) +
         (SELECT COUNT(*) FROM payments WHERE estadoServidor IN ('pending', 'pendiente', 'syncing', 'error') OR sync_status IN ('pending', 'pendiente', 'syncing', 'error'))
       ) AS total;`,
    );
    return Number(rows[0]?.total || 0);
  } catch (_e) {
    return 0;
  }
}

/**
 * Empuja a Supabase todos los clientes creados localmente que están pendientes.
 * Controla dependencias, marca estado 'syncing' y confirma a 'synced'.
 */
async function pushPendingCustomers(db: any) {
  const activeStoreId = await getActiveStoreId();
  const pending = await getData(
    db,
    `SELECT * FROM customers
     WHERE (estadoServidor IN ('pending', 'pendiente', 'error') OR sync_status IN ('pending', 'pendiente', 'error'))
       AND (store_id = ? OR store_id IS NULL OR store_id = '')
     LIMIT 50;`,
    [activeStoreId || ''],
  );

  if (pending.length === 0) {
    return;
  }

  await processInChunks(pending, MAX_CONCURRENT_PUSH, async item => {
    // 1. Marcar como syncing
    await executeQuery(
      db,
      `UPDATE customers SET sync_status = 'syncing', estadoServidor = 'syncing' WHERE local_id = ?;`,
      [item.local_id],
    );

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

      if (error) {
        throw error;
      }

      const serverId = data?.id || data;
      const now = new Date().toISOString();

      // 2. Marcar como sincronizado y registrar server_id
      await executeQuery(
        db,
        `UPDATE customers
         SET server_id = ?, store_id = COALESCE(NULLIF(store_id, ''), ?),
             estadoServidor = 'synced', sync_status = 'synced', last_synced_at = ?, updated_at = ?
         WHERE local_id = ?;`,
        [serverId, activeStoreId || '', now, now, item.local_id],
      );
    } catch (e: any) {
      console.warn(
        `[Sync] Error sincronizando cliente local ${item.local_id}:`,
        e?.message,
      );
      // Revertir a pending para reintento posterior
      await executeQuery(
        db,
        `UPDATE customers SET sync_status = 'pending', estadoServidor = 'pending' WHERE local_id = ?;`,
        [item.local_id],
      );
      throw e;
    }
  });
}

/**
 * Empuja a Supabase todos los créditos creados localmente que están pendientes.
 * Respeta dependencias con clientes y aplica idempotencia enviando p_id: item.local_id.
 */
async function pushPendingCredits(db: any) {
  const activeStoreId = await getActiveStoreId();
  const pending = await getData(
    db,
    `SELECT c.*, cust.server_id AS customer_server_id
     FROM credits c
     LEFT JOIN customers cust ON (c.customer_id = cust.local_id OR c.customer_id = cust.server_id)
     WHERE (c.estadoServidor IN ('pending', 'pendiente', 'error') OR c.sync_status IN ('pending', 'pendiente', 'error'))
       AND (c.store_id = ? OR c.store_id IS NULL OR c.store_id = '')
     LIMIT 50;`,
    [activeStoreId || ''],
  );

  if (pending.length === 0) {
    return;
  }

  await processInChunks(pending, MAX_CONCURRENT_PUSH, async item => {
    let targetCustomerId = item.customer_server_id || item.customer_id;

    // Si el cliente no tiene server_id aún, consultar SQLite por si acaba de sincronizarse
    if (!item.customer_server_id) {
      const custRow = await getData(
        db,
        'SELECT server_id FROM customers WHERE local_id = ? LIMIT 1;',
        [item.customer_id],
      );
      if (custRow.length > 0 && custRow[0].server_id) {
        targetCustomerId = custRow[0].server_id;
      } else {
        // El cliente aún no se ha sincronizado en Supabase; posponer este crédito
        return;
      }
    }

    // 1. Marcar como syncing
    await executeQuery(
      db,
      `UPDATE credits SET sync_status = 'syncing', estadoServidor = 'syncing' WHERE local_id = ?;`,
      [item.local_id],
    );

    try {
      let serverId: string | null = null;
      try {
        // Intento con p_id para garantizar idempotencia estricta en el servidor
        const {data, error} = await supabase.rpc('create_credit', {
          p_customer_id: targetCustomerId,
          p_concept: item.concept,
          p_amount: Number(item.amount),
          p_due_date: item.due_date || null,
          p_id: item.local_id,
        });
        if (error) throw error;
        serverId = data?.id || data;
      } catch (rpcErr: any) {
        // Fallback si la función RPC aún no recibe el parámetro p_id
        if (rpcErr?.message?.includes('p_id') || rpcErr?.code === 'PGRST202') {
          const {data, error} = await supabase.rpc('create_credit', {
            p_customer_id: targetCustomerId,
            p_concept: item.concept,
            p_amount: Number(item.amount),
            p_due_date: item.due_date || null,
          });
          if (error) throw error;
          serverId = data?.id || data;
        } else {
          throw rpcErr;
        }
      }

      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE credits
         SET server_id = ?, store_id = COALESCE(NULLIF(store_id, ''), ?),
             estadoServidor = 'synced', sync_status = 'synced', last_synced_at = ?, updated_at = ?
         WHERE local_id = ?;`,
        [serverId, activeStoreId || '', now, now, item.local_id],
      );

      // Notificar al cliente si tiene celular vinculado
      notifyCustomerMovement({
        customerId: targetCustomerId,
        storeId: item.store_id || activeStoreId,
        type: 'credit',
        amount: Number(item.amount),
        concept: item.concept,
        movementId: serverId,
      }).catch(notifErr => {
        console.warn('[Sync] Error notificando crédito:', notifErr?.message);
      });
    } catch (e: any) {
      console.warn(
        `[Sync] Error sincronizando crédito local ${item.local_id}:`,
        e?.message,
      );
      await executeQuery(
        db,
        `UPDATE credits SET sync_status = 'pending', estadoServidor = 'pending' WHERE local_id = ?;`,
        [item.local_id],
      );
      throw e;
    }
  });
}

/**
 * Empuja a Supabase todos los abonos creados localmente que están pendientes.
 * Respeta dependencias con clientes y créditos, y aplica idempotencia enviando p_id.
 */
async function pushPendingPayments(db: any) {
  const activeStoreId = await getActiveStoreId();
  const pending = await getData(
    db,
    `SELECT p.*,
            cust.server_id AS customer_server_id,
            cred.server_id AS credit_server_id
     FROM payments p
     LEFT JOIN customers cust ON (p.customer_id = cust.local_id OR p.customer_id = cust.server_id)
     LEFT JOIN credits cred ON (p.credit_id = cred.local_id OR p.credit_id = cred.server_id)
     WHERE (p.estadoServidor IN ('pending', 'pendiente', 'error') OR p.sync_status IN ('pending', 'pendiente', 'error'))
       AND (p.store_id = ? OR p.store_id IS NULL OR p.store_id = '')
     LIMIT 50;`,
    [activeStoreId || ''],
  );

  if (pending.length === 0) {
    return;
  }

  await processInChunks(pending, MAX_CONCURRENT_PUSH, async item => {
    let targetCustomerId = item.customer_server_id || item.customer_id;

    if (!item.customer_server_id) {
      const custRow = await getData(
        db,
        'SELECT server_id FROM customers WHERE local_id = ? LIMIT 1;',
        [item.customer_id],
      );
      if (custRow.length > 0 && custRow[0].server_id) {
        targetCustomerId = custRow[0].server_id;
      } else {
        return; // Esperar a que el cliente se sincronice
      }
    }

    let targetCreditId = item.credit_server_id || item.credit_id || null;
    if (item.credit_id && !item.credit_server_id) {
      const credRow = await getData(
        db,
        'SELECT server_id FROM credits WHERE local_id = ? LIMIT 1;',
        [item.credit_id],
      );
      if (credRow.length > 0 && credRow[0].server_id) {
        targetCreditId = credRow[0].server_id;
      }
    }

    // 1. Marcar como syncing
    await executeQuery(
      db,
      `UPDATE payments SET sync_status = 'syncing', estadoServidor = 'syncing' WHERE local_id = ?;`,
      [item.local_id],
    );

    try {
      let serverId: string | null = null;
      try {
        const {data, error} = await supabase.rpc('create_payment', {
          p_customer_id: targetCustomerId,
          p_credit_id: targetCreditId,
          p_amount: Number(item.amount),
          p_notes: item.notes || null,
          p_id: item.local_id,
        });
        if (error) throw error;
        serverId = data?.id || data;
      } catch (rpcErr: any) {
        if (rpcErr?.message?.includes('p_id') || rpcErr?.code === 'PGRST202') {
          const {data, error} = await supabase.rpc('create_payment', {
            p_customer_id: targetCustomerId,
            p_credit_id: targetCreditId,
            p_amount: Number(item.amount),
            p_notes: item.notes || null,
          });
          if (error) throw error;
          serverId = data?.id || data;
        } else {
          throw rpcErr;
        }
      }

      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE payments
         SET server_id = ?, store_id = COALESCE(NULLIF(store_id, ''), ?),
             estadoServidor = 'synced', sync_status = 'synced', last_synced_at = ?, updated_at = ?
         WHERE local_id = ?;`,
        [serverId, activeStoreId || '', now, now, item.local_id],
      );

      // Notificar al cliente si tiene celular vinculado
      notifyCustomerMovement({
        customerId: targetCustomerId,
        storeId: item.store_id || activeStoreId,
        type: 'payment',
        amount: Number(item.amount),
        notes: item.notes,
        movementId: serverId,
      }).catch(notifErr => {
        console.warn('[Sync] Error notificando abono:', notifErr?.message);
      });
    } catch (e: any) {
      console.warn(
        `[Sync] Error sincronizando abono local ${item.local_id}:`,
        e?.message,
      );
      await executeQuery(
        db,
        `UPDATE payments SET sync_status = 'pending', estadoServidor = 'pending' WHERE local_id = ?;`,
        [item.local_id],
      );
      throw e;
    }
  });
}

/**
 * Guarda o reemplaza un cliente descargado desde Supabase en la tabla local customers.
 * Protege cambios locales pendientes de sincronizar para no ser sobreescritos.
 */
export async function insertOrReplaceCustomer(db: any, row: any) {
  const now = new Date().toISOString();
  const c = row.customers || row;
  const customerId = c.id;
  const alias = row.alias || c.alias || '';
  const currentBalance = Number(row.current_balance ?? c.current_balance ?? 0);
  const creditLimit = Number(row.credit_limit ?? c.credit_limit ?? 0);
  const freePlanSelected =
    row.free_plan_selected ?? c.free_plan_selected ?? true;

  const storeId = row.store_id || c.store_id || '';

  const existing = await getData(
    db,
    'SELECT local_id, sync_status, estadoServidor FROM customers WHERE (server_id = ? OR local_id = ?) AND store_id = ? LIMIT 1;',
    [customerId, customerId, storeId],
  );

  // Si hay cambios locales pendientes o en vuelo, protegerlos
  if (
    existing.length > 0 &&
    (existing[0].sync_status === 'pending' ||
      existing[0].sync_status === 'syncing' ||
      existing[0].estadoServidor === 'pending' ||
      existing[0].estadoServidor === 'pendiente' ||
      existing[0].estadoServidor === 'syncing')
  ) {
    return;
  }

  const localId =
    existing.length > 0
      ? existing[0].local_id
      : storeId
      ? `${customerId}_${storeId}`
      : customerId;

  await executeQuery(
    db,
    `INSERT OR REPLACE INTO customers (
       local_id, server_id, store_id, name, document_type, document_number,
       phone, notes, alias, current_balance, credit_limit, free_plan_selected,
       estadoServidor, sync_status, last_synced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      localId,
      customerId,
      storeId,
      c.name,
      c.document_type || 'CC',
      c.document_number,
      c.phone || '',
      c.notes || '',
      alias,
      currentBalance,
      creditLimit,
      freePlanSelected ? 1 : 0,
      'synced',
      'synced',
      now,
      c.created_at || now,
      c.updated_at || now,
    ],
  );
}

/**
 * Guarda o reemplaza un crédito descargado desde Supabase en la tabla local credits.
 */
export async function insertOrReplaceCredit(db: any, cr: any) {
  const now = new Date().toISOString();
  const storeId = cr.store_id || '';
  const existing = await getData(
    db,
    'SELECT local_id, sync_status, estadoServidor FROM credits WHERE (server_id = ? OR local_id = ?) AND (store_id = ? OR store_id = "") LIMIT 1;',
    [cr.id, cr.id, storeId],
  );

  if (
    existing.length > 0 &&
    (existing[0].sync_status === 'pending' ||
      existing[0].sync_status === 'syncing' ||
      existing[0].estadoServidor === 'pending' ||
      existing[0].estadoServidor === 'pendiente' ||
      existing[0].estadoServidor === 'syncing')
  ) {
    return;
  }

  const localId = existing.length > 0 ? existing[0].local_id : cr.id;

  await executeQuery(
    db,
    `INSERT OR REPLACE INTO credits (
       local_id, server_id, customer_id, store_id, concept,
       amount, due_date, status, estadoServidor, sync_status,
       last_synced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      localId,
      cr.id,
      cr.customer_id,
      storeId,
      cr.concept,
      Number(cr.amount),
      cr.due_date || null,
      cr.status || 'pending',
      'synced',
      'synced',
      now,
      cr.created_at || now,
      now,
    ],
  );
}

/**
 * Guarda o reemplaza un pago descargado desde Supabase en la tabla local payments.
 */
export async function insertOrReplacePayment(db: any, p: any) {
  const now = new Date().toISOString();
  const storeId = p.store_id || '';
  const existing = await getData(
    db,
    'SELECT local_id, sync_status, estadoServidor FROM payments WHERE (server_id = ? OR local_id = ?) AND (store_id = ? OR store_id = "") LIMIT 1;',
    [p.id, p.id, storeId],
  );

  if (
    existing.length > 0 &&
    (existing[0].sync_status === 'pending' ||
      existing[0].sync_status === 'syncing' ||
      existing[0].estadoServidor === 'pending' ||
      existing[0].estadoServidor === 'pendiente' ||
      existing[0].estadoServidor === 'syncing')
  ) {
    return;
  }

  const localId = existing.length > 0 ? existing[0].local_id : p.id;

  await executeQuery(
    db,
    `INSERT OR REPLACE INTO payments (
       local_id, server_id, customer_id, credit_id, store_id,
       amount, notes, payment_date, estadoServidor, sync_status,
       last_synced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      localId,
      p.id,
      p.customer_id,
      p.credit_id || null,
      p.store_id || '',
      Number(p.amount),
      p.notes || null,
      p.payment_date || now,
      'synced',
      'synced',
      now,
      p.created_at || now,
      now,
    ],
  );
}

/**
 * Descarga incremental optimizada:
 * - Solicita únicamente las columnas estrictamente necesarias (evita select * para ahorrar egress).
 * - Utiliza writeDate para descargar solo los deltas modificados.
 * - Limita el tamaño de respuesta por página para no saturar memoria ni ancho de banda.
 * - Ejecuta todas las inserciones por lotes dentro de transacciones atómicas SQLite.
 */
async function pullRemoteData(db: any): Promise<boolean> {
  try {
    await refreshSubscriptionLifecycle();

    const activeStoreId = await getActiveStoreId();
    if (!activeStoreId) {
      return false;
    }

    // 1. Descarga autoritativa de clientes y cartera vinculada a la tienda activa
    const {data: storeCustomers, error: custErr} = await supabase
      .from('customer_stores')
      .select(
        'store_id, current_balance, credit_limit, alias, free_plan_selected, joined_at, customers!inner(id, name, document_type, document_number, phone, notes, created_at)',
      )
      .eq('store_id', activeStoreId)
      .limit(PULL_PAGE_LIMIT);

    if (!custErr && storeCustomers && storeCustomers.length > 0) {
      await executeInTransaction(db, async () => {
        for (const row of storeCustomers as any[]) {
          await insertOrReplaceCustomer(db, {...row, store_id: activeStoreId});
        }
      });
    }

    // 2. Descarga incremental de créditos pertenecientes a la tienda activa
    const lastWriteDateCred = await getWriteDate(db, 'credits', activeStoreId);
    let credQuery = supabase
      .from('credits')
      .select(
        'id, store_id, customer_id, concept, amount, due_date, status, created_at',
      )
      .eq('store_id', activeStoreId)
      .order('created_at', {ascending: true})
      .limit(PULL_PAGE_LIMIT);

    if (lastWriteDateCred) {
      credQuery = credQuery.gt('created_at', lastWriteDateCred);
    }

    const {data: remoteCredits, error: credErr} = await credQuery;
    if (!credErr && remoteCredits && remoteCredits.length > 0) {
      let maxCredDate = lastWriteDateCred || new Date(0).toISOString();
      await executeInTransaction(db, async () => {
        for (const cr of remoteCredits as any[]) {
          await insertOrReplaceCredit(db, {...cr, store_id: activeStoreId});
          if (cr.created_at && cr.created_at > maxCredDate) {
            maxCredDate = cr.created_at;
          }
        }
      });
      await saveWriteDate(db, 'credits', maxCredDate, activeStoreId);
    }

    // 3. Descarga incremental de pagos pertenecientes a la tienda activa
    const lastWriteDatePay = await getWriteDate(db, 'payments', activeStoreId);
    let payQuery = supabase
      .from('payments')
      .select(
        'id, store_id, customer_id, credit_id, amount, notes, payment_date, created_at',
      )
      .eq('store_id', activeStoreId)
      .order('created_at', {ascending: true})
      .limit(PULL_PAGE_LIMIT);

    if (lastWriteDatePay) {
      payQuery = payQuery.gt('created_at', lastWriteDatePay);
    }

    const {data: remotePayments, error: payErr} = await payQuery;
    if (!payErr && remotePayments && remotePayments.length > 0) {
      let maxPayDate = lastWriteDatePay || new Date(0).toISOString();
      await executeInTransaction(db, async () => {
        for (const p of remotePayments as any[]) {
          await insertOrReplacePayment(db, {...p, store_id: activeStoreId});
          const pDate = p.created_at || p.payment_date;
          if (pDate && pDate > maxPayDate) {
            maxPayDate = pDate;
          }
        }
      });
      await saveWriteDate(db, 'payments', maxPayDate, activeStoreId);
    }

    // 4. Descarga de planes de suscripción parametrizables
    try {
      const {data: plansData} = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', {ascending: true});
      if (plansData && plansData.length > 0) {
        for (const pl of plansData) {
          await insertOrReplaceSubscriptionPlan(db, pl);
        }
      }
    } catch (_plansErr) {}

    // 5. Descarga de configuración de plataforma
    try {
      const {data: configData} = await supabase
        .from('app_config')
        .select('key, value');
      if (configData && configData.length > 0) {
        for (const cfg of configData) {
          await saveConfigParam(db, cfg.key, cfg.value);
        }
      }
    } catch (_cfgErr) {}

    // 6. Actualización de perfil del usuario
    try {
      const {
        data: {user},
      } = await supabase.auth.getUser();
      if (user) {
        const {data: profileData} = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (profileData) {
          useStore.getState().setProfile(profileData as any);
        }
      }
    } catch (_profErr) {}

    // Marcar descarga inicial completada con éxito
    await saveConfigParam(db, `initial_sync_${activeStoreId}`, 'completed');
  } catch (e: any) {
    console.warn(
      '[Sync] Error descargando datos incrementales remotos:',
      e?.message,
    );
    return false;
  }
  return true;
}

export interface SyncOptions {
  force?: boolean; // Forzar descarga incluso si está dentro del cooldown
}

/**
 * Método principal de sincronización (Offline-First y optimizado para tráfico):
 * 1. Verifica conectividad antes de intentar llamadas de red.
 * 2. Verifica si hay pendientes en SQLite local antes de consultar al servidor.
 * 3. Ejecuta Push solo si hay pendientes reales (con orden de dependencias e idempotencia).
 * 4. Aplica cooldown a las descargas para no quemar cuota ni egress de Supabase.
 */
export async function sincronizar(
  options?: SyncOptions,
): Promise<{pushed: boolean; pulled: boolean}> {
  return withSyncLock(async () => {
    try {
      const now = Date.now();

      // Control de backoff progresivo si hubo fallas consecutivas previas
      if (now < nextAllowedRetryTime && !options?.force) {
        return {pushed: false, pulled: false};
      }

      const netState = await NetInfo.fetch();
      const isOnline = Boolean(
        netState.isConnected && netState.isInternetReachable !== false,
      );
      if (!isOnline) {
        return {pushed: false, pulled: false};
      }

      const db = await getDbConnection();

      // Recuperar cualquier operación interrumpida
      await recoverInterruptedSync(db);

      const pendingCount = await countPendingLocalItems(db);
      let didPush = false;
      let didPull = false;

      // Fase 1: Subida ordenada según dependencias
      if (pendingCount > 0) {
        await pushPendingCustomers(db);
        await pushPendingCredits(db);
        await pushPendingPayments(db);
        didPush = true;
      }

      // Fase 2: Descarga incremental con Cooldown para ahorrar peticiones
      const shouldPull =
        options?.force ||
        didPush ||
        now - lastPullTimestamp >= MIN_PULL_INTERVAL_MS;

      if (shouldPull) {
        const pullSuccess = await pullRemoteData(db);
        if (pullSuccess) {
          lastPullTimestamp = Date.now();
          didPull = true;
        }
      }

      // Éxito: restablecer contadores de fallo
      consecutiveFailures = 0;
      nextAllowedRetryTime = 0;

      return {pushed: didPush, pulled: didPull};
    } catch (error: any) {
      consecutiveFailures++;
      const backoffMs = Math.min(30_000, 2000 * Math.pow(2, consecutiveFailures - 1));
      nextAllowedRetryTime = Date.now() + backoffMs;
      console.warn(
        `[Sync] Error en ciclo de sincronización (reintento en ${backoffMs / 1000}s):`,
        error?.message,
      );
      return {pushed: false, pulled: false};
    }
  });
}

/**
 * Programa una sincronización con debounce para agrupar múltiples operaciones
 * locales consecutivas en una única llamada hacia Supabase.
 */
export function scheduleSync(
  delayMs = DEBOUNCE_DELAY_MS,
  onFinish?: () => void,
) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    sincronizar()
      .then(() => {
        onFinish?.();
      })
      .catch(() => {});
  }, delayMs);
}

/**
 * Alias de compatibilidad
 */
export const syncAll = sincronizar;
