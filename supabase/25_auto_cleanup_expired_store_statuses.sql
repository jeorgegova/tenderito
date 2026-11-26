-- ==============================================================================
-- TENDERITO · Fase 25 — Limpieza Automática de Estados y Medios Caducados
-- ==============================================================================
-- Garantiza que cuando un estado publicitario llega a su fecha de caducidad
-- (expires_at < now()), o cuando es eliminado manualmente, sus archivos
-- multimedia en storage.objects (bucket 'store-statuses') se eliminen
-- automáticamente de forma idéntica a cuando se presiona el botón de eliminar.
-- ==============================================================================

-- 1. Trigger para asegurar que al eliminar cualquier registro de store_statuses,
-- su archivo de imagen en storage.objects se elimine automáticamente.
create or replace function public.trg_eliminar_media_store_status()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.media_path is not null and length(trim(old.media_path)) > 0 then
    delete from storage.objects
    where bucket_id = 'store-statuses'
      and name = old.media_path;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_media_on_status_delete on public.store_statuses;
create trigger trg_cleanup_media_on_status_delete
  after delete on public.store_statuses
  for each row
  execute function public.trg_eliminar_media_store_status();

-- 2. Función RPC para purgar todos los estados caducados (expires_at < now())
-- Al ejecutarse, borra los registros de store_statuses, disparando el trigger
-- anterior para eliminar las imágenes de storage.objects y cascada de store_status_views.
create or replace function public.purgar_estados_caducados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.store_statuses
  where expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.purgar_estados_caducados() to authenticated, service_role, anon;

-- 3. Programación automática con pg_cron si está disponible en Supabase
do $$
begin
  if exists (
    select 1 from pg_available_extensions where name = 'pg_cron'
  ) then
    create extension if not exists pg_cron;
    
    -- Eliminar job previo si existía para evitar duplicidad
    if exists (select 1 from cron.job where jobname = 'purgar-estados-caducados-cron') then
      perform cron.unschedule('purgar-estados-caducados-cron');
    end if;

    -- Ejecutar cada 15 minutos
    perform cron.schedule(
      'purgar-estados-caducados-cron',
      '*/15 * * * *',
      'select public.purgar_estados_caducados();'
    );
  end if;
exception
  when others then
    -- En entornos donde pg_cron requiera configuración adicional o permisos de superuser
    raise notice 'pg_cron no pudo ser programado automáticamente: %', sqlerrm;
end $$;
