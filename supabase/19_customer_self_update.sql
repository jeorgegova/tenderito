-- ============================================================================
-- Migración 19: Permitir actualización de perfil propio por el cliente (nombre y teléfono)
-- ============================================================================

-- 1. Política RLS para que el cliente pueda actualizar su propio registro
drop policy if exists customers_self_update on public.customers;
create policy customers_self_update on public.customers
  for update using (
    customers.user_id = auth.uid()
  ) with check (
    customers.user_id = auth.uid()
  );

-- 2. Función segura RPC para actualizar nombre y teléfono del cliente autenticado
create or replace function public.update_customer_self(
  p_name text,
  p_phone text
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;

  update public.customers
  set name = trim(p_name),
      phone = nullif(trim(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g')), '')
  where user_id = v_uid
  returning * into v_customer;

  if v_customer.id is null then
    raise exception 'Cliente no encontrado para el usuario actual';
  end if;

  return v_customer;
end;
$$;

revoke all on function public.update_customer_self(text, text) from public;
grant execute on function public.update_customer_self(text, text) to authenticated;
