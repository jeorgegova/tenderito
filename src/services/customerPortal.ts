import {supabase} from '../lib/supabase';

export async function findCustomerForActivation(documentNumber: string) {
  const {data, error} = await supabase.rpc('find_customer_for_activation', {
    p_document_number: documentNumber,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchCustomerPortal() {
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

  const [
    {data: customer, error: customerError},
    {data: stores, error: storesError},
    {data: credits, error: creditsError},
    {data: payments, error: paymentsError},
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
    supabase
      .from('credits')
      .select('*, stores(store_name, address)')
      .eq('customer_id', account.customer_id)
      .order('created_at', {ascending: false}),
    supabase
      .from('payments')
      .select('*, stores(store_name, address)')
      .eq('customer_id', account.customer_id)
      .order('payment_date', {ascending: false}),
  ]);

  const firstError =
    customerError ?? storesError ?? creditsError ?? paymentsError;
  if (firstError) throw firstError;
  return {
    customer,
    stores: stores ?? [],
    credits: credits ?? [],
    payments: payments ?? [],
  };
}
