import type {SubscriptionPlanItem} from '../../types';

/**
 * Tabla local de planes de suscripción para soporte Offline-First.
 */
export async function createSubscriptionPlansTable(db: any): Promise<void> {
  await db.executeAsync(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      price_text TEXT NOT NULL DEFAULT '$0',
      customer_limit INTEGER NOT NULL DEFAULT 10,
      badge TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT
    );
  `);
}

/**
 * Inserta o actualiza un plan de suscripción en SQLite local.
 */
export async function insertOrReplaceSubscriptionPlan(
  db: any,
  plan: SubscriptionPlanItem,
): Promise<void> {
  const now = new Date().toISOString();
  await db.executeAsync(
    `INSERT INTO subscription_plans (
       id, name, description, price, price_text, customer_limit, badge, sort_order, is_active, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       price = excluded.price,
       price_text = excluded.price_text,
       customer_limit = excluded.customer_limit,
       badge = excluded.badge,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at;`,
    [
      plan.id,
      plan.name,
      plan.description,
      plan.price ?? 0,
      plan.price_text ?? '$0',
      plan.customer_limit ?? 10,
      plan.badge ?? null,
      plan.sort_order ?? 0,
      plan.is_active === false ? 0 : 1,
      now,
    ],
  );
}

/**
 * Obtiene todos los planes de suscripción activos ordenados.
 */
export async function getLocalSubscriptionPlans(
  db: any,
): Promise<SubscriptionPlanItem[]> {
  try {
    const res = await db.executeAsync(
      `SELECT id, name, description, price, price_text, customer_limit, badge, sort_order, is_active
       FROM subscription_plans
       WHERE is_active = 1
       ORDER BY sort_order ASC, price ASC;`,
    );
    const items: SubscriptionPlanItem[] = [];
    if (res?.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        items.push({
          id: row.id,
          name: row.name,
          description: row.description,
          price: Number(row.price),
          price_text: row.price_text,
          customer_limit: Number(row.customer_limit),
          badge: row.badge,
          sort_order: Number(row.sort_order),
          is_active: Boolean(row.is_active),
        });
      }
    }
    return items;
  } catch (_e) {
    return [];
  }
}
