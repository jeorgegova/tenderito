-- ==============================================================================
-- 15_find_customer_activation_status.sql
-- Retorna el estado de activación (is_activated) al consultar un cliente por documento
-- para informar inmediatamente al usuario si su cuenta ya existe.
-- ==============================================================================

drop function if exists public.find_customer_for_activation(text);

create or replace function public.find_customer_for_activation(p_document_number text)
returns table (
  customer_id uuid,
  name_masked text,
  phone_masked text,
  is_activated boolean
)
language sql security definer set search_path = public
as $$
  select c.id,
    left(c.name, 3) || '***' as name_masked,
    case when c.phone is null then 'Sin teléfono'
      else left(regexp_replace(c.phone, '[^0-9]', '', 'g'), 5) || '****' end as phone_masked,
    (c.user_id is not null) as is_activated
  from public.customers c
  where regexp_replace(upper(c.document_number), '[^0-9A-Z]', '', 'g') =
    regexp_replace(upper(trim(p_document_number)), '[^0-9A-Z]', '', 'g')
  limit 1;
$$;

revoke all on function public.find_customer_for_activation(text) from public;
grant execute on function public.find_customer_for_activation(text) to anon, authenticated;
