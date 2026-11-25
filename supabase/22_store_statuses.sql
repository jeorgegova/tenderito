-- ============================================================
-- TENDERITO · Fase 22 — Estados y Publicidad de Tiendas (Estilo WhatsApp)
-- ============================================================
-- Permite a las tiendas con suscripción de pago activa publicar
-- hasta 3 estados publicitarios con vigencia (starts_at / expires_at),
-- imagen + caption de máx. 120 caracteres, y seguimiento de vistas por cliente.
-- ============================================================

-- 1. Tabla de Estados de Tienda
create table if not exists public.store_statuses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  media_url text,
  media_path text,
  bg_color text default '#FF6B00',
  caption text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint store_statuses_caption_chk check (char_length(trim(caption)) between 1 and 120),
  constraint store_statuses_dates_chk check (expires_at > starts_at)
);

comment on table public.store_statuses is 'Estados publicitarios publicados por las tiendas, con vigencia temporal y máximo 3 simultáneos.';
comment on column public.store_statuses.caption is 'Descripción corta del estado (máx 120 caracteres), enviada también en la notificación push.';
comment on column public.store_statuses.starts_at is 'Momento a partir del cual el estado se hace visible para los clientes.';
comment on column public.store_statuses.expires_at is 'Momento en que el estado expira y deja de ser visible.';

-- Índices
create index if not exists idx_store_statuses_store_dates
  on public.store_statuses(store_id, starts_at, expires_at desc);

create index if not exists idx_store_statuses_expires
  on public.store_statuses(expires_at);

-- 2. Tabla de Visualizaciones de Estados
create table if not exists public.store_status_views (
  status_id uuid not null references public.store_statuses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, customer_id)
);

comment on table public.store_status_views is 'Registro de visualizaciones de cada estado por parte de los clientes para colorear anillo (gris/naranja) y métricas del tendero.';

create index if not exists idx_store_status_views_customer
  on public.store_status_views(customer_id);

create index if not exists idx_store_status_views_status
  on public.store_status_views(status_id, viewed_at desc);

-- 3. Row Level Security (RLS)
alter table public.store_statuses enable row level security;
alter table public.store_status_views enable row level security;

