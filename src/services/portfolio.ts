import type {CreditEligibility, FreePortfolioStatus, Profile} from '../types';
import {supabase} from '../lib/supabase';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {getConfigParam, saveConfigParam} from '../database/tables/metadata';
import {getLocalSubscriptionPlans} from '../database/tables/plans';
import {calculateSubscriptionStatus} from './plans';

const FREE_LIMIT_FALLBACK = 10;
const SELECTION_DONE_KEY = 'free_portfolio_selection_done';

/**
 * Expira en el servidor las suscripciones vencidas y prepara su
 * cartera Free. Se llama al iniciar la app y en cada sincronización.
 */
export async function refreshSubscriptionLifecycle(): Promise<number> {
  try {
    const {data, error} = await supabase.rpc('expire_subscriptions');
    if (error) {
      return 0;
    }
    return Number(data ?? 0);
  } catch (_e) {
    return 0;
  }
}

/**
 * Estado autoritativo de la cartera Free. Se usa para saber si el
 * tendero debe hacer la selección inicial de clientes.
 */
export async function fetchFreePortfolioStatus(): Promise<FreePortfolioStatus | null> {
  try {
    const {data, error} = await supabase.rpc('get_free_portfolio_status');
    if (error || !data) {
      return null;
    }

    const status = data as FreePortfolioStatus;

    try {
      const db = await getDbConnection();
      await saveConfigParam(
        db,
        SELECTION_DONE_KEY,
        status.selection_done ? '1' : '0',
      );
      await saveConfigParam(db, 'free_portfolio_limit', String(status.limit));

      if (status.selection_pending) {
        await executeQuery(db, 'UPDATE customers SET free_plan_selected = 0;');
      }
    } catch (_localErr) {}

    return status;
  } catch (_e) {
    return null;
  }
}

/**
 * Guarda la selección inicial de cartera. Solo se puede ejecutar una
 * vez por bajada a Free. Después, los cupos se liberan solos cuando
 * un cliente queda en $0.
 */
export async function setFreePortfolioSelection(
  customerIds: string[],
): Promise<void> {
  const {error} = await supabase.rpc('set_free_portfolio_selection', {
    p_customer_ids: customerIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  try {
    const db = await getDbConnection();
    await executeQuery(db, 'UPDATE customers SET free_plan_selected = 0;');

    for (const id of customerIds) {
      await executeQuery(
        db,
        `UPDATE customers
         SET free_plan_selected = 1
         WHERE local_id = ? OR server_id = ?;`,
        [id, id],
      );
    }

    await saveConfigParam(db, SELECTION_DONE_KEY, '1');
  } catch (_localErr) {}
}

async function getFreeLimit(): Promise<number> {
  try {
    const db = await getDbConnection();
    const plans = await getLocalSubscriptionPlans(db);
    const freePlan = plans.find(p => p.id.toLowerCase() === 'free');
    if (freePlan && Number.isFinite(freePlan.customer_limit)) {
      return Number(freePlan.customer_limit);
    }

    const storedLimit = await getConfigParam(db, 'free_portfolio_limit');
    if (storedLimit && Number.isFinite(Number(storedLimit))) {
      return Number(storedLimit);
    }
  } catch (_e) {}

  return FREE_LIMIT_FALLBACK;
}

function blocked(
  reason: CreditEligibility['reason'],
  message: string,
  limit: number,
  activeCount: number,
  portfolioCount: number,
): CreditEligibility {
  return {
    allowed: false,
    reason,
    message,
    limit,
    active_count: activeCount,
    portfolio_count: portfolioCount,
  };
}

/**
 * Valida localmente si se puede crear un fiado para un cliente.
 * El servidor vuelve a validar con la misma regla.
 */
export async function canCreateCreditForCustomer(
  customerId: string,
  profile: Profile | null,
): Promise<CreditEligibility> {
  const limit = await getFreeLimit();

  if (!profile) {
    return {
      allowed: true,
      reason: 'unknown',
      message: null,
      limit,
      active_count: 0,
      portfolio_count: 0,
    };
  }

  const status = calculateSubscriptionStatus(profile);

  if (status.effectivePlan !== 'free') {
    return {
      allowed: true,
      reason: 'paid_plan',
      message: null,
      limit,
      active_count: 0,
      portfolio_count: 0,
    };
  }

  try {
    const db = await getDbConnection();
    const rows = await getData(
      db,
      `SELECT current_balance, free_plan_selected
       FROM customers
       WHERE local_id = ? OR server_id = ?
       LIMIT 1;`,
      [customerId, customerId],
    );

    if (rows.length === 0) {
      return {
        allowed: true,
        reason: 'unknown',
        message: null,
        limit,
        active_count: 0,
        portfolio_count: 0,
      };
    }

    const row = rows[0];
    const balance = Number(row.current_balance || 0);
    const isSelected = Number(row.free_plan_selected ?? 1) === 1;

    const counts = await getData(
      db,
      `SELECT
         SUM(CASE WHEN current_balance > 0 THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE
           WHEN current_balance > 0 AND free_plan_selected = 1 THEN 1
           ELSE 0
         END) AS portfolio_count
       FROM customers;`,
    );

    const activeCount = Number(counts[0]?.active_count || 0);
    const portfolioCount = Number(counts[0]?.portfolio_count || 0);

    const selectionDone = await getConfigParam(db, SELECTION_DONE_KEY);
    if (selectionDone === '0') {
      return blocked(
        'selection_pending',
        'Primero debes seleccionar los clientes que conservarán cartera activa en tu plan Free.',
        limit,
        activeCount,
        portfolioCount,
      );
    }

    if (balance > 0) {
      if (!isSelected) {
        return blocked(
          'not_selected',
          'Este cliente quedó fuera de tu cartera Free. Solo puedes registrarle abonos. Cuando un cliente de tu cartera quede en $0, se liberará un cupo.',
          limit,
          activeCount,
          portfolioCount,
        );
      }

      return {
        allowed: true,
        reason: 'selected',
        message: null,
        limit,
        active_count: activeCount,
        portfolio_count: portfolioCount,
      };
    }

    if (portfolioCount >= limit) {
      return blocked(
        'no_slots',
        `Ya tienes ${limit} clientes con cartera activa en el plan Free. Registra abonos para liberar un cupo antes de dar un nuevo fiado.`,
        limit,
        activeCount,
        portfolioCount,
      );
    }

    return {
      allowed: true,
      reason: 'unknown',
      message: null,
      limit,
      active_count: activeCount,
      portfolio_count: portfolioCount,
    };
  } catch (_e) {
    return {
      allowed: true,
      reason: 'unknown',
      message: null,
      limit,
      active_count: 0,
      portfolio_count: 0,
    };
  }
}
