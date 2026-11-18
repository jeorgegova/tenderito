-- ==============================================================================
-- 14_check_user_email_exists.sql
-- Función RPC segura para verificar si un correo electrónico existe en auth.users
-- antes de disparar el flujo de restablecimiento de contraseña.
-- ==============================================================================

create or replace function public.check_user_email_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clean_email text;
  v_exists boolean;
begin
  v_clean_email := lower(trim(coalesce(p_email, '')));
  if length(v_clean_email) = 0 then
    return false;
  end if;

  select exists (
    select 1
    from auth.users
    where lower(trim(email)) = v_clean_email
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

revoke all on function public.check_user_email_exists(text) from public;
grant execute on function public.check_user_email_exists(text) to anon, authenticated;
