import type {CreditEligibility, FreePortfolioStatus, Profile} from '../types';
import {supabase} from '../lib/supabase';
import {getDbConnection, getData, executeQuery} from '../database/db';
import {getConfigParam, saveConfigParam} from '../database/tables/metadata';
import {getLocalSubscriptionPlans} from '../database/tables/plans';
import {calculateSubscriptionStatus} from './plans';
import {getActiveStoreId} from './storeContext';

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
    if (!error && data) {
      const status = data as FreePortfolioStatus;
      try {
        const db = await getDbConnection();
        const activeStoreId = await getActiveStoreId();
        await saveConfigParam(
          db,
          SELECTION_DONE_KEY,
          status.selection_done ? '1' : '0',
        );
        await saveConfigParam(db, 'free_portfolio_limit', String(status.limit));

        if (status.selection_pending) {
          await executeQuery(
            db,
            'UPDATE customers SET free_plan_selected = 0 WHERE store_id = ? OR store_id IS NULL;',
            [activeStoreId || ''],
          );
        }
      } catch (_localErr) {}
      return status;
    }
  } catch (_e) {}

  // Fallback Offline: Leer estado persistido en SQLite local
  try {
    const db = await getDbConnection();
    const done = await getConfigParam(db, SELECTION_DONE_KEY);
    const limitStr = await getConfigParam(db, 'free_portfolio_limit');
    if (done !== null) {
      const limit = limitStr ? Number(limitStr) : FREE_LIMIT_FALLBACK;
      return {
        plan: 'free',
        effective_plan: 'free',
        selection_pending: done === '0',
        selection_done: done === '1',
        limit,
        active_count: 0,
        portfolio_count: 0,
        portfolio_enforced: true,
        remaining_slots: limit,
      };
    }
  } catch (_offlineErr) {}

  return null;
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
    const activeStoreId = await getActiveStoreId();
    const db = await getDbConnection();
    await executeQuery(
      db,
      'UPDATE customers SET free_plan_selected = 0 WHERE store_id = ? OR store_id IS NULL;',
      [activeStoreId || ''],
    );

    for (const id of customerIds) {
      await executeQuery(
        db,
        `UPDATE customers
         SET free_plan_selected = 1
         WHERE (local_id = ? OR server_id = ? OR id = ?) AND (store_id = ? OR store_id IS NULL);`,
        [id, id, id, activeStoreId || ''],
      );
    }

    await saveConfigParam(db, SELECTION_DONE_KEY, '1');
  } catch (_localErr) {}
}

export async function getPlanCustomerLimit(planId: string): Promise<number> {
  const normPlan = (planId || 'free').toLowerCase();
  try {
    const db = await getDbConnection();
    const plans = await getLocalSubscriptionPlans(db);
    const matched = plans.find(p => p.id.toLowerCase() === normPlan);
    if (matched && Number.isFinite(matched.customer_limit)) {
      return Number(matched.customer_limit);
    }

    if (normPlan === 'free') {
      const storedLimit = await getConfigParam(db, 'free_portfolio_limit');
      if (storedLimit && Number.isFinite(Number(storedLimit))) {
        return Number(storedLimit);
      }
    }
  } catch (_e) {}

  if (normPlan !== 'free') return 999999;
  return FREE_LIMIT_FALLBACK;
}

export async function getFreeLimit(): Promise<number> {
  return getPlanCustomerLimit('free');
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
 * Valida localmente si se puede crear un fiado para un cliente según su cartera activa:
 * 1. Clientes con saldo pendiente > 0 YA consumen cupo; darles otro fiado NO consume cupo adicional.
 * 2. Clientes con saldo 0 consumen 1 cupo de cartera activa.
 * 3. Planes con customer_limit >= 999999 no tienen límite de clientes.
 */
export async function canCreateCreditForCustomer(
  customerId: string,
  profile: Profile | null,
): Promise<CreditEligibility> {
  let effectivePlan = 'free';
  if (profile) {
    const status = calculateSubscriptionStatus(profile);
    effectivePlan = status.effectivePlan;
  }

  const limit = await getPlanCustomerLimit(effectivePlan);

  // Planes ilimitados (como Pro con limit 999999) nunca tienen restricciones de cupos
  if (limit >= 999999) {
    return {
      allowed: true,
      reason: 'unlimited',
      message: null,
      limit,
      active_count: 0,
      portfolio_count: 0,
    };
  }

  try {
    const activeStoreId = await getActiveStoreId();
    const db = await getDbConnection();
    let query = `SELECT current_balance, free_plan_selected
       FROM customers
       WHERE (local_id = ? OR server_id = ? OR id = ?)`;
    const params: any[] = [customerId, customerId, customerId];
    if (activeStoreId) {
      query += ` AND (store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null")`;
      params.push(activeStoreId);
    }
    query += ` LIMIT 1;`;
    const rows = await getData(db, query, params);

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

    let countQuery = `SELECT
         COUNT(DISTINCT CASE WHEN current_balance > 0 THEN COALESCE(server_id, local_id, id) END) AS active_count,
         COUNT(DISTINCT CASE WHEN current_balance > 0 AND (free_plan_selected = 1 OR free_plan_selected IS NULL) THEN COALESCE(server_id, local_id, id) END) AS portfolio_count
       FROM customers`;
    const countParams: any[] = [];
    if (activeStoreId) {
      countQuery += ` WHERE store_id = ? OR store_id IS NULL OR store_id = "" OR store_id = "null";`;
      countParams.push(activeStoreId);
    }
    const counts = await getData(db, countQuery, countParams);

    const activeCount = Number(counts[0]?.active_count || 0);
    const portfolioCount = Number(counts[0]?.portfolio_count || 0);

    const selectionDone = await getConfigParam(db, SELECTION_DONE_KEY);
    if (selectionDone === '0' && !isSelected) {
      return blocked(
        'selection_pending',
        'Primero debes seleccionar los clientes que conservarán cartera activa en tu plan.',
        limit,
        activeCount,
        portfolioCount,
      );
    }

    // Si el cliente YA TIENE saldo pendiente > 0, otorgarle otro fiado NO consume un nuevo cupo
    if (balance > 0) {
      if (!isSelected) {
        return blocked(
          'not_selected',
          'Este cliente quedó fuera de tu cartera activa seleccionada. Solo puedes registrarle abonos o volverlo a incluir desde la gestión de cartera en tu Perfil.',
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

    // El cliente tiene saldo 0. Darle un fiado activará su cartera y consumirá 1 cupo.
    if (activeCount >= limit) {
      return blocked(
        'no_slots',
        `Ya tienes ${activeCount} de ${limit} clientes con cartera activa (saldo pendiente > 0) permitidos por tu suscripción. Registra abonos para liberar un cupo antes de dar un nuevo fiado.`,
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
