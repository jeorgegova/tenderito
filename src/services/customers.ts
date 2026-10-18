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
  getActiveStoreId,
} from './sync';

/**
 * Consulta la lista de clientes con prioridad Offline-First (SQLite local).
 * Si la base de datos local está vacía y hay conexión, sincroniza primero.
 */
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  try {
    const db = await getDbConnection();
    let sql = 'SELECT * FROM customers';
    const params: any[] = [];
    if (search?.trim()) {
      sql += ' WHERE name LIKE ? OR alias LIKE ? OR document_number LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ' ORDER BY current_balance DESC;';
    const rows = await getData(db, sql, params);

    if (rows && rows.length > 0) {
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
        estadoServidor: (r.estadoServidor || 'sincronizado') as any,
        created_at: r.created_at,
      }));
    }
  } catch (_dbErr) {}

  // Si localmente no hay clientes registrados (primer inicio) e internet está disponible,
  // intentar sincronizar forzadamente para descargar la información a SQLite
  try {
    await sincronizar({force: true});
    const db = await getDbConnection();
    let sql = 'SELECT * FROM customers';
    const params: any[] = [];
    if (search?.trim()) {
      sql += ' WHERE name LIKE ? OR alias LIKE ? OR document_number LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ' ORDER BY current_balance DESC;';
    const rows = await getData(db, sql, params);
    if (rows && rows.length > 0) {
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
        estadoServidor: (r.estadoServidor || 'sincronizado') as any,
        created_at: r.created_at,
      }));
    }
  } catch (_e) {}

  // Fallback directo a Supabase si SQLite aún no guardó y hay conexión
  try {
    const activeStoreId = await getActiveStoreId();
    if (activeStoreId) {
      const {data: storeCustomers, error} = await supabase
        .from('customer_stores')
        .select(
          'store_id, current_balance, credit_limit, alias, joined_at, customers!inner(id, name, document_type, document_number, phone, notes, created_at)',
        )
        .eq('store_id', activeStoreId)
        .order('current_balance', {ascending: false});

      if (!error && storeCustomers && storeCustomers.length > 0) {
        try {
          const db = await getDbConnection();
          for (const row of storeCustomers as any[]) {
            await insertOrReplaceCustomer(db, {
              ...row,
              store_id: activeStoreId,
            });
          }
        } catch (_dbSaveErr) {}

        return storeCustomers.map((r: any) => {
          const c = r.customers;
          return {
            id: c?.id,
            name: c?.name || 'Cliente',
            document_type: c?.document_type || 'CC',
            document_number: c?.document_number || '',
            phone: c?.phone || '',
            notes: c?.notes || '',
            alias: r.alias || '',
            credit_limit: Number(r.credit_limit || 0),
            current_balance: Number(r.current_balance || 0),
            estadoServidor: 'sincronizado' as any,
            created_at: c?.created_at || r.joined_at,
          };
        });
      }
    }
  } catch (_netErr) {}

  return [];
}

/**
 * Consulta un cliente por ID (local_id o server_id) en SQLite local.
 */
export async function fetchCustomerById(id: string): Promise<Customer> {
  const db = await getDbConnection();
  const rows = await getData(
    db,
    'SELECT * FROM customers WHERE local_id = ? OR server_id = ? LIMIT 1;',
    [id, id],
  );

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
    } as Customer;
  }

  // Fallback a Supabase si no se encontró localmente
  try {
    const {data, error} = await supabase
      .from('customer_stores')
      .select('current_balance, credit_limit, alias, customers!inner(*)')
      .eq('customer_id', id)
      .single();

    if (!error && data) {
      await insertOrReplaceCustomer(db, data);
      return {
        ...(data as any).customers,
        alias: (data as any).alias,
        credit_limit: Number((data as any).credit_limit ?? 0),
        current_balance: Number((data as any).current_balance),
      } as Customer;
    }
  } catch (_netErr) {}

  throw new Error('Cliente no encontrado');
}

/**
 * Valida límite por plan antes de insertar o vincular un cliente.
 */
export async function canCreateCustomer(
  planOrProfile?: SubscriptionPlan | string | Profile | null,
): Promise<{allowed: boolean; count: number; limit: number; effectivePlan: string}> {
  try {
    const db = await getDbConnection();
    const rows = await getData(db, 'SELECT COUNT(*) as total FROM customers;');
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
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar primero en SQLite local con estado pendiente
  await executeQuery(
    db,
    `INSERT INTO customers (
       local_id, server_id, name, document_type, document_number,
       phone, notes, alias, current_balance, credit_limit,
       estadoServidor, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      null,
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
  // 1. Buscar en SQLite local
  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      'SELECT * FROM customers WHERE document_number = ? LIMIT 1;',
      [documentNumber],
    );
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
        const {data: storeLink} = await supabase
          .from('customer_stores')
          .select('alias, credit_limit, current_balance')
          .eq('customer_id', found.id)
          .maybeSingle();
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
 */
export async function linkCustomerToStore(
  customerId: string,
  creditLimit: number,
  alias?: string,
): Promise<void> {
  // Actualizar localmente primero con estado pendiente
  const db = await getDbConnection();
  await executeQuery(
    db,
    `UPDATE customers
     SET credit_limit = ?, alias = ?, estadoServidor = ?, updated_at = ?
     WHERE local_id = ? OR server_id = ?;`,
    [
      creditLimit,
      alias?.trim() || null,
      ESTADO_SINCRONIZACION.PENDIENTE,
      new Date().toISOString(),
      customerId,
      customerId,
    ],
  );

  scheduleSync();
}

export async function fetchGlobalCustomerHistory(customerId: string) {
  try {
    const {data, error} = await supabase.rpc('get_customer_history', {
      p_customer_id: customerId,
    });
    if (!error && data) {
      return data as {stores: any[]; credits: any[]; payments: any[]};
    }
  } catch (_e) {}

  return {stores: [], credits: [], payments: []};
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDbConnection();
  await executeQuery(
    db,
    'DELETE FROM customers WHERE local_id = ? OR server_id = ?;',
    [id, id],
  );

  try {
    await supabase.from('customer_stores').delete().eq('customer_id', id);
  } catch (_e) {}
}
