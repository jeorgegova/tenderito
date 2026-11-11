import {supabase} from '../lib/supabase';
import {getBogotaMonthRangeUtc} from '../utils/format';

export async function findCustomerForActivation(documentNumber: string) {
  const {data, error} = await supabase.rpc('find_customer_for_activation', {
    p_document_number: documentNumber,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export interface CustomerPortalFilters {
  month?: string; // 'YYYY-MM' o 'all'
  storeId?: string | null;
}

export async function fetchCustomerPortal(filters: CustomerPortalFilters = {}) {
  const {month, storeId} = filters;
  
  // Obtener usuario actual: primero de la sesión local activa (rápido sin red) o getUser como respaldo
  const {data: {session}} = await supabase.auth.getSession();
  let currentUser = session?.user ?? null;
  if (!currentUser) {
    const {data: {user: fetchedUser}} = await supabase.auth.getUser();
    currentUser = fetchedUser;
  }
  if (!currentUser) throw new Error('No autenticado');

  // 1. Obtener los datos del cliente directamente por su user_id (o fallback a customer_id de metadata)
  let {data: customer, error: customerError} = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (!customer && currentUser.user_metadata?.customer_id) {
    const {data: fallbackCust} = await supabase
      .from('customers')
      .select('*')
      .eq('id', currentUser.user_metadata.customer_id)
      .maybeSingle();
    customer = fallbackCust;
  }

  if (customerError && !customer) throw customerError;
  if (!customer) throw new Error('Cliente no registrado o vinculado');

  // 2. Tiendas vinculadas (saldo acumulado por tienda)
  const {data: stores, error: storesError} = await supabase
    .from('customer_stores')
    .select(
      'customer_id, store_id, current_balance, credit_limit, active, stores(store_name, phone, address)',
    )
    .eq('customer_id', customer.id)
    .eq('active', true);
  if (storesError) throw storesError;

  // 3. Consultas de créditos y abonos filtradas directamente en Supabase por mes y tienda
  let creditsQuery = supabase
    .from('credits')
    .select('*, stores(store_name, address)')
    .eq('customer_id', customer.id)
    .order('created_at', {ascending: false});

  let paymentsQuery = supabase
    .from('payments')
    .select('*, stores(store_name, address)')
    .eq('customer_id', customer.id)
    .order('payment_date', {ascending: false});

  if (storeId) {
    creditsQuery = creditsQuery.eq('store_id', storeId);
    paymentsQuery = paymentsQuery.eq('store_id', storeId);
  }

  if (month && month !== 'all') {
    try {
      const {startUtc, endUtc} = getBogotaMonthRangeUtc(month);
      creditsQuery = creditsQuery
        .gte('created_at', startUtc)
        .lt('created_at', endUtc);

      paymentsQuery = paymentsQuery
        .gte('payment_date', startUtc)
        .lt('payment_date', endUtc);
    } catch (_e) {}
  }

  const [
    {data: credits, error: creditsError},
    {data: payments, error: paymentsError},
  ] = await Promise.all([creditsQuery, paymentsQuery]);

  if (creditsError) throw creditsError;
  if (paymentsError) throw paymentsError;

  return {
    customer,
    stores: stores ?? [],
    credits: credits ?? [],
    payments: payments ?? [],
  };
}
