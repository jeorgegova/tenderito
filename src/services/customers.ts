import {supabase} from '../lib/supabase';
import type {Customer, NewCustomerInput, Profile} from '../types';
import {PLAN_LIMITS, type SubscriptionPlan} from '../theme';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';
import {calculateSubscriptionStatus} from './plans';
import {getLocalSubscriptionPlans} from '../database/tables/plans';
import {
  sincronizar,
  insertOrReplaceCustomer,
  scheduleSync,
} from './sync';
import {getActiveStoreId} from './storeContext';

/**
 * Consulta la lista de clientes con prioridad absoluta Offline-First (SQLite local como fuente de verdad).
 * Retorna inmediatamente los registros locales disponibles sin bloquear la interfaz.
 */
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  const activeStoreId = await getActiveStoreId();

  try {
    const db = await getDbConnection();
    let sql = 'SELECT * FROM customers';
    const params: any[] = [];

    if (activeStoreId) {
      sql +=
        ' WHERE (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
      params.push(activeStoreId);
    } else {
      sql += ' WHERE (1=1)';
    }

    if (search?.trim()) {
      sql += ' AND (name LIKE ? OR alias LIKE ? OR document_number LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ' ORDER BY current_balance DESC;';
    const rows = await getData(db, sql, params);

    return rows.map((r: any) => ({
      id: r.server_id || r.local_id,
      name: r.name,
      document_type: r.document_type,
      document_number: r.document_number,
      phone: r.phone,
      notes: r.notes,
      alias: r.alias,
      credit_limit: Number(r.credit_limit || 0),
      current_balance: Number(r.current_balance || 0),
      free_plan_selected: Number(r.free_plan_selected ?? 1) === 1,
      estadoServidor: (r.sync_status || r.estadoServidor || 'synced') as any,
      created_at: r.created_at,
    }));
  } catch (_dbErr) {
    return [];
  }
}

/**
 * Consulta un cliente por ID (local_id o server_id) directamente desde SQLite local.
 */
export async function fetchCustomerById(id: string): Promise<Customer> {
  const activeStoreId = await getActiveStoreId();
  const db = await getDbConnection();
  let rows: any[] = [];
  if (activeStoreId) {
    rows = await getData(
      db,
      'SELECT * FROM customers WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL OR store_id = "") LIMIT 1;',
      [id, id, activeStoreId],
    );
  }
  if (rows.length === 0) {
    rows = await getData(
      db,
      'SELECT * FROM customers WHERE local_id = ? OR server_id = ? LIMIT 1;',
      [id, id],
    );
  }

  if (rows.length > 0) {
    const r = rows[0];
    return {
      id: r.server_id || r.local_id,
      name: r.name,
      document_type: r.document_type,
      document_number: r.document_number,
      phone: r.phone,
      notes: r.notes,
      alias: r.alias,
      credit_limit: Number(r.credit_limit || 0),
      current_balance: Number(r.current_balance || 0),
      free_plan_selected: Number(r.free_plan_selected ?? 1) === 1,
      estadoServidor: (r.sync_status || r.estadoServidor || 'synced') as any,
      created_at: r.created_at,
    } as Customer;
  }

  throw new Error('Cliente no encontrado localmente');
}

/**
 * Valida límite por plan antes de insertar o vincular un cliente.
 */
export async function canCreateCustomer(
  planOrProfile?: SubscriptionPlan | string | Profile | null,
): Promise<{allowed: boolean; count: number; limit: number; effectivePlan: string}> {
  try {
    const activeStoreId = await getActiveStoreId();
    const db = await getDbConnection();
    let query = 'SELECT COUNT(*) as total FROM customers';
    const params: any[] = [];
    if (activeStoreId) {
      query +=
        ' WHERE store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null"';
      params.push(activeStoreId);
    }
    const rows = await getData(db, query, params);
    const total = Number(rows[0]?.total || 0);

    let effectivePlan = 'free';
    if (typeof planOrProfile === 'object' && planOrProfile !== null) {
      const status = calculateSubscriptionStatus(planOrProfile);
      effectivePlan = status.effectivePlan;
    } else if (typeof planOrProfile === 'string') {
      effectivePlan = planOrProfile.toLowerCase();
    }

    // Buscar el límite en los planes locales parametrizables
    let limit: number = (PLAN_LIMITS as any)[effectivePlan] ?? 10;
    try {
      const localPlans = await getLocalSubscriptionPlans(db);
      const matched = localPlans.find(
        p => p.id.toLowerCase() === effectivePlan,
      );
      if (matched && typeof matched.customer_limit === 'number') {
        limit = matched.customer_limit;
      }
    } catch (_pErr) {}

    return {
      allowed: total < limit,
      count: total,
      limit,
      effectivePlan,
    };
  } catch (_e) {
    return {allowed: true, count: 0, limit: 10, effectivePlan: 'free'};
  }
}

