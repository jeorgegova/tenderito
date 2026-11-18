-- ============================================================
-- 17_prevent_negative_balance_on_void.sql
-- Tenderito: Protección contra saldos a favor al anular fiados,
-- restricción de anulación a 24 horas y corrección de notificaciones.
-- ============================================================

-- 1. Función y trigger para créditos:
--    a) Validar que no hayan pasado más de 24 horas desde su creación.
--    b) Validar que los abonos aplicados no superen los fiados activos restantes
--       (evitando saldos a favor).
create or replace function public.tg_validate_credit_cancellation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_remaining_credits numeric;
  v_active_payments numeric;
begin
  if (tg_op = 'UPDATE' and new.status = 'cancelled' and coalesce(old.status, '') != 'cancelled') then
    -- 1. Restricción temporal: solo en las primeras 24 horas
    if (new.created_at < now() - interval '24 hours') then
      raise exception 'No es posible anular este fiado porque ya han transcurrido más de 24 horas desde su registro.';
    end if;

    -- 2. Suma de fiados activos del cliente excluyendo el que se está anulando
    select coalesce(sum(amount), 0) into v_remaining_credits
    from public.credits
    where customer_id = new.customer_id
      and store_id = new.store_id
      and status != 'cancelled'
      and id != new.id;

    -- 3. Suma de abonos activos del cliente
    select coalesce(sum(amount), 0) into v_active_payments
    from public.payments
    where customer_id = new.customer_id
      and store_id = new.store_id
      and status != 'cancelled';

    -- Si los abonos superan los fiados restantes, impedir la anulación
    if (v_active_payments > v_remaining_credits) then
      raise exception 'No es posible anular este fiado porque el cliente tiene abonos registrados ($%) que superan los fiados activos restantes ($%). Primero anula los abonos correspondientes para no generar saldo a favor.',
        v_active_payments, v_remaining_credits;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_credit_cancel on public.credits;
create trigger trg_validate_credit_cancel
  before update on public.credits
  for each row execute function public.tg_validate_credit_cancellation();

-- 2. Función y trigger para abonos (payments):
--    Validar que no hayan pasado más de 24 horas desde su creación.
create or replace function public.tg_validate_payment_cancellation()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'cancelled' and coalesce(old.status, '') != 'cancelled') then
    if (new.created_at < now() - interval '24 hours') then
      raise exception 'No es posible anular este abono porque ya han transcurrido más de 24 horas desde su registro.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_payment_cancel on public.payments;
create trigger trg_validate_payment_cancel
  before update on public.payments
  for each row execute function public.tg_validate_payment_cancellation();

-- 3. Asegurar que el trigger de recálculo de saldo siga activo y consistente
create or replace function public.recalc_store_customer_balance(
  p_customer_id uuid, p_store_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.customer_stores cs
  set current_balance = greatest(0,
    coalesce((select sum(amount) from public.credits
      where customer_id = p_customer_id and store_id = p_store_id and status != 'cancelled'), 0)
    - coalesce((select sum(amount) from public.payments
      where customer_id = p_customer_id and store_id = p_store_id and status != 'cancelled'), 0)
  )
  where cs.customer_id = p_customer_id and cs.store_id = p_store_id;
end;
$$;
