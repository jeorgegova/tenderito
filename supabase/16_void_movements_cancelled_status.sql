-- ============================================================
-- 16_void_movements_cancelled_status.sql
-- Tenderito: Soporte para anulación/cancelación de movimientos con trazabilidad.
-- Permite marcar créditos y abonos como 'cancelled' sin eliminarlos,
-- y actualiza el trigger de recálculo de saldo para excluirlos.
-- ============================================================

-- 1. Ampliar el check constraint en credits para admitir 'cancelled'
alter table public.credits drop constraint if exists credits_status_check;
alter table public.credits add constraint credits_status_check
  check (status in ('pending', 'partially_paid', 'paid', 'cancelled'));

-- 2. Agregar columna status a payments si no existe
alter table public.payments add column if not exists status text not null default 'completed'
  check (status in ('completed', 'cancelled'));

-- 3. Actualizar función de recálculo de saldo por tienda y cliente
-- para ignorar movimientos con status = 'cancelled'
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

-- 4. Garantizar que el trigger se active en insert, update o delete de credits y payments
drop trigger if exists trg_credits_recalc on public.credits;
create trigger trg_credits_recalc
  after insert or update or delete on public.credits
  for each row execute function public.tg_recalc_store_balance();

drop trigger if exists trg_payments_recalc on public.payments;
create trigger trg_payments_recalc
  after insert or update or delete on public.payments
  for each row execute function public.tg_recalc_store_balance();
