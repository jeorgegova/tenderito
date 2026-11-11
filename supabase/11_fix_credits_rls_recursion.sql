-- ============================================================
-- TENDERITO · Corrección de Recursión RLS en Créditos y Pagos
-- Ejecutar en Supabase (SQL Editor)
--
-- Causa del problema:
-- Las funciones auxiliares estaban en `LANGUAGE sql`, lo que permite
-- que PostgreSQL las "inlinee" (incruste) en la consulta, ignorando
-- el `SECURITY DEFINER` y disparando una recursión cíclica de RLS:
-- credits -> is_portal_customer -> customers -> is_customer_of_my_stores
-- -> customer_stores -> is_portal_customer (LOOP infinito).
--
-- Solución:
-- 1. Cambiar las 3 funciones auxiliares a `LANGUAGE plpgsql`.
--    En PostgreSQL, las funciones PL/pgSQL NUNCA se inlinean,
--    garantizando que el `SECURITY DEFINER` se respete y NO evalúe
--    las políticas RLS internas (rompe el ciclo de raíz).
-- 2. Habilitar de nuevo RLS en `credits` y `payments` con políticas limpias.
-- ============================================================

-- 1. Actualizar funciones auxiliares a PL/pgSQL (SECURITY DEFINER estricto)
create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.store_memberships
    where store_id = p_store_id and user_id = auth.uid()
  );
end;
$$;

create or replace function public.is_customer_of_my_stores(p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.customer_stores cs
    join public.store_memberships m on m.store_id = cs.store_id
    where cs.customer_id = p_customer_id and m.user_id = auth.uid()
  );
end;
$$;

create or replace function public.is_portal_customer(p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.user_id = auth.uid()
  );
end;
$$;

-- Permisos de ejecución
grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.is_customer_of_my_stores(uuid) to authenticated;
grant execute on function public.is_portal_customer(uuid) to authenticated;

-- 2. Asegurar RLS y políticas en CREDITS
alter table public.credits enable row level security;

drop policy if exists credits_member_all on public.credits;
drop policy if exists credits_owner_all on public.credits;
drop policy if exists credits_customer_select on public.credits;

-- La tienda tiene acceso total a los créditos de sus tiendas
create policy credits_owner_all on public.credits
  for all using (
    public.is_store_member(credits.store_id)
  ) with check (
    public.is_store_member(credits.store_id)
  );

-- El cliente puede consultar (SELECT) sus propios créditos
create policy credits_customer_select on public.credits
  for select using (
    public.is_portal_customer(credits.customer_id)
  );

-- 3. Asegurar RLS y políticas en PAYMENTS
alter table public.payments enable row level security;

drop policy if exists payments_member_all on public.payments;
drop policy if exists payments_owner_all on public.payments;
drop policy if exists payments_customer_select on public.payments;

-- La tienda tiene acceso total a los abonos de sus tiendas
create policy payments_owner_all on public.payments
  for all using (
    public.is_store_member(payments.store_id)
  ) with check (
    public.is_store_member(payments.store_id)
  );

-- El cliente puede consultar (SELECT) sus propios abonos
create policy payments_customer_select on public.payments
  for select using (
    public.is_portal_customer(payments.customer_id)
  );

-- Permisos GRANT para authenticated
grant select, insert, update, delete on public.credits to authenticated;
grant select, insert, update, delete on public.payments to authenticated;

