-- ============================================================
-- ALFIAO · Fase 1/4 — Tablas, constraints e índices
-- Correr en: Supabase Dashboard → SQL Editor (pegado por bloques)
-- Idempotente: usa IF NOT EXISTS donde Postgres lo permite
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- profiles (1 fila por comerciante, id = auth.users.id) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  store_name text not null,
  merchant_name text not null,
  phone text,
  subscription_plan text not null default 'free'
    check (subscription_plan in ('free', 'basic', 'pro')),
  created_at timestamptz not null default now()
);

-- ---------- customers ----------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  -- Lo mantiene el trigger de Fase 3. No escribir desde la app.
  current_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists customers_merchant_id_idx
  on public.customers (merchant_id);
-- Acelera el buscador ilike '%texto%' de CustomersScreen
create index if not exists customers_name_trgm_idx
  on public.customers using gin (name gin_trgm_ops);

-- ---------- credits (fiados) ----------
create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  concept text not null,
  amount numeric(12, 2) not null check (amount > 0),
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'partially_paid', 'paid')),
  created_at timestamptz not null default now()
);

create index if not exists credits_customer_id_idx
  on public.credits (customer_id);
create index if not exists credits_merchant_id_idx
  on public.credits (merchant_id);
-- Acelera fetchOverdueCredits: status != paid + due_date < hoy
create index if not exists credits_overdue_idx
  on public.credits (status, due_date);

-- ---------- payments (abonos, globales o a un crédito) ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  credit_id uuid references public.credits (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_customer_id_idx
  on public.payments (customer_id);
create index if not exists payments_credit_id_idx
  on public.payments (credit_id);
create index if not exists payments_merchant_id_idx
  on public.payments (merchant_id);
