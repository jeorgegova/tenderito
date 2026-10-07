-- ============================================================
-- TENDERITO · Fase 2/4 — seguridad y aislamiento por tienda
-- ============================================================

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.customers enable row level security;
alter table public.customer_stores enable row level security;
alter table public.credits enable row level security;
alter table public.payments enable row level security;

create policy profiles_own_select on public.profiles
  for select using (auth.uid() = id);
create policy profiles_own_insert on public.profiles
  for insert with check (auth.uid() = id);
create policy profiles_own_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy stores_member_select on public.stores
  for select using (exists (
    select 1 from public.store_memberships m
    where m.store_id = stores.id and m.user_id = auth.uid()
  ));

create policy memberships_own_select on public.store_memberships
  for select using (user_id = auth.uid());

create policy customer_stores_member_all on public.customer_stores
  for all using (exists (
    select 1 from public.store_memberships m
    where m.store_id = customer_stores.store_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.store_memberships m
    where m.store_id = customer_stores.store_id and m.user_id = auth.uid()
  ));

create policy customers_member_select on public.customers
  for select using (exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = customers.id and m.user_id = auth.uid()
  ));
create policy customers_member_update on public.customers
  for update using (exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = customers.id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = customers.id and m.user_id = auth.uid()
  ));
create policy customers_member_delete on public.customers
  for delete using (exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = customers.id and m.user_id = auth.uid()
  ));

create policy credits_member_all on public.credits
  for all using (exists (
    select 1 from public.store_memberships m
    where m.store_id = credits.store_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.store_memberships m
    where m.store_id = credits.store_id and m.user_id = auth.uid()
  ));

create policy payments_member_all on public.payments
  for all using (exists (
    select 1 from public.store_memberships m
    where m.store_id = payments.store_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.store_memberships m
    where m.store_id = payments.store_id and m.user_id = auth.uid()
  ));
