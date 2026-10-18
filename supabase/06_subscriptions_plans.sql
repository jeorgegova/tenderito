-- ============================================================
-- TENDERITO · Fase 6 — Planes de Suscripción Parametrizables
-- ============================================================

-- 1. Tabla de Planes de Suscripción parametrizables
create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  description text not null,
  price numeric not null default 0,
  price_text text not null default '$0',
  customer_limit integer not null default 10,
  badge text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;

-- Lectura pública para usuarios autenticados
drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans
  for select using (true);

-- Datos iniciales de planes
insert into public.subscription_plans (id, name, description, price, price_text, customer_limit, badge, sort_order, is_active)
values
  ('free', 'Free', 'Hasta 10 clientes · Vitalicio', 0, '$0', 10, null, 1, true),
  ('basic', 'Basic', 'Hasta 100 clientes', 29900, '$29.900/mes', 100, 'Popular', 2, true),
  ('pro', 'Pro', 'Clientes ilimitados + funciones avanzadas', 59900, '$59.900/mes', 999999, 'Recomendado', 3, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  price_text = excluded.price_text,
  customer_limit = excluded.customer_limit,
  badge = excluded.badge,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- 2. Tabla de Configuración de la Plataforma (teléfono de soporte, días de gracia, etc.)
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
  for select using (true);

-- Parámetros iniciales
insert into public.app_config (key, value, description)
values
  ('support_whatsapp', '573001234567', 'Número de WhatsApp de soporte para suscripciones y atención al tendero'),
  ('grace_period_days', '10', 'Días de gracia posteriores al vencimiento de un plan pago antes de regresar a plan Free')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

-- 3. Fechas de suscripción en profiles y stores
alter table public.profiles add column if not exists subscription_start_date timestamptz;
alter table public.profiles add column if not exists subscription_end_date timestamptz;
alter table public.profiles add column if not exists subscription_status text default 'active';

alter table public.stores add column if not exists subscription_start_date timestamptz;
alter table public.stores add column if not exists subscription_end_date timestamptz;
alter table public.stores add column if not exists subscription_status text default 'active';

-- 4. Función RPC para cambiar inmediatamente a plan Free desde la app
create or replace function public.downgrade_to_free()
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  update public.profiles
  set
    subscription_plan = 'free',
    subscription_start_date = now(),
    subscription_end_date = null,
    subscription_status = 'active'
  where id = v_user_id;

  update public.stores
  set
    subscription_plan = 'free',
    subscription_start_date = now(),
    subscription_end_date = null,
    subscription_status = 'active'
  where owner_id = v_user_id;
end;
$$;
