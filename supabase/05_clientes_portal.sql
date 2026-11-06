-- ============================================================
-- TENDERITO · Portal de clientes y vinculación por tienda
-- Ejecutar después de 03_triggers.sql
-- ============================================================

alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.customers add column if not exists activated_at timestamptz;
create index if not exists customers_user_id_idx on public.customers(user_id);

alter table public.customer_stores add column if not exists credit_limit numeric(12, 2) not null default 0;
alter table public.customer_stores add column if not exists alias text;
alter table public.stores add column if not exists address text;

-- Funciones auxiliares para RLS
create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.store_memberships
    where store_id = p_store_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_customer_of_my_stores(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = p_customer_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_portal_customer(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.user_id = auth.uid()
  );
$$;

-- Políticas RLS
drop policy if exists stores_member_select on public.stores;
drop policy if exists stores_visible_to_owner_or_customer on public.stores;
create policy stores_visible_to_owner_or_customer on public.stores
  for select using (
    public.is_store_member(stores.id)
    or exists (
      select 1 from public.customer_stores cs
      where cs.store_id = stores.id and cs.active and public.is_portal_customer(cs.customer_id)
    )
  );

drop policy if exists customer_stores_member_all on public.customer_stores;
drop policy if exists customer_stores_owner_all on public.customer_stores;
drop policy if exists customer_stores_customer_select on public.customer_stores;

create policy customer_stores_owner_all on public.customer_stores
  for all using (
    public.is_store_member(customer_stores.store_id)
  ) with check (
    public.is_store_member(customer_stores.store_id)
  );

create policy customer_stores_customer_select on public.customer_stores
  for select using (
    public.is_portal_customer(customer_stores.customer_id)
  );

drop policy if exists customers_member_select on public.customers;
drop policy if exists customers_owner_or_customer_select on public.customers;
drop policy if exists customers_member_update on public.customers;
drop policy if exists customers_owner_update on public.customers;
drop policy if exists customers_member_delete on public.customers;
drop policy if exists customers_owner_delete on public.customers;
drop policy if exists customers_owner_insert on public.customers;

create policy customers_owner_or_customer_select on public.customers
  for select using (
    customers.user_id = auth.uid()
    or public.is_customer_of_my_stores(customers.id)
  );

create policy customers_owner_insert on public.customers
  for insert with check (auth.uid() is not null);

create policy customers_owner_update on public.customers
  for update using (
    public.is_customer_of_my_stores(customers.id)
  ) with check (
    public.is_customer_of_my_stores(customers.id)
  );

create policy customers_owner_delete on public.customers
  for delete using (
    public.is_customer_of_my_stores(customers.id)
  );

drop policy if exists credits_member_all on public.credits;
drop policy if exists credits_owner_all on public.credits;
drop policy if exists credits_customer_select on public.credits;

create policy credits_owner_all on public.credits
  for all using (
    public.is_store_member(credits.store_id)
  ) with check (
    public.is_store_member(credits.store_id)
  );

create policy credits_customer_select on public.credits
  for select using (
    public.is_portal_customer(credits.customer_id)
  );

drop policy if exists payments_member_all on public.payments;
drop policy if exists payments_owner_all on public.payments;
drop policy if exists payments_customer_select on public.payments;

create policy payments_owner_all on public.payments
  for all using (
    public.is_store_member(payments.store_id)
  ) with check (
    public.is_store_member(payments.store_id)
  );

create policy payments_customer_select on public.payments
  for select using (
    public.is_portal_customer(payments.customer_id)
  );

create or replace function public.find_customer_by_document(p_document_number text)
returns table (
  id uuid, name text, document_type text, document_number text,
  phone text, email text, notes text, created_at timestamptz
) language plpgsql security definer set search_path = public
as $$
begin
  if public.current_store_id() is null then raise exception 'Usuario sin tienda'; end if;
  return query
    select c.id, c.name, c.document_type, c.document_number,
      c.phone, c.email, c.notes, c.created_at
    from public.customers c
    where regexp_replace(upper(c.document_number), '[^0-9A-Z]', '', 'g') =
      regexp_replace(upper(trim(p_document_number)), '[^0-9A-Z]', '', 'g')
    limit 1;
end;
$$;

drop function if exists public.link_customer_to_store(uuid, numeric);
create or replace function public.link_customer_to_store(
  p_customer_id uuid, p_credit_limit numeric default 0, p_alias text default null
)
returns public.customer_stores language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid := public.current_store_id();
declare v_result public.customer_stores;
declare v_plan text;
declare v_count integer;
declare v_limit integer;
begin
  if v_store_id is null then raise exception 'Usuario sin tienda'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Cliente no encontrado';
  end if;
  select subscription_plan into v_plan from public.profiles where id = auth.uid();
  select count(*) into v_count from public.customer_stores where store_id = v_store_id;
  v_limit := case v_plan when 'free' then 10 when 'basic' then 100 else 2147483647 end;
  if v_count >= v_limit and not exists (
    select 1 from public.customer_stores where store_id = v_store_id and customer_id = p_customer_id
  ) then raise exception 'Límite de clientes alcanzado para el plan'; end if;
  insert into public.customer_stores(customer_id, store_id, credit_limit, alias, active)
  values (p_customer_id, v_store_id, greatest(coalesce(p_credit_limit, 0), 0), nullif(trim(p_alias), ''), true)
  on conflict (customer_id, store_id) do update set
    credit_limit = excluded.credit_limit,
    alias = coalesce(excluded.alias, customer_stores.alias),
    active = true
  returning * into v_result;
  return v_result;
end;
$$;

drop function if exists public.create_customer(text, text, text, text, text);
drop function if exists public.create_customer(text, text, text, text, text, text, numeric);
create or replace function public.create_customer(
  p_name text, p_document_type text, p_document_number text,
  p_phone text default null, p_notes text default null,
  p_email text default null, p_credit_limit numeric default 0,
  p_alias text default null
)
returns public.customers language plpgsql security definer set search_path = public
as $$
declare v_customer public.customers;
begin
  select * into v_customer from public.customers
  where regexp_replace(upper(document_number), '[^0-9A-Z]', '', 'g') =
    regexp_replace(upper(trim(p_document_number)), '[^0-9A-Z]', '', 'g');
  if v_customer.id is null then
    insert into public.customers(name, document_type, document_number, phone, email, notes)
    values (trim(p_name), upper(trim(p_document_type)), trim(p_document_number),
      nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_notes)
    returning * into v_customer;
  end if;
  perform public.link_customer_to_store(v_customer.id, p_credit_limit, p_alias);
  return v_customer;
end;
$$;

create or replace function public.find_customer_for_activation(p_document_number text)
returns table (customer_id uuid, name_masked text, phone_masked text)
language sql security definer set search_path = public
as $$
  select c.id,
    left(c.name, 3) || '***' as name_masked,
    case when c.phone is null then 'Sin teléfono'
      else left(regexp_replace(c.phone, '[^0-9]', '', 'g'), 5) || '****' end as phone_masked
  from public.customers c
  where regexp_replace(upper(c.document_number), '[^0-9A-Z]', '', 'g') =
    regexp_replace(upper(trim(p_document_number)), '[^0-9A-Z]', '', 'g')
  limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_customer_id uuid;
begin
  if new.raw_user_meta_data ->> 'user_type' = 'customer' then
    v_customer_id := (new.raw_user_meta_data ->> 'customer_id')::uuid;
    if not exists (
      select 1 from public.customers c
      where c.id = v_customer_id
        and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') =
            regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g')
    ) then raise exception 'Los datos del cliente no coinciden'; end if;

    update public.customers
    set user_id = new.id,
        activated_at = coalesce(activated_at, now())
    where id = v_customer_id;

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"user_type": "customer"}'::jsonb
    where id = new.id;

    return new;
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"user_type": "store"}'::jsonb
  where id = new.id;

  insert into public.profiles(id, store_name, merchant_name, subscription_plan)
  values (new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'store_name', ''), 'Mi negocio'),
    coalesce(nullif(new.raw_user_meta_data ->> 'merchant_name', ''), 'Administrador'),
    coalesce(nullif(new.raw_user_meta_data ->> 'subscription_plan', ''), 'free'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_stores to authenticated;
grant select, insert, update, delete on public.credits to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, update on public.stores to authenticated;
grant select on public.store_memberships to authenticated;

revoke all on function public.find_customer_by_document(text) from public;
revoke all on function public.link_customer_to_store(uuid, numeric, text) from public;
revoke all on function public.create_customer(text, text, text, text, text, text, numeric, text) from public;
revoke all on function public.find_customer_for_activation(text) from public;
grant execute on function public.find_customer_by_document(text) to authenticated;
grant execute on function public.link_customer_to_store(uuid, numeric, text) to authenticated;
grant execute on function public.create_customer(text, text, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.find_customer_for_activation(text) to anon, authenticated;

create or replace function public.get_customer_history(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid := public.current_store_id();
declare v_plan text;
begin
  if v_store_id is null then raise exception 'Usuario sin tienda'; end if;
  select subscription_plan into v_plan from public.profiles where id = auth.uid();
  if v_plan = 'free' then raise exception 'El historial entre tiendas requiere un plan pago'; end if;
  if not exists (select 1 from public.customer_stores where customer_id = p_customer_id) then
    raise exception 'Cliente no encontrado';
  end if;
  return jsonb_build_object(
    'stores', coalesce((select jsonb_agg(jsonb_build_object(
      'store_id', cs.store_id, 'store_name', s.store_name, 'phone', s.phone,
      'address', s.address, 'current_balance', cs.current_balance,
      'last_movement', greatest(
        coalesce((select max(c.created_at) from public.credits c where c.customer_id = cs.customer_id and c.store_id = cs.store_id), '-infinity'::timestamptz),
        coalesce((select max(p.payment_date) from public.payments p where p.customer_id = cs.customer_id and p.store_id = cs.store_id), '-infinity'::timestamptz)
      )
    )) from public.customer_stores cs join public.stores s on s.id = cs.store_id
      where cs.customer_id = p_customer_id), '[]'::jsonb),
    'credits', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('store_name', s.store_name))
      from public.credits c join public.stores s on s.id = c.store_id
      where c.customer_id = p_customer_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('store_name', s.store_name))
      from public.payments p join public.stores s on s.id = p.store_id
      where p.customer_id = p_customer_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_customer_history(uuid) from public;
grant execute on function public.get_customer_history(uuid) to authenticated;
