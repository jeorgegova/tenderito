import NetInfo from '@react-native-community/netinfo';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {getWriteDate, saveWriteDate, saveConfigParam} from '../database/tables/metadata';
import {insertOrReplaceSubscriptionPlan} from '../database/tables/plans';
import {supabase} from '../lib/supabase';
import {useStore} from '../store/useStore';

let syncInProgress: Promise<any> | null = null;
let lastPullTimestamp = 0;
let debounceTimer: NodeJS.Timeout | null = null;

// Parámetros de optimización de cuota y tráfico Supabase
const MIN_PULL_INTERVAL_MS = 60_000; // Mínimo 1 minuto entre descargas completas automáticas
const DEBOUNCE_DELAY_MS = 2_500; // 2.5 segundos para agrupar múltiples escrituras consecutivas
const MAX_CONCURRENT_PUSH = 3; // Límite estricto de peticiones simultáneas hacia Supabase
const PULL_PAGE_LIMIT = 150; // Limitar tamaño de lote para minimizar egress

let cachedStoreId: string | null = null;

/**
 * Obtiene el ID de la tienda activa del usuario actual para garantizar
 * aislamiento estricto de datos en todas las consultas y almacenamiento.
 */
export async function getActiveStoreId(): Promise<string | null> {
  if (cachedStoreId) {
    return cachedStoreId;
  }
  try {
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }
    const {data, error} = await supabase
      .from('store_memberships')
      .select('store_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!error && data?.store_id) {
      cachedStoreId = data.store_id;
      return cachedStoreId;
    }
  } catch (_e) {}
  return null;
}

