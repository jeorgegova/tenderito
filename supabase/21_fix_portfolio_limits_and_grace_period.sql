-- ============================================================
-- TENDERITO · Migración 21 — Corrección de Cartera Activa y Período de Gracia
-- ============================================================

-- 1. Agregar columna grace_period_days a subscription_plans, profiles y stores si no existen
alter table public.subscription_plans
  add column if not exists grace_period_days integer not null default 10;

alter table public.profiles
  add column if not exists grace_period_days integer;

alter table public.stores
  add column if not exists grace_period_days integer;

-- Asegurar valores iniciales en subscription_plans
update public.subscription_plans
set grace_period_days = 10
where grace_period_days is null;

-- 2. Función para obtener días de gracia parametrizados según el plan
create or replace function public.grace_period_days(p_plan text default null)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if p_plan is not null then
    select sp.grace_period_days into v_days
    from public.subscription_plans sp
    where lower(sp.id) = lower(p_plan) and sp.is_active = true
    limit 1;

    if v_days is not null then
      return greatest(0, v_days);
    end if;
  end if;

  select coalesce(
    nullif((select value from public.app_config where key = 'grace_period_days'), '')::integer,
    10
  ) into v_days;

  return greatest(0, coalesce(v_days, 10));
end;
$$;

-- 3. Límite de cartera activa según el plan parametrizable
create or replace function public.plan_customer_limit(p_plan text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select customer_limit
      from public.subscription_plans
      where lower(id) = lower(p_plan) and is_active = true
      limit 1
    ),
    case lower(p_plan)
      when 'free' then 10
      when 'basic' then 100
      else 999999
    end
  );
$$;

