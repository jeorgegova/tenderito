-- ============================================================
-- TENDERITO · Fase 10 — Cartera activa limitada en plan Free
-- ============================================================
-- Regla:
--   · El plan Free permite hasta N clientes con cartera activa
--     (saldo pendiente > 0). No limita el total de clientes.
--   · Al vencer un plan pago y superar los días de gracia, la
--     tienda baja automáticamente a Free.
--   · Si al bajar a Free hay más clientes con saldo activo que el
--     límite, el tendero debe elegir una sola vez qué clientes
--     conservan cartera. Los demás solo pueden recibir abonos.
--   · Cuando un cliente de la cartera queda en $0, su cupo se
--     libera automáticamente para que otro cliente en $0 pueda
--     recibir un nuevo fiado.

alter table public.stores
  add column if not exists free_portfolio_selection_done boolean not null default true;

alter table public.customer_stores
  add column if not exists free_plan_selected boolean not null default true;

create index if not exists customer_stores_free_portfolio_idx
  on public.customer_stores(store_id, free_plan_selected, current_balance);

-- Días de gracia configurados en app_config.
create or replace function public.grace_period_days()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce(
      nullif((select value from public.app_config where key = 'grace_period_days'), '')::integer,
      10
    )
  );
$$;

-- Límite de cartera activa según el plan parametrizable.
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
      where id = lower(p_plan) and is_active = true
      limit 1
    ),
    case lower(p_plan)
      when 'free' then 10
      when 'basic' then 100
      else 2147483647
    end
  );
$$;

-- Prepara la cartera de una tienda que acaba de pasar a Free.
-- Si tiene más clientes activos que el límite, exige selección.
create or replace function public.prepare_free_portfolio(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := public.plan_customer_limit('free');
  v_active integer;
begin
  select count(*) into v_active
  from public.customer_stores
  where store_id = p_store_id and current_balance > 0;

  if v_active > v_limit then
    update public.customer_stores
    set free_plan_selected = false
    where store_id = p_store_id;
  else
    update public.customer_stores
    set free_plan_selected = true
    where store_id = p_store_id;
  end if;

  update public.stores
  set free_portfolio_selection_done = (v_active <= v_limit)
  where id = p_store_id;
end;
$$;

-- Expira una suscripción concreta y prepara su cartera Free.
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
begin
  select * into v_profile
  from public.profiles
  where id = p_profile_id;

  if not found then
    return false;
  end if;

  if v_profile.subscription_plan = 'free' then
    return false;
  end if;

  v_end_date := coalesce(
    v_profile.subscription_end_date,
    (select max(subscription_end_date)
     from public.stores
     where owner_id = p_profile_id)
  );

  if v_end_date is null then
    return false;
  end if;

  if now() <= v_end_date
      + make_interval(days => public.grace_period_days()) then
    return false;
  end if;

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

-- Expira todas las suscripciones vencidas. Se llama desde la app
-- cada vez que se conecta a Supabase.
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
    where p.subscription_plan <> 'free'
      and coalesce(
        p.subscription_end_date,
        (select max(s.subscription_end_date)
         from public.stores s
         where s.owner_id = p.id)
      ) is not null
      and now() > coalesce(
        p.subscription_end_date,
        (select max(s.subscription_end_date)
         from public.stores s
         where s.owner_id = p.id)
      ) + make_interval(days => public.grace_period_days())
  loop
    if public.expire_subscription_for_profile(r.id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Estado de cartera para la pantalla de la app.
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

  v_limit := public.plan_customer_limit(v_plan);

  select
    count(*) filter (where current_balance > 0),
    count(*) filter (where current_balance > 0 and free_plan_selected)
  into v_active, v_portfolio
  from public.customer_stores
  where store_id = v_store_id;

  return jsonb_build_object(
    'plan', v_plan,
    'effective_plan', v_plan,
    'limit', v_limit,
    'active_count', v_active,
    'portfolio_count', v_portfolio,
    'selection_done', coalesce(v_selection_done, true),
    'selection_pending', (v_plan = 'free' and not coalesce(v_selection_done, true)),
    'portfolio_enforced', (v_plan = 'free'),
    'remaining_slots', greatest(0, v_limit - v_portfolio)
  );
end;
$$;

-- Selección inicial (una sola vez) de los clientes que conservan
-- cartera activa al bajar de plan.
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
  v_selection_done boolean;
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

  select subscription_plan, free_portfolio_selection_done
  into v_plan, v_selection_done
  from public.stores
  where id = v_store_id;

  if v_plan <> 'free' then
    raise exception 'La selección de cartera solo aplica al plan Free';
  end if;

  if coalesce(v_selection_done, true) then
    raise exception 'La selección de cartera ya fue realizada';
  end if;

  v_limit := public.plan_customer_limit('free');

  select count(distinct x)
  into v_count
  from unnest(coalesce(p_customer_ids, '{}'::uuid[])) as x;

  if v_count = 0 then
    raise exception 'Selecciona al menos un cliente';
  end if;

  if v_count > v_limit then
    raise exception 'Solo puedes seleccionar % clientes con cartera activa', v_limit;
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_customer_ids, '{}'::uuid[])) as x
    where not exists (
      select 1
      from public.customer_stores cs
      where cs.store_id = v_store_id
        and cs.customer_id = x
        and cs.current_balance > 0
    )
  ) then
    raise exception 'Solo puedes seleccionar clientes con saldo activo en tu tienda';
  end if;

  update public.customer_stores
  set free_plan_selected = false
  where store_id = v_store_id;

  update public.customer_stores
  set free_plan_selected = true
  where store_id = v_store_id
    and customer_id = any(coalesce(p_customer_ids, '{}'::uuid[]));

  update public.stores
  set
    free_portfolio_selection_done = true,
    subscription_status = 'active'
  where id = v_store_id;

  return v_count;
