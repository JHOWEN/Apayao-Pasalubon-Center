-- Read-only audit for the live Supabase PostgreSQL project.
-- Run from Supabase SQL Editor. This query makes no changes.

WITH expected(table_name) AS (
  VALUES
    ('User'), ('AuthSession'), ('Category'), ('Product'), ('ProductVariant'),
    ('Cart'), ('CartItem'), ('Order'), ('OrderItem'), ('OrderEvent'),
    ('InventoryTransaction'), ('InventoryTransactionEvent'), ('ProductGroup'),
    ('ProductGroupItem'), ('ActivityLog'), ('AppSetting'), ('RateLimitEntry'),
    ('ProductReview')
)
SELECT
  current_database() AS database_name,
  current_user AS connected_as,
  connection.rolsuper AS connected_role_is_superuser,
  connection.rolbypassrls AS connected_role_bypasses_rls,
  runtime.rolname AS runtime_role,
  runtime.rolsuper AS is_superuser,
  runtime.rolbypassrls AS bypasses_rls,
  runtime.rolinherit AS inherits_roles,
  runtime.rolcreaterole AS can_create_roles,
  runtime.rolcreatedb AS can_create_databases,
  has_schema_privilege(runtime.rolname, 'public', 'USAGE') AS public_usage,
  has_schema_privilege(runtime.rolname, 'public', 'CREATE') AS public_create
FROM (SELECT 1) AS singleton
LEFT JOIN pg_catalog.pg_roles AS connection ON connection.rolname = current_user
LEFT JOIN pg_catalog.pg_roles AS runtime ON runtime.rolname = 'apc_runtime';

WITH expected(table_name) AS (
  VALUES
    ('User'), ('AuthSession'), ('Category'), ('Product'), ('ProductVariant'),
    ('Cart'), ('CartItem'), ('Order'), ('OrderItem'), ('OrderEvent'),
    ('InventoryTransaction'), ('InventoryTransactionEvent'), ('ProductGroup'),
    ('ProductGroupItem'), ('ActivityLog'), ('AppSetting'), ('RateLimitEntry'),
    ('ProductReview')
)
SELECT
  expected.table_name,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  has_table_privilege(runtime.rolname, format('%I.%I', 'public', expected.table_name), 'SELECT') AS can_select,
  has_table_privilege(runtime.rolname, format('%I.%I', 'public', expected.table_name), 'INSERT') AS can_insert,
  has_table_privilege(runtime.rolname, format('%I.%I', 'public', expected.table_name), 'UPDATE') AS can_update,
  has_table_privilege(runtime.rolname, format('%I.%I', 'public', expected.table_name), 'DELETE') AS can_delete,
  count(policy.policyname) AS policy_count,
  count(*) FILTER (
    WHERE policy.policyname = 'apc_runtime_full_access'
      AND policy.cmd = 'ALL'
      AND runtime.rolname = ANY(policy.roles)
      AND trim(both '()' from COALESCE(policy.qual, '')) = 'true'
      AND trim(both '()' from COALESCE(policy.with_check, '')) = 'true'
  ) AS expected_policy_count
FROM expected
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.relnamespace = 'public'::regnamespace
  AND relation.relname = expected.table_name
LEFT JOIN pg_catalog.pg_roles AS runtime ON runtime.rolname = 'apc_runtime'
LEFT JOIN pg_catalog.pg_policies AS policy
  ON policy.schemaname = 'public'
  AND policy.tablename = expected.table_name
GROUP BY expected.table_name, relation.relrowsecurity, relation.relforcerowsecurity,
  runtime.rolname, runtime.oid
ORDER BY expected.table_name;

-- Inspect every policy on public application tables, including policies other
-- than the expected server-role policy.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Any returned row indicates an unexpected direct grant to the runtime role.
WITH expected(table_name) AS (
  VALUES
    ('User'), ('AuthSession'), ('Category'), ('Product'), ('ProductVariant'),
    ('Cart'), ('CartItem'), ('Order'), ('OrderItem'), ('OrderEvent'),
    ('InventoryTransaction'), ('InventoryTransactionEvent'), ('ProductGroup'),
    ('ProductGroupItem'), ('ActivityLog'), ('AppSetting'), ('RateLimitEntry'),
    ('ProductReview')
)
SELECT relation.relname AS unexpected_table_with_runtime_access
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
JOIN pg_catalog.pg_roles AS runtime ON runtime.rolname = 'apc_runtime'
LEFT JOIN expected ON expected.table_name = relation.relname
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND expected.table_name IS NULL
  AND (
    has_table_privilege(runtime.rolname, relation.oid, 'SELECT')
    OR has_table_privilege(runtime.rolname, relation.oid, 'INSERT')
    OR has_table_privilege(runtime.rolname, relation.oid, 'UPDATE')
    OR has_table_privilege(runtime.rolname, relation.oid, 'DELETE')
  );

-- Expected to return no rows: apc_runtime has no inherited role memberships.
SELECT parent.rolname AS member_of_role
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
JOIN pg_catalog.pg_roles AS runtime ON runtime.oid = membership.member
WHERE runtime.rolname = 'apc_runtime';

-- Expected to return all false: Supabase Data API roles should have no direct
-- table grants. RLS policies do not replace PostgreSQL GRANT/REVOKE checks.
WITH expected(table_name) AS (
  VALUES
    ('User'), ('AuthSession'), ('Category'), ('Product'), ('ProductVariant'),
    ('Cart'), ('CartItem'), ('Order'), ('OrderItem'), ('OrderEvent'),
    ('InventoryTransaction'), ('InventoryTransactionEvent'), ('ProductGroup'),
    ('ProductGroupItem'), ('ActivityLog'), ('AppSetting'), ('RateLimitEntry'),
    ('ProductReview')
)
SELECT
  expected.table_name,
  (
    has_table_privilege('anon', format('%I.%I', 'public', expected.table_name), 'SELECT')
    OR has_table_privilege('anon', format('%I.%I', 'public', expected.table_name), 'INSERT')
    OR has_table_privilege('anon', format('%I.%I', 'public', expected.table_name), 'UPDATE')
    OR has_table_privilege('anon', format('%I.%I', 'public', expected.table_name), 'DELETE')
  ) AS anon_has_direct_access,
  (
    has_table_privilege('authenticated', format('%I.%I', 'public', expected.table_name), 'SELECT')
    OR has_table_privilege('authenticated', format('%I.%I', 'public', expected.table_name), 'INSERT')
    OR has_table_privilege('authenticated', format('%I.%I', 'public', expected.table_name), 'UPDATE')
    OR has_table_privilege('authenticated', format('%I.%I', 'public', expected.table_name), 'DELETE')
  ) AS authenticated_has_direct_access,
  (
    has_table_privilege('service_role', format('%I.%I', 'public', expected.table_name), 'SELECT')
    OR has_table_privilege('service_role', format('%I.%I', 'public', expected.table_name), 'INSERT')
    OR has_table_privilege('service_role', format('%I.%I', 'public', expected.table_name), 'UPDATE')
    OR has_table_privilege('service_role', format('%I.%I', 'public', expected.table_name), 'DELETE')
  ) AS service_role_has_direct_access
FROM expected
ORDER BY expected.table_name;