/**
 * Registra un nuevo cliente:
 * 1. Lo guarda primero en la BD local SQLite con estadoServidor = 'pendiente'.
 * 2. Ejecuta inmediatamente el método sincronizar para intentar subirlo a Supabase
 *    y descargar novedades si hay conexión.
 * 3. Retorna de inmediato el cliente para que la UI funcione sin latencia.
 */
export async function createCustomer(
  input: NewCustomerInput,
): Promise<Customer> {
  const activeStoreId = await getActiveStoreId();
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar primero en SQLite local con estado pendiente
  await executeQuery(
    db,
    `INSERT INTO customers (
       local_id, server_id, store_id, name, document_type, document_number,
       phone, notes, alias, current_balance, credit_limit,
       estadoServidor, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      null,
      activeStoreId || null,
      input.name,
      input.document_type || 'CC',
      input.document_number,
      input.phone ?? null,
      input.notes ?? null,
      input.alias?.trim() || null,
      0,
      input.credit_limit ?? 0,
      ESTADO_SINCRONIZACION.PENDIENTE,
      ESTADO_SINCRONIZACION.PENDIENTE,
      now,
      now,
    ],
  );

  const localCustomer: Customer = {
    id: localId,
    name: input.name,
    document_type: input.document_type || 'CC',
    document_number: input.document_number,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
    alias: input.alias?.trim() || null,
    current_balance: 0,
    credit_limit: input.credit_limit ?? 0,
    estadoServidor: ESTADO_SINCRONIZACION.PENDIENTE,
    created_at: now,
  };

  // 2. Disparar sincronización agrupada con debounce (optimiza cuota Supabase)
  scheduleSync();

  return localCustomer;
}

/**
 * Busca cliente por cédula/documento con prioridad offline.
 */
export async function findCustomerByDocument(
  documentNumber: string,
): Promise<Customer | null> {
  const activeStoreId = await getActiveStoreId();

  // 1. Buscar en SQLite local
  try {
    const db = await getDbConnection();
    let query = 'SELECT * FROM customers WHERE document_number = ?';
    const params: any[] = [documentNumber];
    if (activeStoreId) {
      query +=
        ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
      params.push(activeStoreId);
    }
    query += ' LIMIT 1;';
    const rows = await getData(db, query, params);
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.server_id || r.local_id,
        name: r.name,
        document_type: r.document_type,
        document_number: r.document_number,
        phone: r.phone,
        notes: r.notes,
        alias: r.alias,
        credit_limit: Number(r.credit_limit || 0),
        current_balance: Number(r.current_balance || 0),
        estadoServidor: (r.estadoServidor || 'sincronizado') as any,
        created_at: r.created_at,
        isLinkedToMyStore: true,
      } as Customer;
    }
  } catch (_e) {}

  // 2. Buscar en Supabase si hay red
  try {
    const {data, error} = await supabase.rpc('find_customer_by_document', {
      p_document_number: documentNumber,
    });
    if (!error && data && data.length > 0) {
      const found = data[0] as any;
      let isLinked = false;
      let extraData: any = {};
      try {
        let storeLinkQuery = supabase
          .from('customer_stores')
          .select('alias, credit_limit, current_balance')
          .eq('customer_id', found.id);

        if (activeStoreId) {
          storeLinkQuery = storeLinkQuery.eq('store_id', activeStoreId);
        }

        const {data: storeLink} = await storeLinkQuery.maybeSingle();
        if (storeLink) {
          isLinked = true;
          extraData = storeLink;
        }
      } catch (_linkErr) {}

      return {
        id: found.id,
        name: found.name,
        document_type: found.document_type,
        document_number: found.document_number,
        phone: found.phone,
        email: found.email,
        notes: found.notes,
        alias: extraData.alias || null,
        credit_limit: Number(extraData.credit_limit || 0),
        current_balance: Number(extraData.current_balance || 0),
        created_at: found.created_at,
        isLinkedToMyStore: isLinked,
      } as Customer;
    }
  } catch (_e) {}

  return null;
}

/**
 * Vincula o actualiza el límite/alias de un cliente con la tienda.
 * Guarda inmediatamente en SQLite local con estado 'pending' para que la UI funcione
 * al instante, y programa la sincronización en segundo plano con Supabase.
 */
export async function linkCustomerToStore(
  customerOrId: Customer | string,
  creditLimit: number,
  alias?: string,
): Promise<void> {
  const customerId = typeof customerOrId === 'string' ? customerOrId : customerOrId.id;
  const db = await getDbConnection();
  const now = new Date().toISOString();
  const activeStoreId = await getActiveStoreId();

  // 1. Guardar o actualizar en SQLite local primero (reflejo inmediato)
  let selectQuery =
    'SELECT local_id FROM customers WHERE (server_id = ? OR local_id = ?)';
  const selectParams: any[] = [customerId, customerId];
  if (activeStoreId) {
    selectQuery +=
      ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
    selectParams.push(activeStoreId);
  }
  selectQuery += ' LIMIT 1;';
  const existing = await getData(db, selectQuery, selectParams);

  if (existing.length > 0) {
    let updateQuery = `UPDATE customers
       SET credit_limit = ?, alias = ?, sync_status = ?, estadoServidor = ?, updated_at = ?
       WHERE (local_id = ? OR server_id = ?)`;
    const updateParams: any[] = [
      creditLimit,
      alias?.trim() || null,
      ESTADO_SINCRONIZACION.PENDING,
      ESTADO_SINCRONIZACION.PENDING,
      now,
      customerId,
      customerId,
    ];
    if (activeStoreId) {
      updateQuery +=
        ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
      updateParams.push(activeStoreId);
    }
    await executeQuery(db, updateQuery, updateParams);
  } else {
    const custObj = typeof customerOrId === 'object' ? customerOrId : null;
    await executeQuery(
      db,
      `INSERT OR REPLACE INTO customers (
         local_id, server_id, store_id, name, document_type, document_number,
         phone, notes, alias, current_balance, credit_limit, free_plan_selected,
         estadoServidor, sync_status, last_synced_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        customerId,
        customerId,
        activeStoreId || '',
        custObj?.name || 'Cliente',
        custObj?.document_type || 'CC',
        custObj?.document_number || '',
        custObj?.phone || '',
        custObj?.notes || '',
        alias?.trim() || custObj?.alias || '',
        0,
        creditLimit,
        1,
        ESTADO_SINCRONIZACION.PENDING,
        ESTADO_SINCRONIZACION.PENDING,
        now,
        custObj?.created_at || now,
        now,
      ],
    );
  }

  // 2. Programar sincronización diferida hacia Supabase
  scheduleSync();
}

