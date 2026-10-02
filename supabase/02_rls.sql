-- ============================================================
-- TENDERITO · Fase 2/4 — Row Level Security (aislamiento por comerciante)
-- Requiere Fase 1. La app usa anon key + sesión → todo pasa por RLS.
-- Regla: cada comerciante solo ve filas con merchant_id = su user id.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.credits enable row level security;
alter table public.payments enable row level security;

-- ---------- profiles: solo su propia fila ----------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Permite el insert de RegisterScreen (id = user id, con sesión activa)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------- customers / credits / payments: dueño = merchant_id ----------
drop policy if exists "customers_owner_all" on public.customers;
create policy "customers_owner_all" on public.customers
  for all using (auth.uid() = merchant_id)
  with check (auth.uid() = merchant_id);

drop policy if exists "credits_owner_all" on public.credits;
create policy "credits_owner_all" on public.credits
  for all using (auth.uid() = merchant_id)
  with check (auth.uid() = merchant_id);

drop policy if exists "payments_owner_all" on public.payments;
create policy "payments_owner_all" on public.payments
  for all using (auth.uid() = merchant_id)
  with check (auth.uid() = merchant_id);
