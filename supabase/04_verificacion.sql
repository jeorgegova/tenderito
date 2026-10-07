-- ============================================================
-- TENDERITO · Fase 4/4 — verificación del esquema inicial
-- ============================================================

select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'stores', 'store_memberships', 'customers',
                     'customer_stores', 'credits', 'payments')
order by table_name;

select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'stores', 'store_memberships', 'customers',
                    'customer_stores', 'credits', 'payments')
order by tablename;

select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('trg_create_store_for_profile', 'trg_credits_recalc',
                       'trg_payments_recalc', 'trg_sync_credit_status');

select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('create_customer', 'create_credit', 'create_payment',
                       'current_store_id');

-- Después de registrar un usuario y crear su perfil, deben existir una tienda
-- y una membresía de propietario.
select s.id, s.store_name, m.user_id, m.role
from public.stores s
join public.store_memberships m on m.store_id = s.id;