end;
$$;

-- Validación autoritativa antes de insertar un fiado.
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
  v_portfolio integer;
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

  if v_plan <> 'free' then
    return;
  end if;

  if not v_selection_done then
    raise exception 'Debes seleccionar los clientes de tu cartera Free antes de registrar nuevos fiados';
  end if;

  select current_balance, coalesce(free_plan_selected, false)
  into v_balance, v_selected
  from public.customer_stores
  where customer_id = p_customer_id
    and store_id = p_store_id;

  if not found then
    raise exception 'Cliente no pertenece a la tienda';
  end if;

  v_limit := public.plan_customer_limit('free');

  select count(*) into v_portfolio
  from public.customer_stores
  where store_id = p_store_id
    and current_balance > 0
    and free_plan_selected;

  if v_balance > 0 then
    if not v_selected then
      raise exception 'Este cliente quedó fuera de tu cartera Free. Solo puedes registrarle abonos';
    end if;
  else
    if v_portfolio >= v_limit then
      raise exception 'Ya tienes % clientes con cartera activa en el plan Free. Registra abonos para liberar un cupo antes de dar un nuevo fiado', v_limit;
    end if;

    update public.customer_stores
    set free_plan_selected = true
    where customer_id = p_customer_id
      and store_id = p_store_id;
  end if;
end;
$$;

-- Trigger para proteger también inserciones directas a credits.
create or replace function public.tg_credits_free_portfolio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_can_create_credit(new.customer_id, new.store_id);
  return new;
end;
$$;

drop trigger if exists trg_credits_free_portfolio on public.credits;
create trigger trg_credits_free_portfolio
before insert on public.credits
for each row execute function public.tg_credits_free_portfolio();

-- Al cambiar el plan de la tienda se prepara o se limpia la cartera.
create or replace function public.tg_store_plan_portfolio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subscription_plan = 'free'
     and old.subscription_plan is distinct from 'free' then
    perform public.prepare_free_portfolio(new.id);
  elsif new.subscription_plan <> 'free'
        and old.subscription_plan is distinct from new.subscription_plan then
    update public.customer_stores
    set free_plan_selected = true
    where store_id = new.id;

    update public.stores
    set free_portfolio_selection_done = true
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_store_plan_portfolio on public.stores;
create trigger trg_store_plan_portfolio
after update of subscription_plan on public.stores
for each row execute function public.tg_store_plan_portfolio();

-- Mantener sincronizado el plan de las tiendas cuando el plan se
-- actualiza desde el perfil (panel de administración).
create or replace function public.tg_profile_plan_to_store()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stores
  set
    subscription_plan = new.subscription_plan,
    subscription_start_date = new.subscription_start_date,
    subscription_end_date = new.subscription_end_date,
    subscription_status = new.subscription_status
  where owner_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_profile_plan_to_store on public.profiles;