export async function fetchGlobalCustomerHistory(customerId: string) {
  // 1. Intentar obtener historial multi-tienda remoto si hay red
  try {
    const {data, error} = await supabase.rpc('get_customer_history', {
      p_customer_id: customerId,
    });
    if (!error && data) {
      return data as {stores: any[]; credits: any[]; payments: any[]};
    }
  } catch (_e) {}

  // 2. Fallback Offline: Construir historial a partir de la base de datos local SQLite
  try {
    const db = await getDbConnection();
    const activeStoreId = await getActiveStoreId();
    const customerRows = await getData(
      db,
      'SELECT * FROM customers WHERE (local_id = ? OR server_id = ?) LIMIT 1;',
      [customerId, customerId],
    );

    const creditsRows = await getData(
      db,
      'SELECT * FROM credits WHERE (customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?)) ORDER BY created_at DESC;',
      [customerId, customerId],
    );

    const paymentsRows = await getData(
      db,
      'SELECT * FROM payments WHERE (customer_id = ? OR customer_id IN (SELECT local_id FROM customers WHERE server_id = ?)) ORDER BY payment_date DESC;',
      [customerId, customerId],
    );

    const cust = customerRows[0];
    const storeObj = {
      store_id: activeStoreId || 'local',
      store_name: 'Mi Tienda',
      current_balance: Number(cust?.current_balance || 0),
      credit_limit: Number(cust?.credit_limit || 0),
      alias: cust?.alias || null,
      last_movement: creditsRows[0]?.created_at || paymentsRows[0]?.payment_date || null,
    };

    return {
      stores: [storeObj],
      credits: creditsRows,
      payments: paymentsRows,
    };
  } catch (_localErr) {
    return {stores: [], credits: [], payments: []};
  }
}

export async function deleteCustomer(id: string): Promise<void> {
  const activeStoreId = await getActiveStoreId();
  const db = await getDbConnection();
  await executeQuery(
    db,
    'DELETE FROM customers WHERE (local_id = ? OR server_id = ?) AND (store_id = ? OR store_id IS NULL);',
    [id, id, activeStoreId || ''],
  );

  try {
    let query = supabase.from('customer_stores').delete().eq('customer_id', id);
    if (activeStoreId) {
      query = query.eq('store_id', activeStoreId);
    }
    await query;
  } catch (_e) {}
}