export function clearCachedStoreId() {
  cachedStoreId = null;
  lastPullTimestamp = 0;
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
         (SELECT COUNT(*) FROM customers WHERE estadoServidor = 'pendiente' OR sync_status = 'pendiente' OR sync_status = 'pendiente_creacion') +
         (SELECT COUNT(*) FROM credits WHERE estadoServidor = 'pendiente' OR sync_status = 'pendiente' OR sync_status = 'pendiente_creacion') +
         (SELECT COUNT(*) FROM payments WHERE estadoServidor = 'pendiente' OR sync_status = 'pendiente' OR sync_status = 'pendiente_creacion')
       ) AS total;`,
    );
    return Number(rows[0]?.total || 0);
  } catch (_e) {
    return 0;
  }
}

/**
 * Empuja a Supabase todos los clientes creados localmente que están pendientes.
 * Controla concurrencia y actualiza estado a 'sincronizado'.
 */
async function pushPendingCustomers(db: any) {
  const pending = await getData(
    db,
    `SELECT * FROM customers
     WHERE estadoServidor = ? OR sync_status = 'pendiente' OR sync_status = 'pendiente_creacion'
     LIMIT 50;`,
    [ESTADO_SINCRONIZACION.PENDIENTE],
  );

  if (pending.length === 0) {
    return;
  }

  await processInChunks(pending, MAX_CONCURRENT_PUSH, async item => {
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

      await executeQuery(
        db,
        `UPDATE customers
         SET server_id = ?, estadoServidor = ?, sync_status = ?, last_synced_at = ?, updated_at = ?
         WHERE local_id = ?;`,
        [
          serverId,
          ESTADO_SINCRONIZACION.SINCRONIZADO,
          ESTADO_SINCRONIZACION.SINCRONIZADO,
          now,
          now,
          item.local_id,
        ],
      );
    } catch (e: any) {
      console.warn(
        `[Sync] Error sincronizando cliente local ${item.local_id}:`,
        e?.message,
      );
    }
  });
}

/**
 * Empuja a Supabase todos los créditos creados localmente que están pendientes.
 * Controla concurrencia para minimizar peticiones HTTP simultáneas.
 */
async function pushPendingCredits(db: any) {
  const pending = await getData(
    db,
    `SELECT c.*, cust.server_id AS customer_server_id
     FROM credits c
     LEFT JOIN customers cust ON (c.customer_id = cust.local_id OR c.customer_id = cust.server_id)
     WHERE c.estadoServidor = ? OR c.sync_status = 'pendiente' OR c.sync_status = 'pendiente_creacion'
     LIMIT 50;`,
    [ESTADO_SINCRONIZACION.PENDIENTE],
  );

  if (pending.length === 0) {
    return;
  }

  await processInChunks(pending, MAX_CONCURRENT_PUSH, async item => {
    try {
      const targetCustomerId = item.customer_server_id || item.customer_id;
      if (!targetCustomerId) {
        return;
      }

      const {data, error} = await supabase.rpc('create_credit', {
        p_customer_id: targetCustomerId,
        p_concept: item.concept,
        p_amount: Number(item.amount),
        p_due_date: item.due_date || null,
      });

      if (error) {
        throw error;
      }

      const serverId = data?.id || data;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE credits
         SET server_id = ?, estadoServidor = ?, sync_status = ?, last_synced_at = ?, updated_at = ?
         WHERE local_id = ?;`,
        [
          serverId,
          ESTADO_SINCRONIZACION.SINCRONIZADO,
          ESTADO_SINCRONIZACION.SINCRONIZADO,
          now,
          now,
          item.local_id,
        ],
      );
    } catch (e: any) {
      console.warn(
        `[Sync] Error sincronizando crédito local ${item.local_id}:`,
        e?.message,
      );
    }
  });
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
     LEFT JOIN customers cust ON (p.customer_id = cust.local_id OR p.customer_id = cust.server_id)
     LEFT JOIN credits cred ON (p.credit_id = cred.local_id OR p.credit_id = cred.server_id)
     WHERE p.estadoServidor = ? OR p.sync_status = 'pendiente' OR p.sync_status = 'pendiente_creacion'
     LIMIT 50;`,
    [ESTADO_SINCRONIZACION.PENDIENTE],
  );

  if (pending.length === 0) {
    return;
  }

  await processInChunks(pending, MAX_CONCURRENT_PUSH, async item => {
    try {
      const targetCustomerId = item.customer_server_id || item.customer_id;
      if (!targetCustomerId) {
        return;
      }

      const targetCreditId = item.credit_server_id || item.credit_id || null;

      const {data, error} = await supabase.rpc('create_payment', {
        p_customer_id: targetCustomerId,
        p_credit_id: targetCreditId,
        p_amount: Number(item.amount),
        p_notes: item.notes || null,
      });

      if (error) {
        throw error;
      }

      const serverId = data?.id || data;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        `UPDATE payments
         SET server_id = ?, estadoServidor = ?, sync_status = ?, last_synced_at = ?, updated_at = ?
         WHERE local_id = ?;`,
        [
          serverId,
          ESTADO_SINCRONIZACION.SINCRONIZADO,
          ESTADO_SINCRONIZACION.SINCRONIZADO,
          now,
          now,
          item.local_id,
        ],
      );
    } catch (e: any) {
      console.warn(
        `[Sync] Error sincronizando abono local ${item.local_id}:`,
        e?.message,
      );
    }
  });
}

/**
 * Guarda o reemplaza un cliente descargado desde Supabase en la tabla local customers.
 */
export async function insertOrReplaceCustomer(db: any, row: any) {
  const now = new Date().toISOString();
  const c = row.customers || row;
  const customerId = c.id;
  const alias = row.alias || c.alias || '';
  const currentBalance = Number(row.current_balance ?? c.current_balance ?? 0);
  const creditLimit = Number(row.credit_limit ?? c.credit_limit ?? 0);

  const existing = await getData(
    db,
    'SELECT local_id, estadoServidor FROM customers WHERE server_id = ? OR local_id = ? LIMIT 1;',
    [customerId, customerId],
  );

  if (
    existing.length > 0 &&
    existing[0].estadoServidor === ESTADO_SINCRONIZACION.PENDIENTE
  ) {
    return;
  }

  const localId = existing.length > 0 ? existing[0].local_id : customerId;

  const storeId = row.store_id || c.store_id || '';

  await executeQuery(
    db,
    `INSERT OR REPLACE INTO customers (
       local_id, server_id, store_id, name, document_type, document_number,
       phone, notes, alias, current_balance, credit_limit,
       estadoServidor, sync_status, last_synced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      ESTADO_SINCRONIZACION.SINCRONIZADO,
      ESTADO_SINCRONIZACION.SINCRONIZADO,
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
  const existing = await getData(
    db,
    'SELECT local_id, estadoServidor FROM credits WHERE server_id = ? OR local_id = ? LIMIT 1;',
    [cr.id, cr.id],
  );

  if (
    existing.length > 0 &&
    existing[0].estadoServidor === ESTADO_SINCRONIZACION.PENDIENTE
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
      cr.store_id || '',
      cr.concept,
      Number(cr.amount),
      cr.due_date || null,
      cr.status || 'pending',
      ESTADO_SINCRONIZACION.SINCRONIZADO,
      ESTADO_SINCRONIZACION.SINCRONIZADO,
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
  const existing = await getData(
    db,
    'SELECT local_id, estadoServidor FROM payments WHERE server_id = ? OR local_id = ? LIMIT 1;',
    [p.id, p.id],
  );

  if (
    existing.length > 0 &&
    existing[0].estadoServidor === ESTADO_SINCRONIZACION.PENDIENTE
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
      ESTADO_SINCRONIZACION.SINCRONIZADO,
      ESTADO_SINCRONIZACION.SINCRONIZADO,
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
 */
async function pullRemoteData(db: any): Promise<boolean> {
  try {
    const activeStoreId = await getActiveStoreId();
    if (!activeStoreId) {
      // Si el usuario no tiene tienda asignada aún, omitir descarga sin bloquear cooldown
      return false;
    }

    // 1. Descarga incremental de clientes pertenecientes a la tienda activa
    const lastWriteDateCust = await getWriteDate(db, 'customers');
    let custQuery = supabase
      .from('customer_stores')
      .select(
        'store_id, current_balance, credit_limit, alias, joined_at, customers!inner(id, name, document_type, document_number, phone, notes, created_at)',
      )
      .eq('store_id', activeStoreId)
      .limit(PULL_PAGE_LIMIT);

    if (lastWriteDateCust) {
      custQuery = custQuery.gt('customers.created_at', lastWriteDateCust);
    }

    const {data: storeCustomers, error: custErr} = await custQuery;
    if (!custErr && storeCustomers && storeCustomers.length > 0) {
      let maxCustDate = lastWriteDateCust || new Date(0).toISOString();
      for (const row of storeCustomers as any[]) {
        await insertOrReplaceCustomer(db, {...row, store_id: activeStoreId});
        const cDate = row.customers?.created_at || row.joined_at;
        if (cDate && cDate > maxCustDate) {
          maxCustDate = cDate;
        }
      }
      await saveWriteDate(db, 'customers', maxCustDate);
    }

    // 2. Descarga incremental de créditos pertenecientes a la tienda activa
    const lastWriteDateCred = await getWriteDate(db, 'credits');
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
      for (const cr of remoteCredits as any[]) {
        await insertOrReplaceCredit(db, {...cr, store_id: activeStoreId});
        if (cr.created_at && cr.created_at > maxCredDate) {
          maxCredDate = cr.created_at;
        }
      }
      await saveWriteDate(db, 'credits', maxCredDate);
    }

    // 3. Descarga incremental de pagos pertenecientes a la tienda activa
    const lastWriteDatePay = await getWriteDate(db, 'payments');
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
      for (const p of remotePayments as any[]) {
        await insertOrReplacePayment(db, {...p, store_id: activeStoreId});
        const pDate = p.created_at || p.payment_date;
        if (pDate && pDate > maxPayDate) {
          maxPayDate = pDate;
        }
      }
      await saveWriteDate(db, 'payments', maxPayDate);
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

    // 5. Descarga de configuración de plataforma (soporte WhatsApp, días de gracia)
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

    // 6. Actualización de perfil del usuario (fechas de suscripción, plan actual)
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
 * 3. Ejecuta Push solo si hay pendientes reales.
 * 4. Aplica cooldown de 1 minuto a las descargas para no quemar cuota en llamadas seguidas.
 */
export async function sincronizar(
  options?: SyncOptions,
): Promise<{pushed: boolean; pulled: boolean}> {
  return withSyncLock(async () => {
    try {
      const netState = await NetInfo.fetch();
      const isOnline = Boolean(
        netState.isConnected && netState.isInternetReachable !== false,
      );
      if (!isOnline) {
        return {pushed: false, pulled: false};
      }

      const db = await getDbConnection();
      const pendingCount = await countPendingLocalItems(db);
      let didPush = false;
      let didPull = false;

      // Fase 1: Subida únicamente si hay elementos pendientes
      if (pendingCount > 0) {
        await pushPendingCustomers(db);
        await pushPendingCredits(db);
        await pushPendingPayments(db);
        didPush = true;
      }

      // Fase 2: Descarga incremental con Cooldown para ahorrar peticiones
      const now = Date.now();
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

      return {pushed: didPush, pulled: didPull};
    } catch (error: any) {
      console.warn('[Sync] Error en ciclo de sincronización:', error?.message);
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
