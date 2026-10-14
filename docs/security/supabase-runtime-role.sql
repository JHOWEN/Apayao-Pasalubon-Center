-- Run in the Supabase SQL Editor as the project administrator (postgres).
-- This creates a dedicated server-side role. Set its password separately;
-- do not put a real password in this file or commit it to Git.
-- This script does not delete data, tables, or schemas. It changes privileges,
-- enables RLS on the listed app tables, and replaces only its own named policy.
-- It intentionally removes direct Supabase Data API access
-- (anon/authenticated/service_role) to those tables; it also prevents those API
-- roles from inheriting grants on future public tables created by postgres.
-- Do not run it if another client or integration depends on Supabase Data API
-- access in the public schema.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'apc_runtime'
  ) THEN
    EXECUTE 'CREATE ROLE apc_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
  END IF;
END
$$;

ALTER ROLE apc_runtime
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- Prevent future public tables created by postgres from automatically
-- granting Supabase Data API access. This applies to all such tables in
-- public; explicitly grant access later if a separate integration needs it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL PRIVILEGES ON DATABASE postgres FROM apc_runtime;
GRANT CONNECT ON DATABASE postgres TO apc_runtime;
REVOKE CREATE ON SCHEMA public FROM apc_runtime;
GRANT USAGE ON SCHEMA public TO apc_runtime;

-- Remove any direct grants this role may have received earlier, including on
-- Prisma's migration ledger. Future schema migrations are run outside Vercel.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM apc_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM apc_runtime;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM apc_runtime;
REVOKE ALL PRIVILEGES ON TYPE
  public."Role",
  public."ProductStatus",
  public."ProductSellingMode",
  public."OrderStatus",
  public."PaymentStatus",
  public."PaymentMethod",
  public."InventoryType",
  public."InventoryTransactionEventAction",
  public."ProductGroupStatus"
FROM apc_runtime;

-- This application uses Prisma through its own server API, not Supabase's
-- PostgREST database API. Remove direct API-role access to these application
-- tables; Supabase Storage continues using its separate Storage API.
REVOKE ALL PRIVILEGES ON TABLE
  public."User",
  public."AuthSession",
  public."Category",
  public."Product",
  public."ProductVariant",
  public."Cart",
  public."CartItem",
  public."Order",
  public."OrderItem",
  public."OrderEvent",
  public."InventoryTransaction",
  public."InventoryTransactionEvent",
  public."ProductGroup",
  public."ProductGroupItem",
  public."ActivityLog",
  public."AppSetting",
  public."RateLimitEntry",
  public."ProductReview"
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."User",
  public."AuthSession",
  public."Category",
  public."Product",
  public."ProductVariant",
  public."Cart",
  public."CartItem",
  public."Order",
  public."OrderItem",
  public."OrderEvent",
  public."InventoryTransaction",
  public."InventoryTransactionEvent",
  public."ProductGroup",
  public."ProductGroupItem",
  public."ActivityLog",
  public."AppSetting",
  public."RateLimitEntry",
  public."ProductReview"
TO apc_runtime;

GRANT USAGE ON TYPE
  public."Role",
  public."ProductStatus",
  public."ProductSellingMode",
  public."OrderStatus",
  public."PaymentStatus",
  public."PaymentMethod",
  public."InventoryType",
  public."InventoryTransactionEventAction",
  public."ProductGroupStatus"
TO apc_runtime;

-- Row-level security is default-deny for Supabase API roles. The server role
-- gets an explicit policy because it serves authorized API routes for the app.
DO $$
DECLARE
  app_table text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'User', 'AuthSession', 'Category', 'Product', 'ProductVariant', 'Cart',
    'CartItem', 'Order', 'OrderItem', 'OrderEvent', 'InventoryTransaction',
    'InventoryTransactionEvent', 'ProductGroup', 'ProductGroupItem',
    'ActivityLog', 'AppSetting', 'RateLimitEntry', 'ProductReview'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    EXECUTE format('DROP POLICY IF EXISTS apc_runtime_full_access ON public.%I', app_table);
    EXECUTE format(
      'CREATE POLICY apc_runtime_full_access ON public.%I FOR ALL TO apc_runtime USING (true) WITH CHECK (true)',
      app_table
    );
  END LOOP;
END
$$;

-- Review effective privileges across non-system schemas. This should list
-- only the application tables above in public; investigate other results,
-- including privileges inherited through PUBLIC, before using this role.
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  has_table_privilege('apc_runtime', relation.oid, 'SELECT') AS can_select,
  has_table_privilege('apc_runtime', relation.oid, 'INSERT') AS can_insert,
  has_table_privilege('apc_runtime', relation.oid, 'UPDATE') AS can_update,
  has_table_privilege('apc_runtime', relation.oid, 'DELETE') AS can_delete
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND (
    has_table_privilege('apc_runtime', relation.oid, 'SELECT')
    OR has_table_privilege('apc_runtime', relation.oid, 'INSERT')
    OR has_table_privilege('apc_runtime', relation.oid, 'UPDATE')
    OR has_table_privilege('apc_runtime', relation.oid, 'DELETE')
  )
ORDER BY namespace.nspname, relation.relname;

-- No rows are expected unless the application schema contains an explicitly
-- granted sequence. Prisma's current models use string IDs, not sequences.
SELECT
  namespace.nspname AS schema_name,
  sequence.relname AS sequence_name,
  has_sequence_privilege('apc_runtime', sequence.oid, 'USAGE') AS can_use,
  has_sequence_privilege('apc_runtime', sequence.oid, 'SELECT') AS can_select,
  has_sequence_privilege('apc_runtime', sequence.oid, 'UPDATE') AS can_update
FROM pg_catalog.pg_class AS sequence
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
WHERE sequence.relkind = 'S'
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (
    has_sequence_privilege('apc_runtime', sequence.oid, 'USAGE')
    OR has_sequence_privilege('apc_runtime', sequence.oid, 'SELECT')
    OR has_sequence_privilege('apc_runtime', sequence.oid, 'UPDATE')
  )
ORDER BY namespace.nspname, sequence.relname;

-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. Review the
-- functions available to this runtime role. Do not revoke this globally in
-- Supabase without assessing extension and platform dependencies first.
SELECT
  namespace.nspname AS schema_name,
  procedure.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS arguments
FROM pg_catalog.pg_proc AS procedure
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND has_function_privilege('apc_runtime', procedure.oid, 'EXECUTE')
ORDER BY namespace.nspname, procedure.proname;

-- Expected: public is usable and not creatable. Review any other schema.
SELECT
  namespace.nspname AS schema_name,
  has_schema_privilege('apc_runtime', namespace.oid, 'USAGE') AS can_use,
  has_schema_privilege('apc_runtime', namespace.oid, 'CREATE') AS can_create
FROM pg_catalog.pg_namespace AS namespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (
    has_schema_privilege('apc_runtime', namespace.oid, 'USAGE')
    OR has_schema_privilege('apc_runtime', namespace.oid, 'CREATE')
  )
ORDER BY namespace.nspname;

-- This should return no rows: the runtime login must not be a member of any
-- other role, which could grant it additional access.
SELECT parent.rolname AS member_of_role
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
JOIN pg_catalog.pg_roles AS runtime ON runtime.oid = membership.member
WHERE runtime.rolname = 'apc_runtime';
