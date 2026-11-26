-- ==============================================================================
-- TENDERITO · Superusuario de Soporte (Odoo-Style Admin para Orbit Manager)
-- ==============================================================================
-- Permite que un usuario soporte autenticado (ej. soporte@tenderito.com)
-- administre toda la base de datos vía JWT + RLS y RPCs SECURITY DEFINER,
-- sin necesidad de exponer la Service Role Key en el frontend.
-- ==============================================================================

-- 1. Tabla de administradores de soporte autorizados
create table if not exists public.support_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default 'Soporte Técnico',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.support_admins enable row level security;

-- 2. Tabla de auditoría para acciones de soporte
create table if not exists public.support_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.support_audit_logs enable row level security;

-- 3. Función central para verificar si el usuario actual es Soporte Superadmin
create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    auth.uid() is not null
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'support_superadmin'
      or exists (
        select 1
        from public.support_admins sa
        where sa.user_id = auth.uid()
          and sa.active = true
      )
    );
$$;

revoke all on function public.is_support_admin() from public;
grant execute on function public.is_support_admin() to authenticated;

-- Políticas sobre support_admins y support_audit_logs
drop policy if exists "support_admins_self_or_admin" on public.support_admins;
create policy "support_admins_self_or_admin"
  on public.support_admins
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_support_admin());

drop policy if exists "support_audit_logs_admin_all" on public.support_audit_logs;
create policy "support_audit_logs_admin_all"
  on public.support_audit_logs
  for all
  to authenticated
  using (public.is_support_admin())
  with check (public.is_support_admin());

-- 4. Políticas RLS de Superusuario en todas las tablas de Tenderito
do $$
declare
  tbl text;
  tables text[] := array[
    'profiles',
    'stores',
    'store_memberships',
    'customers',
    'customer_stores',
    'credits',
    'payments',
    'subscription_plans',
    'app_config',
    'dispositivos_vinculados',
    'store_statuses',
    'store_status_views'
  ];
begin
  foreach tbl in array tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      execute format('drop policy if exists "support_superadmin_all" on public.%I;', tbl);
      execute format(
        'create policy "support_superadmin_all" on public.%I for all to authenticated using (public.is_support_admin()) with check (public.is_support_admin());',
        tbl
      );
    end if;
  end loop;
end $$;

-- 5. RPCs de Administración para Orbit Manager (sin requerir service_role)

-- 5.1 Listar usuarios de auth.users
create or replace function public.orbit_list_auth_users(
  p_search text default '',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  email text,
  phone text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_support_admin() then
    raise exception 'No autorizado: se requiere rol support_superadmin';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.phone::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.raw_app_meta_data,
    u.raw_user_meta_data
  from auth.users u
  where (
    coalesce(trim(p_search), '') = ''
    or u.email ilike '%' || trim(p_search) || '%'
    or u.id::text ilike '%' || trim(p_search) || '%'
  )
  order by u.created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

revoke all on function public.orbit_list_auth_users(text, int, int) from public;
grant execute on function public.orbit_list_auth_users(text, int, int) to authenticated;

-- 5.2 Listar todas las tablas públicas con conteo aproximado
create or replace function public.orbit_list_tables()
returns table (
  table_name text,
  estimated_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_support_admin() then
    raise exception 'No autorizado: se requiere rol support_superadmin';
  end if;

  return query
  select
    t.table_name::text,
    coalesce(s.n_live_tup, 0)::bigint as estimated_rows
  from information_schema.tables t
  left join pg_stat_user_tables s
    on s.schemaname = 'public' and s.relname = t.table_name
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
  order by t.table_name;
end;
$$;

revoke all on function public.orbit_list_tables() from public;
grant execute on function public.orbit_list_tables() to authenticated;

-- 5.3 Resumen general para Dashboard de Orbit
create or replace function public.orbit_get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.is_support_admin() then
    raise exception 'No autorizado: se requiere rol support_superadmin';
  end if;

  select jsonb_build_object(
    'total_auth_users', (select count(*) from auth.users),
    'total_stores', (select count(*) from public.stores),
    'total_customers', (select count(*) from public.customers),
    'total_credits', (select count(*) from public.credits),
    'total_payments', (select count(*) from public.payments),
    'total_receivable', coalesce((select sum(current_balance) from public.customer_stores), 0),
    'stores_by_plan', (
      select coalesce(jsonb_object_agg(subscription_plan, cnt), '{}'::jsonb)
      from (
        select subscription_plan, count(*) as cnt
        from public.stores
        group by subscription_plan
      ) s
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.orbit_get_dashboard_stats() from public;
grant execute on function public.orbit_get_dashboard_stats() to authenticated;

-- 6. Crear / Promover usuario de soporte por defecto: soporte@tenderito.com
--    Cambia la contraseña después del primer ingreso si lo deseas.
do $$
declare
  v_email text := 'soporte@tenderito.com';
  v_password text := 'TenderitoSupport2026!';
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = v_email
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"support_superadmin"}'::jsonb,
      '{"full_name":"Soporte Tenderito"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  else
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"support_superadmin"}'::jsonb,
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.support_admins (user_id, email, full_name, active)
  values (v_user_id, v_email, 'Soporte Tenderito', true)
  on conflict (user_id) do update
    set active = true,
        email = excluded.email;
end $$;
