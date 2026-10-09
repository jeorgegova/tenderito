import {supabase} from '../lib/supabase';
import type {Customer, NewCustomerInput} from '../types';
import {PLAN_LIMITS, type SubscriptionPlan} from '../theme';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {ESTADO_SINCRONIZACION} from '../database/synchronizationStatus';
import {generateLocalId} from '../utils/id';

// Lista clientes del comerciante, con búsqueda opcional (soporte offline-first)
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  try {
    let query = supabase
      .from('customer_stores')
      .select('current_balance, credit_limit, alias, customers!inner(*)')
      .order('current_balance', {ascending: false});

    if (search?.trim()) {
      query = query.ilike('customers.name', `%${search.trim()}%`);
    }
    const {data, error} = await query;
    if (!error && data) {
      const remoteCustomers = (data ?? []).map((row: any) => ({
        ...row.customers,
        alias: row.alias,
        credit_limit: Number(row.credit_limit ?? 0),
        current_balance: Number(row.current_balance),
      })) as Customer[];

      // Almacenar / actualizar copia local en SQLite
      try {
        const db = await getDbConnection();
        const now = new Date().toISOString();
        for (const c of remoteCustomers) {
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
              c.alias || '',
              Number(c.current_balance || 0),
              Number(c.credit_limit || 0),
              ESTADO_SINCRONIZACION.SINCRONIZADO,
              now,
              c.created_at || now,
              c.created_at || now,
            ],
          );
        }
      } catch (_e) {}

      return remoteCustomers;
    }
  } catch (_netErr) {
    // Si no hay red, continuamos al fallback offline en SQLite
  }

  // Fallback offline: consultar SQLite local
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
      created_at: r.created_at,
    }));
  } catch (_dbErr) {
    return [];
  }
}

export async function fetchCustomerById(id: string): Promise<Customer> {
  try {
    const {data, error} = await supabase
      .from('customer_stores')
      .select('current_balance, credit_limit, alias, customers!inner(*)')
      .eq('customer_id', id)
      .single();
    if (!error && data) {
      return {
        ...(data as any).customers,
        alias: (data as any).alias,
        credit_limit: Number((data as any).credit_limit ?? 0),
        current_balance: Number((data as any).current_balance),
      } as Customer;
    }
  } catch (_netErr) {}

  // Fallback offline: buscar en SQLite
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
      created_at: r.created_at,
    } as Customer;
  }

  throw new Error('Cliente no encontrado');
}

// Valida límite por plan antes de insertar.
export async function canCreateCustomer(
  plan: SubscriptionPlan,
): Promise<{allowed: boolean; count: number; limit: number}> {
  try {
    const {count, error} = await supabase
      .from('customer_stores')
      .select('customer_id', {count: 'exact', head: true});
    if (!error) {
      const limit = PLAN_LIMITS[plan];
      return {allowed: (count ?? 0) < limit, count: count ?? 0, limit};
    }
  } catch (_e) {}

  // Fallback offline: contar en SQLite local
  try {
    const db = await getDbConnection();
    const rows = await getData(db, 'SELECT COUNT(*) as total FROM customers;');
    const total = Number(rows[0]?.total || 0);
    const limit = PLAN_LIMITS[plan];
    return {allowed: total < limit, count: total, limit};
  } catch (_e) {
    return {allowed: true, count: 0, limit: PLAN_LIMITS[plan]};
  }
}

/**
 * Crea un cliente:
 * 1. Lo guarda primero en la BD local SQLite con estado 'pendiente_creacion'.
 * 2. Si hay conexión, lo sincroniza inmediatamente con Supabase y actualiza a 'sincronizado'.
 * 3. Si no hay conexión (offline), retorna el cliente local para que la UI funcione sin problemas.
 */
export async function createCustomer(
  input: NewCustomerInput,
): Promise<Customer> {
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const db = await getDbConnection();

  // 1. Guardar en SQLite local
  await executeQuery(
    db,
    `INSERT INTO customers (
       local_id, server_id, name, document_type, document_number,
       phone, notes, alias, current_balance, credit_limit,
       sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ESTADO_SINCRONIZACION.PENDIENTE_CREACION,
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
    created_at: now,
  };

  // 2. Intentar sincronizar con Supabase si hay red
  try {
    const {data, error} = await supabase.rpc('create_customer', {
      p_name: input.name,
      p_document_type: input.document_type,
      p_document_number: input.document_number,
      p_phone: input.phone ?? null,
      p_notes: input.notes ?? null,
      p_email: input.email ?? null,
      p_credit_limit: input.credit_limit ?? 0,
      p_alias: input.alias?.trim() || null,
    });

    if (!error && data) {
      const serverId = data?.id || data;
      await executeQuery(
        db,
        `UPDATE customers
         SET server_id = ?, sync_status = ?, last_synced_at = ?
         WHERE local_id = ?;`,
        [serverId, ESTADO_SINCRONIZACION.SINCRONIZADO, new Date().toISOString(), localId],
      );
      return {...localCustomer, id: serverId};
    }
  } catch (_e) {
    // Modo offline: queda en SQLite con 'pendiente_creacion'
  }

  return localCustomer;
}

export async function findCustomerByDocument(
  documentNumber: string,
): Promise<Customer | null> {
  try {
    const {data, error} = await supabase.rpc('find_customer_by_document', {
      p_document_number: documentNumber,
    });
    if (!error && data && data.length > 0) {
      return (data?.[0] as Customer | undefined) ?? null;
    }
  } catch (_e) {}

  // Fallback offline: buscar en SQLite
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
        created_at: r.created_at,
      } as Customer;
    }
  } catch (_e) {}

  return null;
}

export async function linkCustomerToStore(
  customerId: string,
  creditLimit: number,
  alias?: string,
): Promise<void> {
  try {
    const {error} = await supabase.rpc('link_customer_to_store', {
      p_customer_id: customerId,
      p_credit_limit: creditLimit,
      p_alias: alias?.trim() || null,
    });
    if (error) throw error;
  } catch (_netErr) {
    // Actualizar localmente
    const db = await getDbConnection();
    await executeQuery(
      db,
      `UPDATE customers
       SET credit_limit = ?, alias = ?, sync_status = ?
       WHERE local_id = ? OR server_id = ?;`,
      [creditLimit, alias?.trim() || null, ESTADO_SINCRONIZACION.PENDIENTE_ACTUALIZACION, customerId, customerId],
    );
  }
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

  // Fallback offline
  return {stores: [], credits: [], payments: []};
}

export async function deleteCustomer(id: string): Promise<void> {
  try {
    await supabase.from('customer_stores').delete().eq('customer_id', id);
  } catch (_e) {}

  const db = await getDbConnection();
  await executeQuery(
    db,
    'DELETE FROM customers WHERE local_id = ? OR server_id = ?;',
    [id, id],
  );
}
