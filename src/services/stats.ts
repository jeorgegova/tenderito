import {supabase} from '../lib/supabase';

export interface StatsFilters {
  from?: string;       // YYYY-MM-DD
  to?: string;         // YYYY-MM-DD
  customerIds?: string[];
}

export interface CustomerStatRow {
  customer_id: string;
  name: string;
  alias: string | null;
  total_credits: number;
  total_payments: number;
  balance: number;
}

export interface StatsResult {
  totalCredits: number;
  totalPayments: number;
  netBalance: number;
  customerCount: number;
  rows: CustomerStatRow[];
}

export async function fetchStats(filters: StatsFilters = {}): Promise<StatsResult> {
  const {from, to, customerIds} = filters;

  // --- Créditos ---
  let creditsQuery = supabase
    .from('credits')
    .select('customer_id, amount, customers!inner(id, name)');

  if (from) creditsQuery = creditsQuery.gte('created_at', `${from}T00:00:00`);
  if (to) creditsQuery = creditsQuery.lte('created_at', `${to}T23:59:59`);
  if (customerIds?.length) creditsQuery = creditsQuery.in('customer_id', customerIds);

  const {data: creditsData, error: creditsError} = await creditsQuery;
  if (creditsError) throw creditsError;

  // --- Abonos ---
  let paymentsQuery = supabase
    .from('payments')
    .select('customer_id, amount, customers!inner(id, name)');

  if (from) paymentsQuery = paymentsQuery.gte('payment_date', `${from}T00:00:00`);
  if (to) paymentsQuery = paymentsQuery.lte('payment_date', `${to}T23:59:59`);
  if (customerIds?.length) paymentsQuery = paymentsQuery.in('customer_id', customerIds);

  const {data: paymentsData, error: paymentsError} = await paymentsQuery;
  if (paymentsError) throw paymentsError;

  // --- Saldo actual de customer_stores (no filtrado por fecha, es el saldo real) ---
  let balanceQuery = supabase
    .from('customer_stores')
    .select('customer_id, current_balance, customers!inner(id, name, alias: alias)');

  if (customerIds?.length) balanceQuery = balanceQuery.in('customer_id', customerIds);

  const {data: balanceData, error: balanceError} = await balanceQuery;
  if (balanceError) throw balanceError;

  // --- Agregar por cliente ---
  const map: Record<string, CustomerStatRow> = {};

  for (const row of creditsData ?? []) {
    const cid = row.customer_id;
    if (!map[cid]) {
      map[cid] = {
        customer_id: cid,
        name: (row as any).customers?.name ?? cid,
        alias: null,
        total_credits: 0,
        total_payments: 0,
        balance: 0,
      };
    }
    map[cid].total_credits += Number(row.amount);
  }

  for (const row of paymentsData ?? []) {
    const cid = row.customer_id;
    if (!map[cid]) {
      map[cid] = {
        customer_id: cid,
        name: (row as any).customers?.name ?? cid,
        alias: null,
        total_credits: 0,
        total_payments: 0,
        balance: 0,
      };
    }
    map[cid].total_payments += Number(row.amount);
  }

  // Enriquecer con alias y balance actual
  for (const row of balanceData ?? []) {
    const cid = row.customer_id;
    if (map[cid]) {
      map[cid].alias = (row as any).customers?.alias ?? null;
      map[cid].balance = Number(row.current_balance);
    }
  }

  const rows = Object.values(map).sort((a, b) => b.balance - a.balance);
  const totalCredits = rows.reduce((s, r) => s + r.total_credits, 0);
  const totalPayments = rows.reduce((s, r) => s + r.total_payments, 0);
  const netBalance = rows.reduce((s, r) => s + r.balance, 0);

  return {
    totalCredits,
    totalPayments,
    netBalance,
    customerCount: rows.length,
    rows,
  };
}
