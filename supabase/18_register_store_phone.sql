-- ============================================================
-- TENDERITO · Migración 18: Registrar teléfono de tienda al crear cuenta
-- ============================================================

-- 1. Actualizar handle_new_user() para incluir phone en profiles
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

  insert into public.profiles(id, store_name, merchant_name, phone, subscription_plan)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'store_name', ''), 'Mi negocio'),
    coalesce(nullif(new.raw_user_meta_data ->> 'merchant_name', ''), 'Administrador'),
    coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), nullif(new.raw_user_meta_data ->> 'store_phone', '')),
    coalesce(nullif(new.raw_user_meta_data ->> 'subscription_plan', ''), 'free')
  );
  return new;
end;
$$;

-- 2. Asegurar que create_store_for_profile() copie el teléfono de la tienda
create or replace function public.create_store_for_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid;
begin
  insert into public.stores(owner_id, store_name, phone, subscription_plan)
  values (new.id, new.store_name, new.phone, new.subscription_plan)
  returning id into v_store_id;

  insert into public.store_memberships(store_id, user_id, role)
  values (v_store_id, new.id, 'owner');
  return new;
end;
$$;
