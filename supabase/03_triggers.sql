-- ============================================================
-- ALFIAO · Fase 3/4 — Triggers: current_balance automático
-- La app NUNCA escribe current_balance; se recalcula solo:
--   balance = SUM(credits.amount) − SUM(payments.amount) por cliente.
-- Recálculo (no delta) → sin deriva por redondeos ni fallos parciales.
-- ============================================================

create or replace function public.recalc_customer_balance(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers c
  set current_balance =
    coalesce(
      (select sum(amount) from public.credits where customer_id = p_customer_id),
      0
    )
    -
    coalesce(
      (select sum(amount) from public.payments where customer_id = p_customer_id),
      0
    )
  where c.id = p_customer_id;
end;
$$;

create or replace function public.tg_recalc_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op = 'DELETE' then
    perform public.recalc_customer_balance(old.customer_id);
    return old;
  end if;

  perform public.recalc_customer_balance(new.customer_id);

  -- Si un UPDATE movió la fila a otro cliente, recalcula el anterior también
  if tg_op = 'UPDATE'
    and old.customer_id is distinct from new.customer_id then
    perform public.recalc_customer_balance(old.customer_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_credits_recalc on public.credits;
create trigger trg_credits_recalc
  after insert or update or delete on public.credits
  for each row execute function public.tg_recalc_balance();

drop trigger if exists trg_payments_recalc on public.payments;
create trigger trg_payments_recalc
  after insert or update or delete on public.payments
  for each row execute function public.tg_recalc_balance();
