-- ==============================================================================
-- 12_idempotent_sync_rpcs.sql
-- Idempotencia para creación de créditos y abonos en sincronización offline-first.
-- Permite recibir p_id opcional (el UUID generado localmente por SQLite).
-- Si el registro con ese ID ya existe, se devuelve el registro existente sin duplicar.
-- ==============================================================================

-- 1. Actualizar create_credit con p_id opcional
drop function if exists public.create_credit(uuid, text, numeric, date);
drop function if exists public.create_credit(uuid, text, numeric, date, uuid);

create or replace function public.create_credit(
  p_customer_id uuid,
  p_concept text,
  p_amount numeric,
  p_due_date date default null,
  p_id uuid default null
)
returns public.credits language plpgsql security definer set search_path = public
as $$
declare
  v_credit public.credits;
  v_store_id uuid := public.current_store_id();
begin
  -- Idempotencia: Si ya existe un crédito con este ID, retornarlo inmediatamente
  if p_id is not null then
    select * into v_credit from public.credits where id = p_id;
    if found then
      return v_credit;
    end if;
  end if;

  if not exists (
    select 1 from public.customer_stores
    where customer_id = p_customer_id and store_id = v_store_id and active
  ) then
    raise exception 'Cliente no pertenece a la tienda';
  end if;

  insert into public.credits(
    id, store_id, customer_id, created_by, concept, amount, due_date
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    v_store_id,
    p_customer_id,
    auth.uid(),
    trim(p_concept),
    p_amount,
    p_due_date
  )
  returning * into v_credit;

  return v_credit;
end;
$$;

revoke all on function public.create_credit(uuid, text, numeric, date, uuid) from public;
grant execute on function public.create_credit(uuid, text, numeric, date, uuid) to authenticated;


-- 2. Actualizar create_payment con p_id opcional
drop function if exists public.create_payment(uuid, numeric, uuid, text);
drop function if exists public.create_payment(uuid, numeric, uuid, text, uuid);

create or replace function public.create_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_credit_id uuid default null,
  p_notes text default null,
  p_id uuid default null
)
returns public.payments language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.payments;
  v_store_id uuid := public.current_store_id();
begin
  -- Idempotencia: Si ya existe un pago con este ID, retornarlo inmediatamente
  if p_id is not null then
    select * into v_payment from public.payments where id = p_id;
    if found then
      return v_payment;
    end if;
  end if;

  if not exists (
    select 1 from public.customer_stores
    where customer_id = p_customer_id and store_id = v_store_id and active
  ) then
    raise exception 'Cliente no pertenece a la tienda';
  end if;

  if p_credit_id is not null and not exists (
    select 1 from public.credits
    where id = p_credit_id and customer_id = p_customer_id and store_id = v_store_id
      and status <> 'paid'
  ) then
    raise exception 'El fiado no pertenece al cliente o ya está pagado';
  end if;

  insert into public.payments(
    id, store_id, customer_id, credit_id, created_by, amount, notes
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    v_store_id,
    p_customer_id,
    p_credit_id,
    auth.uid(),
    p_amount,
    p_notes
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.create_payment(uuid, numeric, uuid, text, uuid) from public;
grant execute on function public.create_payment(uuid, numeric, uuid, text, uuid) to authenticated;

