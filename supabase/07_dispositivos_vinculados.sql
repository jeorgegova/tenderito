-- ============================================================
-- TENDERITO · Fase 7 — Dispositivos Vinculados y Notificaciones Push
-- ============================================================
-- Permite registrar múltiples dispositivos (celulares) por usuario
-- vinculando su UID de dispositivo y Token FCM de Firebase.
-- Ejecutar en Supabase (Editor SQL).
-- ============================================================

-- 1. Tabla de Dispositivos Vinculados
create table if not exists public.dispositivos_vinculados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  fcm_token text not null,
  platform text not null default 'android'
    check (platform in ('android', 'ios', 'web')),
  device_name text,
  app_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_dispositivos_usuario_dispositivo unique (user_id, device_id)
);

-- Comentarios explicativos
comment on table public.dispositivos_vinculados is 'Registro de celulares y tokens FCM de Firebase por usuario (tendero o cliente) para notificaciones push.';
comment on column public.dispositivos_vinculados.device_id is 'Identificador único persistente generado por la app para ese celular.';
comment on column public.dispositivos_vinculados.fcm_token is 'Token de Firebase Cloud Messaging para enviar push al celular.';

-- 2. Índices para consultas rápidas
create index if not exists idx_dispositivos_vinculados_user
  on public.dispositivos_vinculados(user_id);

create index if not exists idx_dispositivos_vinculados_fcm_token
  on public.dispositivos_vinculados(fcm_token);

create index if not exists idx_dispositivos_vinculados_device
  on public.dispositivos_vinculados(device_id);

-- 3. Row Level Security (RLS)
alter table public.dispositivos_vinculados enable row level security;

-- Política de lectura: Cada usuario solo ve sus propios dispositivos
drop policy if exists dispositivos_vinculados_select on public.dispositivos_vinculados;
create policy dispositivos_vinculados_select on public.dispositivos_vinculados
  for select using (auth.uid() = user_id);

-- Política de inserción: Cada usuario solo puede registrar dispositivos para sí mismo
drop policy if exists dispositivos_vinculados_insert on public.dispositivos_vinculados;
create policy dispositivos_vinculados_insert on public.dispositivos_vinculados
  for insert with check (auth.uid() = user_id);

-- Política de actualización: Solo puede modificar sus propios dispositivos
drop policy if exists dispositivos_vinculados_update on public.dispositivos_vinculados;
create policy dispositivos_vinculados_update on public.dispositivos_vinculados
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Política de eliminación: Solo puede eliminar sus propios dispositivos
drop policy if exists dispositivos_vinculados_delete on public.dispositivos_vinculados;
create policy dispositivos_vinculados_delete on public.dispositivos_vinculados
  for delete using (auth.uid() = user_id);

-- 4. Función RPC para Registrar o Actualizar un Token FCM de un Dispositivo
create or replace function public.registrar_dispositivo(
  p_device_id text,
  p_fcm_token text,
  p_platform text default 'android',
  p_device_name text default null,
  p_app_version text default null
)
returns public.dispositivos_vinculados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registro public.dispositivos_vinculados;
begin
  if v_user_id is null then
    raise exception 'No autenticado: Inicie sesión para vincular su dispositivo';
  end if;

  if p_device_id is null or trim(p_device_id) = '' then
    raise exception 'El identificador del dispositivo (device_id) es obligatorio';
  end if;

  if p_fcm_token is null or trim(p_fcm_token) = '' then
    raise exception 'El token de Firebase (fcm_token) es obligatorio';
  end if;

  -- Si este fcm_token existía antes vinculado a otro usuario o dispositivo antiguo
  -- (por ejemplo, cambio de cuenta en el mismo celular), se limpia para evitar notificaciones cruzadas
  delete from public.dispositivos_vinculados
  where fcm_token = trim(p_fcm_token)
    and (user_id <> v_user_id or device_id <> trim(p_device_id));

  -- Insertar o actualizar el dispositivo para el usuario actual
  insert into public.dispositivos_vinculados (
    user_id,
    device_id,
    fcm_token,
    platform,
    device_name,
    app_version,
    is_active,
    updated_at
  )
  values (
    v_user_id,
    trim(p_device_id),
    trim(p_fcm_token),
    coalesce(nullif(trim(p_platform), ''), 'android'),
    nullif(trim(p_device_name), ''),
    nullif(trim(p_app_version), ''),
    true,
    now()
  )
  on conflict (user_id, device_id) do update set
    fcm_token = excluded.fcm_token,
    platform = excluded.platform,
    device_name = coalesce(excluded.device_name, public.dispositivos_vinculados.device_name),
    app_version = coalesce(excluded.app_version, public.dispositivos_vinculados.app_version),
    is_active = true,
    updated_at = now()
  returning * into v_registro;

  return v_registro;
end;
$$;

-- 5. Función RPC para Desvincular un Dispositivo al Cerrar Sesión
create or replace function public.desvincular_dispositivo(
  p_device_id text default null,
  p_fcm_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  -- Si se pasa device_id o fcm_token, se elimina el dispositivo específico
  if p_device_id is not null and trim(p_device_id) <> '' then
    delete from public.dispositivos_vinculados
    where user_id = v_user_id and device_id = trim(p_device_id);
    return true;
  elsif p_fcm_token is not null and trim(p_fcm_token) <> '' then
    delete from public.dispositivos_vinculados
    where user_id = v_user_id and fcm_token = trim(p_fcm_token);
    return true;
  else
    -- Si no se especifica, desvincula todos los dispositivos de esa sesión
    delete from public.dispositivos_vinculados
    where user_id = v_user_id;
    return true;
  end if;
end;
$$;

-- 6. Función de utilidad para obtener los tokens de un cliente o de una tienda
-- Utilizada por Triggers, Edge Functions o backend para enviar notificaciones de nuevo fiado / abono
create or replace function public.obtener_tokens_cliente(p_customer_id uuid)
returns table (fcm_token text, platform text, device_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select dv.fcm_token, dv.platform, dv.device_name
  from public.dispositivos_vinculados dv
  join public.customer_accounts ca on ca.user_id = dv.user_id
  where ca.customer_id = p_customer_id
    and dv.is_active = true;
end;
$$;

create or replace function public.obtener_tokens_tienda(p_store_id uuid)
returns table (fcm_token text, platform text, device_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select dv.fcm_token, dv.platform, dv.device_name
  from public.dispositivos_vinculados dv
  join public.store_memberships sm on sm.user_id = dv.user_id
  where sm.store_id = p_store_id
    and dv.is_active = true;
end;
$$;

-- Permisos de ejecución
revoke all on function public.registrar_dispositivo(text, text, text, text, text) from public;
grant execute on function public.registrar_dispositivo(text, text, text, text, text) to authenticated;

revoke all on function public.desvincular_dispositivo(text, text) from public;
grant execute on function public.desvincular_dispositivo(text, text) to authenticated;

revoke all on function public.obtener_tokens_cliente(uuid) from public;
grant execute on function public.obtener_tokens_cliente(uuid) to authenticated;

revoke all on function public.obtener_tokens_tienda(uuid) from public;
grant execute on function public.obtener_tokens_tienda(uuid) to authenticated;
