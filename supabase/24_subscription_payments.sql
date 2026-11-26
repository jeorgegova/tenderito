-- ==============================================================================
-- TENDERITO · Fase 24 — Registro de Pagos e Ingresos de Suscripciones
-- ==============================================================================
-- Permite llevar el historial real de pagos recibidos por suscripciones de
-- tiendas, con monto parametrizado vs. monto realmente pagado (editable),
-- método de pago, vigencia y notas para control financiero en Orbit Manager.
-- ==============================================================================

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  plan_id text not null,
  duration_type text not null default '1_month'
    check (duration_type in ('1_month', '3_months', 'custom', 'vitalicio')),
  amount_expected numeric(12, 2) not null default 0 check (amount_expected >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  payment_method text not null default 'Transferencia',
  notes text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_payments_store
  on public.subscription_payments(store_id, paid_at desc);

create index if not exists idx_subscription_payments_paid_at
  on public.subscription_payments(paid_at desc);

alter table public.subscription_payments enable row level security;

-- El dueño de la tienda puede consultar sus propios pagos de suscripción
drop policy if exists "subscription_payments_owner_select" on public.subscription_payments;
create policy "subscription_payments_owner_select"
  on public.subscription_payments
  for select
  to authenticated
  using (owner_id = auth.uid());

-- El superadmin de soporte tiene control total vía Orbit Manager
drop policy if exists "support_superadmin_all" on public.subscription_payments;
create policy "support_superadmin_all"
  on public.subscription_payments
  for all
  to authenticated
  using (public.is_support_admin())
  with check (public.is_support_admin());
