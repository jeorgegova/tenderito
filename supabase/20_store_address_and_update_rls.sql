-- ============================================================================
-- Migración 20: Permitir edición completa de datos de la tienda (incluyendo dirección)
-- y habilitar permisos RLS de UPDATE sobre la tabla 'stores'.
-- ============================================================================

-- 1. Asegurar que ambas tablas posean la columna address
alter table public.stores add column if not exists address text;
alter table public.profiles add column if not exists address text;

-- 2. Crear política RLS para permitir al tendero actualizar su propia tienda en 'stores'
drop policy if exists stores_owner_update on public.stores;
create policy stores_owner_update on public.stores
  for update
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.store_memberships m
      where m.store_id = stores.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from public.store_memberships m
      where m.store_id = stores.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
  );

-- Otorgar permisos de update a authenticated
grant update on public.stores to authenticated;
grant update on public.profiles to authenticated;

-- 3. Función RPC segura para actualizar la tienda propia y el perfil en una sola operación atómica
create or replace function public.update_store_profile(
  p_store_name text,
  p_phone text default null,
  p_merchant_name text default null,
  p_address text default null,
  p_store_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_store_id uuid := p_store_id;
  v_clean_store_name text := trim(coalesce(p_store_name, ''));
  v_clean_phone text := nullif(trim(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g')), '');
  v_clean_merchant text := nullif(trim(coalesce(p_merchant_name, '')), '');
  v_clean_address text := nullif(trim(coalesce(p_address, '')), '');
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if v_clean_store_name = '' then
    raise exception 'El nombre de la tienda es requerido';
  end if;

  -- Resolver store_id si no fue provisto
  if v_store_id is null then
    select s.id into v_store_id
    from public.stores s
    where s.owner_id = v_uid
    order by s.created_at asc
    limit 1;
  end if;

  -- 1. Actualizar tabla stores
  if v_store_id is not null then
    update public.stores
    set store_name = v_clean_store_name,
        phone = v_clean_phone,
        address = v_clean_address
    where id = v_store_id
      and (
        owner_id = v_uid
        or exists (
          select 1 from public.store_memberships m
          where m.store_id = v_store_id
            and m.user_id = v_uid
            and m.role in ('owner', 'manager')
        )
      );
  else
    -- Si no tenía store_id identificado, actualizar todas las tiendas donde sea owner
    update public.stores
    set store_name = v_clean_store_name,
        phone = v_clean_phone,
        address = v_clean_address
    where owner_id = v_uid;
  end if;

  -- 2. Actualizar tabla profiles
  update public.profiles
  set store_name = v_clean_store_name,
      phone = v_clean_phone,
      merchant_name = coalesce(v_clean_merchant, merchant_name),
      address = v_clean_address
  where id = v_uid;

  return jsonb_build_object(
    'success', true,
    'store_id', v_store_id,
    'store_name', v_clean_store_name,
    'phone', v_clean_phone,
    'merchant_name', v_clean_merchant,
    'address', v_clean_address
  );
end;
$$;

revoke all on function public.update_store_profile(text, text, text, text, uuid) from public;
grant execute on function public.update_store_profile(text, text, text, text, uuid) to authenticated;
