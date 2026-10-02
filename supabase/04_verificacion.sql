-- ============================================================
-- TENDERITO · Fase 4/4 — Verificación (solo lectura, salvo bloque final)
-- Corre cada SELECT suelto para confirmar Fases 1–3.
-- El bloque transaccional prueba el trigger de balance con ROLLBACK
-- (no deja residuos). Reemplaza <TU_USER_ID> por tu id de
-- Authentication → Users antes de correrlo.
-- ============================================================

-- 1. Tablas existen
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'customers', 'credits', 'payments');

-- 2. RLS activado en las 4
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'customers', 'credits', 'payments');

-- 3. Policies creadas
select tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4. Triggers de balance existen
select event_object_table as tabla, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('trg_credits_recalc', 'trg_payments_recalc');

-- 5. Prueba punta a punta del balance (con ROLLBACK, no persiste nada)
-- NOTA: corre esto logueado como service_role NO; usa tu usuario dueño.
-- Reemplaza <TU_USER_ID> y <TU_USER_ID> (van 2 veces).
/*
begin;

insert into public.profiles (id, store_name, merchant_name)
values ('<TU_USER_ID>', 'Tienda Prueba', 'Test')
on conflict (id) do nothing;

insert into public.customers (merchant_id, name)
values ('<TU_USER_ID>', 'Cliente Prueba')
returning id;
-- copia el id generado y úsalo abajo como <CUSTOMER_ID>

insert into public.credits (merchant_id, customer_id, concept, amount)
values ('<TU_USER_ID>', '<CUSTOMER_ID>', 'Fiado prueba', 50000);

insert into public.payments (merchant_id, customer_id, amount)
values ('<TU_USER_ID>', '<CUSTOMER_ID>', 20000);

-- Esperado: 30000.00
select current_balance from public.customers where id = '<CUSTOMER_ID>';

rollback;
*/
