-- ============================================================
-- TENDERITO · Fase 1/4 — esquema inicial multi-tienda
-- Ejecutar sobre un proyecto Supabase vacío.
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_name text not null,
  merchant_name text not null,
  phone text,
  subscription_plan text not null default 'free'
    check (subscription_plan in ('free', 'basic', 'pro')),
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  store_name text not null,
  phone text,
  subscription_plan text not null default 'free'
    check (subscription_plan in ('free', 'basic', 'pro')),
  created_at timestamptz not null default now()
);

create table public.store_memberships (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'manager', 'cashier')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_memberships_user_idx on public.store_memberships(user_id);

-- Un cliente existe una sola vez, aunque compre en varias tiendas.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text not null,
  document_number text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  constraint customers_document_type_chk check (length(trim(document_type)) > 0),
  constraint customers_document_number_chk check (length(trim(document_number)) > 0)
);

create unique index customers_identity_uidx on public.customers (
  upper(trim(document_type)),
  regexp_replace(upper(trim(document_number)), '[^0-9A-Z]', '', 'g')
);
create index customers_name_trgm_idx
  on public.customers using gin (name gin_trgm_ops);

-- El saldo es por tienda, no por cliente global.
create table public.customer_stores (
  customer_id uuid not null references public.customers(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  current_balance numeric(12, 2) not null default 0 check (current_balance >= 0),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (customer_id, store_id)
);

create index customer_stores_store_idx
  on public.customer_stores(store_id, current_balance desc);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  concept text not null,
  amount numeric(12, 2) not null check (amount > 0),
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'partially_paid', 'paid')),
  created_at timestamptz not null default now(),
  constraint credits_customer_store_fk foreign key (customer_id, store_id)
    references public.customer_stores(customer_id, store_id)
);

create index credits_store_customer_idx
  on public.credits(store_id, customer_id, created_at desc);
create index credits_overdue_idx on public.credits(store_id, status, due_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  credit_id uuid references public.credits(id) on delete set null,
  created_by uuid not null references auth.users(id),
  amount numeric(12, 2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint payments_customer_store_fk foreign key (customer_id, store_id)
    references public.customer_stores(customer_id, store_id)
);

create index payments_store_customer_idx
  on public.payments(store_id, customer_id, payment_date desc);
create index payments_credit_idx on public.payments(credit_id);