-- 4. Expira suscripciones respetando estrictamente el período de gracia y la zona horaria de Colombia
create or replace function public.expire_subscription_for_profile(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_store_id uuid;
  v_end_date timestamptz;
  v_plan text;
  v_grace_days integer;
  v_grace_end_timestamptz timestamptz;
begin
  select * into v_profile
  from public.profiles
  where id = p_profile_id;

  if not found then
    return false;
  end if;

  v_plan := lower(coalesce(v_profile.subscription_plan, 'free'));
  if v_plan = 'free' then
    return false;
  end if;

  -- Seleccionar la fecha de fin más reciente entre profile y sus stores para no ignorar renovaciones
  select coalesce(
    greatest(
      v_profile.subscription_end_date,
      (select max(subscription_end_date) from public.stores where owner_id = p_profile_id)
    ),
    v_profile.subscription_end_date,
    (select max(subscription_end_date) from public.stores where owner_id = p_profile_id)
  ) into v_end_date;

  if v_end_date is null then
    return false;
  end if;

  -- Días de gracia para este perfil / tienda / plan
  v_grace_days := coalesce(
    v_profile.grace_period_days,
    (select max(grace_period_days) from public.stores where owner_id = p_profile_id),
    public.grace_period_days(v_plan)
  );

  -- Fin de la gracia calculado en la zona horaria de Colombia ('America/Bogota'):
  -- La suscripción vence al final del día v_end_date en Bogotá (23:59:59.999).
  -- El período de gracia son v_grace_days días completos adicionales después de ese día.
  -- Por tanto, la gracia termina a las 00:00:00 del día ((v_end_date_en_bogota + 1 día) + v_grace_days).
  v_grace_end_timestamptz := ((v_end_date at time zone 'America/Bogota')::date + 1 + v_grace_days) at time zone 'America/Bogota';

  -- Si todavía no ha superado el final del período de gracia, NO expira ni pasa a Free
  if now() < v_grace_end_timestamptz then
    return false;
  end if;

  -- Solo aquí el período de gracia ha finalizado por completo
  update public.profiles
  set
    subscription_plan = 'free',
    subscription_start_date = now(),
    subscription_end_date = null,
    subscription_status = 'expired'
  where id = p_profile_id;

  for v_store_id in
    select id from public.stores where owner_id = p_profile_id
  loop
    update public.stores
    set
      subscription_plan = 'free',
      subscription_start_date = now(),
      subscription_end_date = null,
      subscription_status = 'expired'
    where id = v_store_id;

    perform public.prepare_free_portfolio(v_store_id);
  end loop;

  return true;
end;
$$;

-- 5. Expira todas las suscripciones vencidas cuyo período de gracia haya concluido
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select p.id
    from public.profiles p
    where lower(p.subscription_plan) <> 'free'
      and coalesce(
        greatest(p.subscription_end_date,
          (select max(s.subscription_end_date) from public.stores s where s.owner_id = p.id)
        ),
        p.subscription_end_date,
        (select max(s.subscription_end_date) from public.stores s where s.owner_id = p.id)
      ) is not null
  loop
    if public.expire_subscription_for_profile(r.id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- 6. Estado de cartera para la pantalla de la app
create or replace function public.get_free_portfolio_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_owner_id uuid;
  v_plan text;
  v_selection_done boolean;
  v_limit integer;
  v_active integer;
  v_portfolio integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  v_store_id := public.current_store_id();
  if v_store_id is null then
    raise exception 'Usuario sin tienda';
  end if;

  select owner_id into v_owner_id
  from public.stores
  where id = v_store_id;

  perform public.expire_subscription_for_profile(v_owner_id);

  select subscription_plan, free_portfolio_selection_done
  into v_plan, v_selection_done
  from public.stores
  where id = v_store_id;

  v_plan := lower(coalesce(v_plan, 'free'));
  v_limit := public.plan_customer_limit(v_plan);

  select
    count(distinct customer_id) filter (where current_balance > 0),
    count(distinct customer_id) filter (where current_balance > 0 and free_plan_selected)
  into v_active, v_portfolio
  from public.customer_stores
  where store_id = v_store_id;

  return jsonb_build_object(
    'plan', v_plan,
    'effective_plan', v_plan,
    'limit', v_limit,
    'is_unlimited', (v_limit >= 999999),
    'active_count', v_active,
    'portfolio_count', v_portfolio,
    'selection_done', coalesce(v_selection_done, true),
    'selection_pending', (v_limit < 999999 and not coalesce(v_selection_done, true)),
    'portfolio_enforced', (v_limit < 999999),
    'remaining_slots', case when v_limit >= 999999 then 999999 else greatest(0, v_limit - v_active) end
  );
end;
$$;

-- 7. Selección de clientes que conservan cartera activa (permite modificar selección desde perfil)
create or replace function public.set_free_portfolio_selection(p_customer_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_owner_id uuid;
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  v_store_id := public.current_store_id();
  if v_store_id is null then
    raise exception 'Usuario sin tienda';
  end if;

  select owner_id into v_owner_id
  from public.stores
  where id = v_store_id;

  perform public.expire_subscription_for_profile(v_owner_id);

  select subscription_plan
  into v_plan
  from public.stores
  where id = v_store_id;

  v_plan := lower(coalesce(v_plan, 'free'));
  v_limit := public.plan_customer_limit(v_plan);

  -- Si es ilimitado, seleccionar todos los clientes automáticamente
  if v_limit >= 999999 then
    update public.customer_stores
    set free_plan_selected = true
    where store_id = v_store_id;

    update public.stores
    set free_portfolio_selection_done = true
    where id = v_store_id;

    return 0;
  end if;

  select count(distinct x)
  into v_count
  from unnest(coalesce(p_customer_ids, '{}'::uuid[])) as x;

  if v_count > v_limit then
    raise exception 'Solo puedes seleccionar hasta % clientes con cartera activa según tu plan', v_limit;
  end if;

  -- Actualizar selección de cartera
  update public.customer_stores
  set free_plan_selected = false
  where store_id = v_store_id;

  if v_count > 0 then
    update public.customer_stores
    set free_plan_selected = true
    where store_id = v_store_id
      and customer_id = any(coalesce(p_customer_ids, '{}'::uuid[]));
  end if;

  update public.stores
  set free_portfolio_selection_done = true
  where id = v_store_id;

  return v_count;
end;
$$;

-- 8. Validación de cartera activa al crear fiados:
--    - Permite fiados a clientes con deuda activa > 0 sin consumir cupo adicional.
--    - Clientes con deuda 0 consumen 1 cupo de cartera activa.
--    - Planes con customer_limit >= 999999 son ilimitados.
create or replace function public.assert_can_create_credit(
  p_customer_id uuid,
  p_store_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan text;
  v_selection_done boolean;
  v_limit integer;
  v_balance numeric;
  v_selected boolean;
  v_active_count integer;
begin
  if auth.uid() is null then
    return;
  end if;

  select owner_id into v_owner_id
  from public.stores
  where id = p_store_id;

  if v_owner_id is null then
    return;
  end if;

  perform public.expire_subscription_for_profile(v_owner_id);

  select subscription_plan, coalesce(free_portfolio_selection_done, true)
  into v_plan, v_selection_done
  from public.stores
  where id = p_store_id;

  v_plan := lower(coalesce(v_plan, 'free'));
  v_limit := public.plan_customer_limit(v_plan);

  -- Si el plan tiene límite >= 999999 (Ilimitado), se permite sin restricciones de cupos
  if v_limit >= 999999 then
    return;
  end if;

  select current_balance, coalesce(free_plan_selected, true)
  into v_balance, v_selected
  from public.customer_stores
  where customer_id = p_customer_id
    and store_id = p_store_id;

  if not found then
    raise exception 'Cliente no pertenece a la tienda';
  end if;

  -- 1. Si el cliente YA TIENE saldo pendiente > 0, otorgarle otro fiado NO consume un nuevo cupo
  if v_balance > 0 then
    if not v_selection_done and not v_selected then
      raise exception 'Debes seleccionar los clientes de tu cartera activa antes de registrar nuevos fiados';
    end if;
    if not v_selected then
      raise exception 'Este cliente está fuera de tu cartera activa seleccionada. Solo puedes registrarle abonos';
    end if;
    return;
  end if;

  -- 2. El cliente tiene saldo 0. Darle un fiado activará su cartera y consumirá 1 cupo.
  -- Validamos cuántos clientes tienen actualmente saldo pendiente mayor que cero
  select count(distinct customer_id) into v_active_count
  from public.customer_stores
  where store_id = p_store_id
    and current_balance > 0;

  if v_active_count >= v_limit then
    raise exception 'Ya tienes % clientes con cartera activa (saldo pendiente > 0) permitido por tu plan. Registra abonos para liberar un cupo antes de dar un nuevo fiado', v_limit;
  end if;

  -- Marcamos al cliente como seleccionado en la cartera de esta tienda
  update public.customer_stores
  set free_plan_selected = true
  where customer_id = p_customer_id
    and store_id = p_store_id;
end;
$$;

-- 9. Vincular o crear clientes no se limita por cantidad
create or replace function public.link_customer_to_store(
  p_customer_id uuid,
  p_credit_limit numeric default 0,
  p_alias text default null
)
returns public.customer_stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid := public.current_store_id();
  v_result public.customer_stores;
begin
  if v_store_id is null then
    raise exception 'Usuario sin tienda';
  end if;

  if not exists (
    select 1 from public.customers where id = p_customer_id
  ) then
    raise exception 'Cliente no encontrado';
  end if;

  insert into public.customer_stores(
    customer_id, store_id, credit_limit, alias, active, free_plan_selected
  )
  values (
    p_customer_id,
    v_store_id,
    greatest(coalesce(p_credit_limit, 0), 0),
    nullif(trim(p_alias), ''),
    true,
    true
  )
  on conflict (customer_id, store_id) do update set
    credit_limit = excluded.credit_limit,
    alias = coalesce(excluded.alias, customer_stores.alias),
    active = true
  returning * into v_result;

  return v_result;
end;
$$;
