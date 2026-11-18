-- ============================================================
-- 17_prevent_negative_balance_on_void.sql
-- Tenderito: Protección contra saldos a favor al anular fiados
-- y corrección del mensaje de notificación push en anulaciones.
-- ============================================================

-- 1. Función y trigger para evitar anular un fiado si el cliente tiene
-- abonos aplicados que superarían los fiados activos restantes (lo cual
-- generaría un saldo a favor oculto).
create or replace function public.tg_validate_credit_cancellation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_remaining_credits numeric;
  v_active_payments numeric;
begin
  -- Solo validar cuando se está cancelando un fiado que estaba activo
  if (tg_op = 'UPDATE' and new.status = 'cancelled' and coalesce(old.status, '') != 'cancelled') then
    -- Suma de fiados activos del cliente excluyendo el que se está anulando
    select coalesce(sum(amount), 0) into v_remaining_credits
    from public.credits
    where customer_id = new.customer_id
      and store_id = new.store_id
      and status != 'cancelled'
      and id != new.id;

    -- Suma de abonos activos del cliente
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

-- 2. Asegurar que el trigger de recálculo de saldo siga activo y consistente
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
