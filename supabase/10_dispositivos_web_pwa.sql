-- ============================================================
-- TENDERITO · Fase 10 — Compatibilidad con Plataforma WEB_PWA
-- ============================================================
-- Actualiza la restricción check de la tabla dispositivos_vinculados
-- para permitir explícitamente el valor 'web_pwa' además de 'android', 'ios' y 'web'.
-- Ejecutar en Supabase (Editor SQL).
-- ============================================================

-- 1. Actualizar la restricción check en dispositivos_vinculados
alter table public.dispositivos_vinculados
  drop constraint if exists dispositivos_vinculados_platform_check;

alter table public.dispositivos_vinculados
  add constraint dispositivos_vinculados_platform_check
  check (platform in ('android', 'ios', 'web', 'web_pwa'));

-- 2. Asegurar que la función registrar_dispositivo acepte 'web_pwa'
comment on column public.dispositivos_vinculados.platform is 'Plataforma del cliente: android, ios, web o web_pwa.';
