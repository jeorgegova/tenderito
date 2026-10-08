-- ============================================================
-- TENDERITO · Fase 3/4 — automatización y operaciones atómicas
-- ============================================================

-- Crea el perfil aunque la confirmación de correo esté activa.
-- Los datos se reciben desde auth.signUp({ options: { data: ... } }).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select store_id from public.store_memberships
  where user_id = auth.uid() order by created_at limit 1
$$;

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

create trigger trg_create_store_for_profile
after insert on public.profiles
for each row execute function public.create_store_for_profile();

create or replace function public.recalc_store_customer_balance(
  p_customer_id uuid, p_store_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.customer_stores cs
  set current_balance = greatest(0,
    coalesce((select sum(amount) from public.credits
      where customer_id = p_customer_id and store_id = p_store_id), 0)
    - coalesce((select sum(amount) from public.payments
      where customer_id = p_customer_id and store_id = p_store_id), 0)
  )
  where cs.customer_id = p_customer_id and cs.store_id = p_store_id;
end;
$$;

create or replace function public.tg_recalc_store_balance()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_store_customer_balance(old.customer_id, old.store_id);
    return old;
  end if;
  perform public.recalc_store_customer_balance(new.customer_id, new.store_id);
  if tg_op = 'UPDATE' and (old.customer_id is distinct from new.customer_id
    or old.store_id is distinct from new.store_id) then
    perform public.recalc_store_customer_balance(old.customer_id, old.store_id);
  end if;
  return new;
end;
$$;

create trigger trg_credits_recalc after insert or update or delete on public.credits
for each row execute function public.tg_recalc_store_balance();
create trigger trg_payments_recalc after insert or update or delete on public.payments
for each row execute function public.tg_recalc_store_balance();

create or replace function public.tg_sync_credit_status()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_credit_id uuid; v_paid numeric;
begin
  if tg_op = 'DELETE' then v_credit_id := old.credit_id;
  else v_credit_id := new.credit_id;
  end if;
  if v_credit_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select coalesce(sum(amount), 0) into v_paid
  from public.payments where credit_id = v_credit_id;
  update public.credits c set status = case
    when v_paid >= c.amount then 'paid'
    when v_paid > 0 then 'partially_paid'
    else 'pending' end
  where c.id = v_credit_id;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger trg_sync_credit_status
after insert or update or delete on public.payments
for each row execute function public.tg_sync_credit_status();

create or replace function public.create_customer(
  p_name text, p_document_type text, p_document_number text,
  p_phone text default null, p_notes text default null
)
returns public.customers language plpgsql security definer set search_path = public
as $$
declare v_customer public.customers; v_store_id uuid := public.current_store_id();
begin
  if v_store_id is null then raise exception 'Usuario sin tienda'; end if;
  select * into v_customer from public.customers
  where upper(trim(document_type)) = upper(trim(p_document_type))
    and regexp_replace(upper(trim(document_number)), '[^0-9A-Z]', '', 'g') =
        regexp_replace(upper(trim(p_document_number)), '[^0-9A-Z]', '', 'g');
  if v_customer.id is null then
    insert into public.customers(name, document_type, document_number, phone, notes)
    values (trim(p_name), upper(trim(p_document_type)), trim(p_document_number),
      nullif(trim(p_phone), ''), p_notes) returning * into v_customer;
  end if;
  insert into public.customer_stores(customer_id, store_id)
  values (v_customer.id, v_store_id)
  on conflict (customer_id, store_id) do update set active = true;
  return v_customer;
end;
$$;

create or replace function public.create_credit(
  p_customer_id uuid, p_concept text, p_amount numeric, p_due_date date default null
)
returns public.credits language plpgsql security definer set search_path = public
as $$
declare v_credit public.credits; v_store_id uuid := public.current_store_id();
begin
  if not exists (select 1 from public.customer_stores
    where customer_id = p_customer_id and store_id = v_store_id and active) then
    raise exception 'Cliente no pertenece a la tienda';
  end if;
  insert into public.credits(store_id, customer_id, created_by, concept, amount, due_date)
  values (v_store_id, p_customer_id, auth.uid(), trim(p_concept), p_amount, p_due_date)
  returning * into v_credit;
  return v_credit;
end;
$$;

create or replace function public.create_payment(
  p_customer_id uuid, p_amount numeric, p_credit_id uuid default null,
  p_notes text default null
)
returns public.payments language plpgsql security definer set search_path = public
as $$
declare v_payment public.payments; v_store_id uuid := public.current_store_id();
begin
  if not exists (select 1 from public.customer_stores
    where customer_id = p_customer_id and store_id = v_store_id and active) then
    raise exception 'Cliente no pertenece a la tienda';
  end if;
  if p_credit_id is not null and not exists (select 1 from public.credits
    where id = p_credit_id and customer_id = p_customer_id and store_id = v_store_id
      and status <> 'paid') then
    raise exception 'El fiado no pertenece al cliente o ya está pagado';
  end if;
  insert into public.payments(store_id, customer_id, credit_id, created_by, amount, notes)
  values (v_store_id, p_customer_id, p_credit_id, auth.uid(), p_amount, p_notes)
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function public.create_customer(text, text, text, text, text) from public;
revoke all on function public.create_credit(uuid, text, numeric, date) from public;
revoke all on function public.create_payment(uuid, numeric, uuid, text) from public;
grant execute on function public.create_customer(text, text, text, text, text) to authenticated;
grant execute on function public.create_credit(uuid, text, numeric, date) to authenticated;
grant execute on function public.create_payment(uuid, numeric, uuid, text) to authenticated;
