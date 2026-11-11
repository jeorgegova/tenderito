-- ============================================================
-- TENDERITO · Migración: Unificación de customers y corrección RLS
-- Ejecutar en Supabase (SQL Editor)
--
-- Corrige el bloqueo de carga de clientes:
-- 1. Agrega user_id y activated_at a public.customers si no existen.
-- 2. Crea funciones SECURITY DEFINER para romper referencias circulares en RLS.
-- 3. Aplica políticas RLS completas tanto para el Tendero como para el Cliente del portal.
-- 4. Otorga los permisos explícitos GRANT a authenticated.
-- 5. Elimina la tabla redundante public.customer_accounts si aún existe.
-- ============================================================

-- 1. Agregar columnas a public.customers
alter table public.customers 
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists activated_at timestamptz;

-- Asegurar restricción única en user_id
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_user_id_key'
  ) then
    alter table public.customers add constraint customers_user_id_key unique (user_id);
  end if;
end $$;

-- Índice para búsquedas ultra rápidas por user_id
create index if not exists customers_user_id_idx on public.customers(user_id);

-- Migrar datos antiguos de customer_accounts si la tabla existe
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'customer_accounts'
  ) then
    update public.customers c
    set user_id = ca.user_id,
        activated_at = coalesce(ca.activated_at, now())
    from public.customer_accounts ca
    where c.id = ca.customer_id
      and c.user_id is null;
  end if;
end $$;

-- 2. Funciones auxiliares SECURITY DEFINER en PL/pgSQL (evitan inlining y recursión infinita en PostgreSQL)

-- Verifica si el usuario actual es dueño/empleado de la tienda indicada
create or replace function public.is_store_member(p_store_id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (
    select 1 from public.store_memberships
    where store_id = p_store_id and user_id = auth.uid()
  );
end;
$$;

-- Verifica si un cliente pertenece a alguna de las tiendas del usuario actual
create or replace function public.is_customer_of_my_stores(p_customer_id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = p_customer_id and m.user_id = auth.uid()
  );
end;
$$;

-- Verifica si el usuario actual es el cliente (portal)
create or replace function public.is_portal_customer(p_customer_id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.user_id = auth.uid()
  );
end;
$$;

-- 3. Habilitar RLS en las tablas principales
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.customers enable row level security;
alter table public.customer_stores enable row level security;
alter table public.credits enable row level security;
alter table public.payments enable row level security;

-- 4. Políticas para STORES
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

-- 5. Políticas para STORE_MEMBERSHIPS
drop policy if exists memberships_own_select on public.store_memberships;
create policy memberships_own_select on public.store_memberships
  for select using (user_id = auth.uid());

-- 6. Políticas para CUSTOMER_STORES (Tienda + Cliente)
drop policy if exists customer_stores_member_all on public.customer_stores;
drop policy if exists customer_stores_owner_all on public.customer_stores;
drop policy if exists customer_stores_customer_select on public.customer_stores;

-- Tienda / Tendero: acceso total a sus vinculaciones
create policy customer_stores_owner_all on public.customer_stores
  for all using (
    public.is_store_member(customer_stores.store_id)
  ) with check (
    public.is_store_member(customer_stores.store_id)
  );

-- Cliente del Portal: ver las tiendas a las que está vinculado
create policy customer_stores_customer_select on public.customer_stores
  for select using (
    public.is_portal_customer(customer_stores.customer_id)
  );

-- 7. Políticas para CUSTOMERS (Tienda + Cliente)
drop policy if exists customers_member_select on public.customers;
drop policy if exists customers_owner_or_customer_select on public.customers;
drop policy if exists customers_member_update on public.customers;
drop policy if exists customers_owner_update on public.customers;
drop policy if exists customers_member_delete on public.customers;
drop policy if exists customers_owner_delete on public.customers;
drop policy if exists customers_owner_insert on public.customers;

-- Lectura: El cliente ve su propio perfil; el tendero ve los clientes de sus tiendas
create policy customers_owner_or_customer_select on public.customers
  for select using (
    customers.user_id = auth.uid()
    or public.is_customer_of_my_stores(customers.id)
  );

-- Creación de clientes por usuarios autenticados
create policy customers_owner_insert on public.customers
  for insert with check (auth.uid() is not null);

-- Modificación de clientes por la tienda
create policy customers_owner_update on public.customers
  for update using (
    public.is_customer_of_my_stores(customers.id)
  ) with check (
    public.is_customer_of_my_stores(customers.id)
  );

-- Eliminación de clientes por la tienda
create policy customers_owner_delete on public.customers
  for delete using (
    public.is_customer_of_my_stores(customers.id)
  );

-- 8. Políticas para CREDITS
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

-- 9. Políticas para PAYMENTS
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

-- 10. Actualizar trigger handle_new_user()
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
    ) then 
      raise exception 'Los datos del cliente no coinciden'; 
    end if;

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
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'store_name', ''), 'Mi negocio'),
    coalesce(nullif(new.raw_user_meta_data ->> 'merchant_name', ''), 'Administrador'),
    coalesce(nullif(new.raw_user_meta_data ->> 'subscription_plan', ''), 'free')
  );
  return new;
end;
$$;

-- 11. Actualizar función de notificaciones push de cliente
create or replace function public.obtener_tokens_cliente(p_customer_id uuid)
returns table (fcm_token text, platform text, device_name text)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  select dv.fcm_token, dv.platform, dv.device_name
  from public.dispositivos_vinculados dv
  join public.customers c on c.user_id = dv.user_id
  where c.id = p_customer_id
    and dv.is_active = true;
end;
$$;

-- 12. Permisos GRANT para rol authenticated
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_stores to authenticated;
grant select, insert, update, delete on public.credits to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, update on public.stores to authenticated;
grant select on public.store_memberships to authenticated;

grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.is_customer_of_my_stores(uuid) to authenticated;
grant execute on function public.is_portal_customer(uuid) to authenticated;

-- 13. Eliminar tabla obsoleta customer_accounts
drop table if exists public.customer_accounts cascade;
