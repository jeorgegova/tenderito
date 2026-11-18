-- ==============================================================================
-- 13_reset_customer_password.sql
-- Restablecimiento seguro de contraseña para clientes del portal Tenderito.
-- Permite al cliente autenticado por Documento + Celular registrado
-- actualizar su contraseña en auth.users sin depender de correos externos.
-- ==============================================================================

create or replace function public.reset_customer_password(
  p_document_number text,
  p_phone text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_customer public.customers;
  v_clean_doc text;
  v_clean_phone text;
  v_cust_phone text;
begin
  -- 1. Normalizar documento y teléfono
  v_clean_doc := regexp_replace(upper(trim(coalesce(p_document_number, ''))), '[^0-9A-Z]', '', 'g');
  v_clean_phone := regexp_replace(trim(coalesce(p_phone, '')), '[^0-9]', '', 'g');

  if length(v_clean_doc) = 0 then
    return jsonb_build_object('success', false, 'error', 'Ingresa un número de documento válido.');
  end if;

  if length(v_clean_phone) < 7 then
    return jsonb_build_object('success', false, 'error', 'Ingresa un número de celular válido (mínimo 7 dígitos).');
  end if;

  if length(coalesce(p_new_password, '')) < 6 then
    return jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  end if;

  -- 2. Buscar cliente por documento
  select * into v_customer
  from public.customers c
  where regexp_replace(upper(c.document_number), '[^0-9A-Z]', '', 'g') = v_clean_doc
  limit 1;

  if v_customer.id is null then
    return jsonb_build_object('success', false, 'error', 'No encontramos una cuenta con ese número de documento.');
  end if;

  if v_customer.user_id is null then
    return jsonb_build_object('success', false, 'error', 'Esta cuenta aún no ha sido activada por primera vez.');
  end if;

  -- 3. Validar teléfono con el registrado en el cliente
  v_cust_phone := regexp_replace(coalesce(v_customer.phone, ''), '[^0-9]', '', 'g');
  
  if v_cust_phone is null or length(v_cust_phone) = 0 then
    return jsonb_build_object('success', false, 'error', 'Tu cuenta no tiene un celular registrado. Pídele a tu tendero que actualice tu teléfono.');
  end if;

  -- Coincidencia exacta o últimos 7 a 10 dígitos (para diferencias con prefijo de país +57)
  if v_cust_phone <> v_clean_phone
     and right(v_cust_phone, 7) <> right(v_clean_phone, 7)
     and right(v_cust_phone, 10) <> right(v_clean_phone, 10) then
    return jsonb_build_object('success', false, 'error', 'El número de celular no coincide con el registrado en tu cuenta.');
  end if;

  -- 4. Actualizar contraseña cifrada con bcrypt en auth.users
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = v_customer.user_id;

  return jsonb_build_object(
    'success', true,
    'message', '¡Contraseña actualizada con éxito!'
  );
end;
$$;

revoke all on function public.reset_customer_password(text, text, text) from public;
grant execute on function public.reset_customer_password(text, text, text) to anon, authenticated;
