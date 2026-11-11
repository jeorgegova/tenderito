import {getDbConnection, getData} from '../database/db';
import {supabase} from '../lib/supabase';
import {getActiveStoreId} from './storeContext';

export interface StatsFilters {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
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

/**
 * Cálculo offline de estadísticas a partir de la base de datos local SQLite.
 */
async function fetchStatsOffline(filters: StatsFilters): Promise<StatsResult> {
  const activeStoreId = await getActiveStoreId();
  const db = await getDbConnection();
  const {from, to, customerIds} = filters;

  // Clientes para mapear balances y nombres
  let custSql =
    'SELECT local_id, server_id, name, alias, current_balance FROM customers';
  const custParams: any[] = [];
  if (activeStoreId) {
    custSql +=
      ' WHERE store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null"';
    custParams.push(activeStoreId);
  }
  const custRows = await getData(db, custSql, custParams);
  const custMap = new Map<string, any>();
  for (const c of custRows) {
    if (c.local_id) custMap.set(c.local_id, c);
    if (c.server_id) custMap.set(c.server_id, c);
  }

  // 1. Créditos locales
  let credSql = 'SELECT customer_id, amount, created_at FROM credits WHERE 1=1';
  const credParams: any[] = [];
  if (activeStoreId) {
    credSql +=
      ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
    credParams.push(activeStoreId);
  }
  if (from) {
    credSql += ' AND created_at >= ?';
    credParams.push(`${from}T00:00:00`);
  }
  if (to) {
    credSql += ' AND created_at <= ?';
    credParams.push(`${to}T23:59:59`);
  }
  const creditsData = await getData(db, credSql, credParams);

  // 2. Abonos locales
  let paySql =
    'SELECT customer_id, amount, payment_date FROM payments WHERE 1=1';
  const payParams: any[] = [];
  if (activeStoreId) {
    paySql +=
      ' AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")';
    payParams.push(activeStoreId);
  }
  if (from) {
    paySql += ' AND payment_date >= ?';
    payParams.push(`${from}T00:00:00`);
  }
  if (to) {
    paySql += ' AND payment_date <= ?';
    payParams.push(`${to}T23:59:59`);
  }
  const paymentsData = await getData(db, paySql, payParams);

  const map: Record<string, CustomerStatRow> = {};

  for (const row of creditsData ?? []) {
    const cid = row.customer_id;
    if (customerIds?.length && !customerIds.includes(cid)) continue;

    const cust = custMap.get(cid);
    const key = cust?.server_id || cust?.local_id || cid;

    if (!map[key]) {
      map[key] = {
        customer_id: key,
        name: cust?.name ?? 'Cliente',
        alias: cust?.alias ?? null,
        total_credits: 0,
        total_payments: 0,
        balance: Number(cust?.current_balance || 0),
      };
    }
    map[key].total_credits += Number(row.amount);
  }

  for (const row of paymentsData ?? []) {
    const cid = row.customer_id;
    if (customerIds?.length && !customerIds.includes(cid)) continue;

    const cust = custMap.get(cid);
    const key = cust?.server_id || cust?.local_id || cid;

    if (!map[key]) {
      map[key] = {
        customer_id: key,
        name: cust?.name ?? 'Cliente',
        alias: cust?.alias ?? null,
        total_credits: 0,
        total_payments: 0,
        balance: Number(cust?.current_balance || 0),
      };
    }
    map[key].total_payments += Number(row.amount);
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

/**
 * Consulta de estadísticas: SQLite como fuente única de verdad.
 * Se calcula instantáneamente de manera local, garantizando disponibilidad 100% offline
 * y cero consumo innecesario de peticiones o egress en Supabase.
 */
export async function fetchStats(filters: StatsFilters = {}): Promise<StatsResult> {
  return fetchStatsOffline(filters);
}