-- Políticas para store_statuses
drop policy if exists store_statuses_select on public.store_statuses;
create policy store_statuses_select on public.store_statuses
  for select using (
    -- Tendero (dueño o miembro) de la tienda puede ver todos los estados de su tienda
    exists (
      select 1 from public.stores s
      left join public.store_memberships sm on sm.store_id = s.id
      where s.id = public.store_statuses.store_id
        and (s.owner_id = auth.uid() or sm.user_id = auth.uid())
    )
    or
    -- Cliente vinculado a la tienda solo ve estados vigentes
    (
      starts_at <= now()
      and expires_at >= now()
      and exists (
        select 1 from public.customer_stores cs
        join public.customers c on c.id = cs.customer_id
        where cs.store_id = public.store_statuses.store_id
          and cs.active = true
          and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists store_statuses_insert on public.store_statuses;
create policy store_statuses_insert on public.store_statuses
  for insert with check (
    -- Dueño o miembros de la tienda
    exists (
      select 1 from public.stores s
      left join public.store_memberships sm on sm.store_id = s.id
      where s.id = public.store_statuses.store_id
        and (s.owner_id = auth.uid() or sm.user_id = auth.uid())
    )
  );

drop policy if exists store_statuses_delete on public.store_statuses;
create policy store_statuses_delete on public.store_statuses
  for delete using (
    -- Dueño o miembros de la tienda
    exists (
      select 1 from public.stores s
      left join public.store_memberships sm on sm.store_id = s.id
      where s.id = public.store_statuses.store_id
        and (s.owner_id = auth.uid() or sm.user_id = auth.uid())
    )
  );

-- Políticas para store_status_views
drop policy if exists store_status_views_select on public.store_status_views;
create policy store_status_views_select on public.store_status_views
  for select using (
    -- El cliente ve sus propias visualizaciones
    exists (
      select 1 from public.customers c
      where c.id = public.store_status_views.customer_id
        and c.user_id = auth.uid()
    )
    or
    -- El tendero (dueño o miembro) ve quién ha visto los estados de sus tiendas
    exists (
      select 1 from public.store_statuses ss
      join public.stores s on s.id = ss.store_id
      left join public.store_memberships sm on sm.store_id = ss.store_id
      where ss.id = public.store_status_views.status_id
        and (s.owner_id = auth.uid() or sm.user_id = auth.uid())
    )
  );

drop policy if exists store_status_views_insert on public.store_status_views;
create policy store_status_views_insert on public.store_status_views
  for insert with check (
    -- El cliente solo puede registrar vistas para su propio customer_id
    exists (
      select 1 from public.customers c
      where c.id = public.store_status_views.customer_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists store_status_views_update on public.store_status_views;
create policy store_status_views_update on public.store_status_views
  for update using (
    exists (
      select 1 from public.customers c
      where c.id = public.store_status_views.customer_id
        and c.user_id = auth.uid()
    )
  );

-- 4. Validación en inserción de estados (Límite 3 activos y Plan Pago)
create or replace function public.trg_validar_creacion_store_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_end_date timestamptz;
  v_active_count integer;
begin
  -- Obtener información de suscripción de la tienda o perfil propietario
  select
    lower(coalesce(s.subscription_plan, p.subscription_plan, 'free')),
    lower(coalesce(p.subscription_status, 'active')),
    p.subscription_end_date
  into v_plan, v_status, v_end_date
  from public.stores s
  left join public.profiles p on p.id = s.owner_id
  where s.id = new.store_id;

  -- 1. Validar que la tienda tenga suscripción de pago activa
  if v_plan is null or v_plan = 'free' or v_status = 'cancelled' then
    raise exception 'Solo las tiendas con una suscripción de pago activa pueden publicar estados publicitarios.'
      using errcode = 'P0001';
  end if;

  -- Si tiene fecha de fin y ya venció
  if v_end_date is not null and v_end_date < now() then
    raise exception 'La suscripción de la tienda ha vencido. Renuévala para continuar publicando estados.'
      using errcode = 'P0002';
  end if;

  -- 2. Validar límite máximo de 3 estados vigentes simultáneos
  select count(*)
  into v_active_count
  from public.store_statuses
  where store_id = new.store_id
    and expires_at >= now();

  if v_active_count >= 3 then
    raise exception 'La tienda ya cuenta con el máximo permitido de 3 estados activos simultáneos.'
      using errcode = 'P0003';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_store_status on public.store_statuses;
create trigger trg_check_store_status
  before insert on public.store_statuses
  for each row
  execute function public.trg_validar_creacion_store_status();

-- 5. Función RPC para obtener tokens de todos los clientes vinculados a una tienda
create or replace function public.obtener_tokens_clientes_tienda(p_store_id uuid)
returns table (fcm_token text, platform text, device_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select distinct dv.fcm_token, dv.platform, dv.device_name
  from public.dispositivos_vinculados dv
  join public.customers c on c.user_id = dv.user_id
  join public.customer_stores cs on cs.customer_id = c.id
  where cs.store_id = p_store_id
    and cs.active = true
    and dv.is_active = true
    and length(trim(dv.fcm_token)) > 10;
end;
$$;

grant execute on function public.obtener_tokens_clientes_tienda(uuid) to authenticated, service_role;

-- 6. RPC para consultar detalles de visualizaciones de un estado (para el tendero: "Visto por...")
create or replace function public.obtener_vistas_estado(p_status_id uuid)
returns table (
  customer_id uuid,
  customer_name text,
  customer_alias text,
  customer_phone text,
  viewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo el dueño de la tienda o miembros autorizados pueden ver quién lo vio
  if not exists (
    select 1
    from public.store_statuses ss
    join public.stores s on s.id = ss.store_id
    left join public.store_memberships sm on sm.store_id = ss.store_id
    where ss.id = p_status_id
      and (s.owner_id = auth.uid() or sm.user_id = auth.uid())
  ) then
    raise exception 'No tienes permisos para ver las estadísticas de este estado.' using errcode = '42501';
  end if;

  return query
  select
    c.id as customer_id,
    c.name as customer_name,
    cs.alias as customer_alias,
    c.phone as customer_phone,
    ssv.viewed_at
  from public.store_status_views ssv
  join public.customers c on c.id = ssv.customer_id
  left join public.store_statuses ss on ss.id = ssv.status_id
  left join public.customer_stores cs on cs.customer_id = c.id and cs.store_id = ss.store_id
  where ssv.status_id = p_status_id
  order by ssv.viewed_at desc;
end;
$$;

grant execute on function public.obtener_vistas_estado(uuid) to authenticated, service_role;

-- 6.1 RPC para registrar visualización de estado por parte de un cliente (bypasses RLS issues)
create or replace function public.registrar_vista_estado(
  p_status_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.store_status_views (status_id, customer_id, viewed_at)
  values (p_status_id, p_customer_id, now())
  on conflict (status_id, customer_id)
  do update set viewed_at = excluded.viewed_at;
end;
$$;

grant execute on function public.registrar_vista_estado(uuid, uuid) to authenticated, anon;

-- 7. Trigger para disparo automático de notificación (opcional si existe la función)
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trg_notificar_evento_cliente'
  ) then
    execute 'drop trigger if exists trg_push_on_store_status on public.store_statuses';
    execute 'create trigger trg_push_on_store_status
      after insert on public.store_statuses
      for each row
      execute function public.trg_notificar_evento_cliente()';
  end if;
end $$;

-- 8. Configuración del Bucket de Storage 'store-statuses'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-statuses',
  'store-statuses',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Políticas de Storage para 'store-statuses'
drop policy if exists "store_statuses_storage_public_select" on storage.objects;
create policy "store_statuses_storage_public_select" on storage.objects
  for select using (bucket_id = 'store-statuses');

drop policy if exists "store_statuses_storage_auth_insert" on storage.objects;
create policy "store_statuses_storage_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'store-statuses'
    and auth.role() = 'authenticated'
  );

drop policy if exists "store_statuses_storage_auth_delete" on storage.objects;
create policy "store_statuses_storage_auth_delete" on storage.objects
  for delete using (
    bucket_id = 'store-statuses'
    and auth.role() = 'authenticated'
  );
