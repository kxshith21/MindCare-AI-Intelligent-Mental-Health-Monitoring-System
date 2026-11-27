-- ============================================================================
-- Phase 5 deploy check — RLS coverage audit (READ ONLY)
--
-- Run this against the deployed/remote Postgres database (Supabase SQL Editor
-- or psql). It MUST RETURN ZERO ROWS. Every returned row names a table in the
-- public schema whose row level security is disabled.
-- ============================================================================

select
  t.schemaname,
  t.tablename as table_name
from pg_catalog.pg_tables as t
join pg_catalog.pg_class as c
  on c.relname = t.tablename
join pg_catalog.pg_namespace as n
  on n.oid = c.relnamespace
 and n.nspname = t.schemaname
where t.schemaname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by t.tablename;
