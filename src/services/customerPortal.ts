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

  const {data: account, error: accountError} = await supabase
    .from('customer_accounts')
    .select('customer_id')
    .eq('user_id', user.id)
    .single();
  if (accountError) throw accountError;

  // 1. Datos del cliente y tiendas vinculadas (saldo acumulado por tienda)
  const [
    {data: customer, error: customerError},
    {data: stores, error: storesError},
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('id', account.customer_id)
      .single(),
    supabase
      .from('customer_stores')
      .select(
        'customer_id, store_id, current_balance, credit_limit, active, stores(store_name, phone, address)',
      )
      .eq('customer_id', account.customer_id)
      .eq('active', true),
  ]);

  if (customerError) throw customerError;
  if (storesError) throw storesError;

  // 2. Consultas de créditos y abonos filtradas directamente en Supabase por mes y tienda
  let creditsQuery = supabase
    .from('credits')
    .select('*, stores(store_name, address)')
    .eq('customer_id', account.customer_id)
    .order('created_at', {ascending: false});

  let paymentsQuery = supabase
    .from('payments')
    .select('*, stores(store_name, address)')
    .eq('customer_id', account.customer_id)
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
