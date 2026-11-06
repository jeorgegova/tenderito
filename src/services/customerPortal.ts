import {supabase} from '../lib/supabase';

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
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  // 1. Obtener los datos del cliente directamente por su user_id
  const {data: customer, error: customerError} = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (customerError) throw customerError;

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
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    if (!isNaN(year) && !isNaN(monthNum)) {
      const startOfMonth = new Date(
        year,
        monthNum - 1,
        1,
        0,
        0,
        0,
        0,
      ).toISOString();
      const endOfMonth = new Date(year, monthNum, 1, 0, 0, 0, 0).toISOString();

      creditsQuery = creditsQuery
        .gte('created_at', startOfMonth)
        .lt('created_at', endOfMonth);

      paymentsQuery = paymentsQuery
        .gte('payment_date', startOfMonth)
        .lt('payment_date', endOfMonth);
    }
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
