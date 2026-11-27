-- ==============================================================================
-- TENDERITO · Fase 26 — Aumentar Límite de Caracteres en Estados de Tienda (150 chars)
-- ==============================================================================
-- Amplía la restricción de longitud máxima de la descripción (caption)
-- de 120 a 150 caracteres para permitir mensajes comerciales más completos.
-- ==============================================================================

alter table public.store_statuses
  drop constraint if exists store_statuses_caption_chk;

alter table public.store_statuses
  add constraint store_statuses_caption_chk
  check (char_length(trim(caption)) between 1 and 150);

comment on column public.store_statuses.caption is
  'Descripción corta del estado (máx 150 caracteres), enviada también en la notificación push.';