create trigger trg_profile_plan_to_store
after update of
  subscription_plan,
  subscription_start_date,
  subscription_end_date,
  subscription_status
on public.profiles
for each row execute function public.tg_profile_plan_to_store();

-- Bajar manualmente a Free también debe preparar la cartera.
create or replace function public.downgrade_to_free()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  update public.profiles
  set
    subscription_plan = 'free',
    subscription_start_date = now(),
    subscription_end_date = null,
    subscription_status = 'active'
  where id = v_user_id;

  for v_store_id in
    select id from public.stores where owner_id = v_user_id
  loop
    update public.stores
    set
      subscription_plan = 'free',
      subscription_start_date = now(),
      subscription_end_date = null,
      subscription_status = 'active'
    where id = v_store_id;

    perform public.prepare_free_portfolio(v_store_id);
  end loop;
end;
$$;

-- Crear/vincular clientes ya NO se limita por cantidad.
-- El límite se aplica a la cartera activa, no al total de clientes.
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
    customer_id, store_id, credit_limit, alias, active
  )
  values (
    p_customer_id,
    v_store_id,
    greatest(coalesce(p_credit_limit, 0), 0),
    nullif(trim(p_alias), ''),
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

-- El historial entre tiendas también respeta la expiración automática.
create or replace function public.get_customer_history(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid := public.current_store_id();
  v_owner_id uuid;
  v_plan text;
begin
  if v_store_id is null then
    raise exception 'Usuario sin tienda';
  end if;

  select owner_id into v_owner_id
  from public.stores
  where id = v_store_id;

  perform public.expire_subscription_for_profile(v_owner_id);

  select subscription_plan into v_plan
  from public.stores
  where id = v_store_id;

  if v_plan = 'free' then
    raise exception 'El historial entre tiendas requiere un plan pago';
  end if;

  if not exists (
    select 1 from public.customer_stores
    where customer_id = p_customer_id
  ) then
    raise exception 'Cliente no encontrado';
  end if;

  return jsonb_build_object(
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'store_id', cs.store_id,
        'store_name', s.store_name,
        'phone', s.phone,
        'address', s.address,
        'current_balance', cs.current_balance,
        'last_movement', greatest(
          coalesce((
            select max(c.created_at)
            from public.credits c
            where c.customer_id = cs.customer_id
              and c.store_id = cs.store_id
          ), '-infinity'::timestamptz),
          coalesce((
            select max(p.payment_date)
            from public.payments p
            where p.customer_id = cs.customer_id
              and p.store_id = cs.store_id
          ), '-infinity'::timestamptz)
        )
      ))
      from public.customer_stores cs
      join public.stores s on s.id = cs.store_id
      where cs.customer_id = p_customer_id
    ), '[]'::jsonb),
    'credits', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object('store_name', s.store_name))
      from public.credits c
      join public.stores s on s.id = c.store_id
      where c.customer_id = p_customer_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('store_name', s.store_name))
      from public.payments p
      join public.stores s on s.id = p.store_id
      where p.customer_id = p_customer_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Preparar tiendas Free que ya existan con más cartera de la permitida.
do $do$
declare
  r record;
begin
  for r in
    select id from public.stores where subscription_plan = 'free'
  loop
    perform public.prepare_free_portfolio(r.id);
  end loop;
end;
$do$;

-- La expiración se comprueba cuando la app se conecta a Supabase:
-- al iniciar sesión, sincronizar o intentar registrar un fiado.

-- Permisos de ejecución.
revoke all on function public.grace_period_days() from public;
revoke all on function public.plan_customer_limit(text) from public;
revoke all on function public.prepare_free_portfolio(uuid) from public;
revoke all on function public.expire_subscription_for_profile(uuid) from public;
revoke all on function public.expire_subscriptions() from public;
revoke all on function public.get_free_portfolio_status() from public;
revoke all on function public.set_free_portfolio_selection(uuid[]) from public;
revoke all on function public.assert_can_create_credit(uuid, uuid) from public;
revoke all on function public.downgrade_to_free() from public;

grant execute on function public.expire_subscriptions() to authenticated;
grant execute on function public.get_free_portfolio_status() to authenticated;
grant execute on function public.set_free_portfolio_selection(uuid[]) to authenticated;
grant execute on function public.downgrade_to_free() to authenticated;
grant execute on function public.get_customer_history(uuid) to authenticated;
grant execute on function public.link_customer_to_store(uuid, numeric, text) to authenticated;
