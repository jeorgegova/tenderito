-- ============================================================
-- TENDERITO · Fase 8 — Triggers y Diagnóstico de Notificaciones Push
-- ============================================================
-- Ejecutar en Supabase (Editor SQL).
-- ============================================================

-- ------------------------------------------------------------
-- 1. CONSULTA DE DIAGNÓSTICO
-- Úsala para saber si el cliente al que le hiciste el abono
-- tiene un usuario en el portal y un celular vinculado con token activo.
-- ------------------------------------------------------------
-- Reemplaza '12345678' por el número de documento del cliente:
/*
select 
  c.id as customer_id,
  c.name as customer_name,
  c.document_number,
  ca.user_id as portal_user_id,
  ca.activated_at as fecha_activacion_portal,
  dv.device_id,
  dv.device_name,
  dv.platform,
  dv.is_active,
  dv.updated_at as ultimo_registro_fcm,
  left(dv.fcm_token, 25) || '...' as token_resumen
from public.customers c
left join public.customer_accounts ca on ca.customer_id = c.id
left join public.dispositivos_vinculados dv on dv.user_id = ca.user_id
where c.document_number = '12345678';
*/

-- ------------------------------------------------------------
-- 2. AUTOMATIZACIÓN VÍA TRIGGER SQL (Opción con pg_net)
-- Si no usas los Webhooks visuales del Dashboard de Supabase,
-- puedes activar este trigger para invocar la Edge Function directamente.
-- ------------------------------------------------------------

-- Habilitar la extensión de peticiones HTTP asíncronas de Supabase
create extension if not exists pg_net with schema extensions;

-- Función trigger que envía el evento a la Edge Function
create or replace function public.trg_notificar_evento_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_service_key text;
  v_payload jsonb;
  v_table text := tg_table_name;
begin
  -- Obtener la URL y Secret desde la configuración de Postgres (o definir por defecto)
  -- NOTA: Si prefieres fijar la URL directamente, reemplaza la línea siguiente:
  v_project_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Si no están en settings de postgres, se puede invocar con la URL estándar de la función
  if v_project_url is null or v_project_url = '' then
    -- Puedes escribir aquí tu URL fija si lo deseas:
    -- v_project_url := 'https://xyzcompany.supabase.co';
    return new;
  end if;

  v_payload := jsonb_build_object(
    'type', tg_op,
    'table', v_table,
    'record', to_jsonb(new)
  );

  -- Invoca de forma asíncrona (no bloquea la transacción de la app)
  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := v_payload
  );

  return new;
exception
  when others then
    -- Para que nunca falle la inserción del abono/crédito si hay un problema de red
    raise warning '[trg_notificar_evento_cliente] Error llamando push: %', sqlerrm;
    return new;
end;
$$;

-- Triggers en la tabla de pagos y créditos (se disparan tras insertar)
drop trigger if exists trg_push_on_payment on public.payments;
create trigger trg_push_on_payment
  after insert on public.payments
  for each row
  execute function public.trg_notificar_evento_cliente();

drop trigger if exists trg_push_on_credit on public.credits;
create trigger trg_push_on_credit
  after insert on public.credits
  for each row
  execute function public.trg_notificar_evento_cliente();
