# Database and password security

## Query audit

The application uses Prisma model queries plus six handwritten raw-query call sites. All six use Prisma's tagged-template `$queryRaw`/`$executeRaw` APIs; their interpolations are bound values, including the product ID list passed through `Prisma.join`. No `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw`, or string-built SQL was found. Query identifiers and clauses are static. Keep dynamic table/column names out of request data and continue binding every value. Prisma documents tagged templates as prepared, parameterized queries that protect interpolated values from SQL injection.

## Database roles and Vercel

The application should connect with the `apc_runtime` role, not Supabase's `postgres` administrator role. `docs/security/supabase-runtime-role.sql` grants that role CRUD only on the 18 Prisma application tables, enables RLS with a policy for that server role, and revokes direct table access from Supabase's `anon`, `authenticated`, and `service_role` API roles for those tables. The app uses Supabase's Storage API separately. The read-only `docs/security/supabase-runtime-role-verify.sql` checks the connected role, `apc_runtime`, grants, RLS state, policies, and role memberships.

1. Run `supabase-runtime-role.sql` in the Supabase SQL Editor as the project database administrator. Review its final result sets: the runtime role should have CRUD on only the listed `public` application tables, should have no sequence grants or memberships, and should have `USAGE` but not `CREATE` on `public`. It can execute functions granted to PostgreSQL's `PUBLIC` role; review that function list before relying on the role.
2. Set a new, unique password for `apc_runtime` using a password manager. Do not put it in this repository or paste it into chat. The SQL file deliberately contains no password.
3. In Vercel Project Settings > Environment Variables, set `DATABASE_URL` separately for Production and Preview to the Supabase shared transaction-pooler URI for `apc_runtime` (port 6543). Copy the host from Supabase's **Connect** dialog. For the shared pooler, set the username to `apc_runtime.<project-ref>`; append `?pgbouncer=true` for Prisma's Supavisor compatibility. Percent-encode reserved characters in the password. Do not use the `postgres` or `service_role` connection for application requests.
4. Remove `DIRECT_URL` from Vercel Production and Preview. Migrations no longer run in the Vercel build; keep the administrator `DIRECT_URL` only in a trusted local environment and run `npm run db:migrate:deploy` before deploying schema changes.
5. In Supabase SQL Editor, run `supabase-runtime-role-verify.sql` against the same project. The editor may connect as `postgres`; check that the `runtime_role` columns are populated and `is_superuser`, `bypasses_rls`, and `inherits_roles` are false for `apc_runtime`. Each of the 18 tables should have RLS enabled and the expected policy, and the runtime role should have CRUD only on those tables. Review any additional policies; the unexpected-access and membership queries should return no rows, and the API roles should have no direct table privileges.
6. Save the Vercel variables and redeploy Production. Check `GET /api/health`. Since Vercel masks saved secret values, verify the active database username by setting the Production value to the known-good runtime URI before redeploying, then validate the same URI from a trusted client with `SELECT current_user;`.
7. Re-run the role setup SQL after a migration adds or renames a Prisma table, then rerun the read-only verification script.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable. It is only needed server-side for Storage.

## Password storage

Passwords are stored with bcryptjs, which generates and embeds a unique salt in each bcrypt hash. New passwords use work factor 12; successful sign-ins upgrade older lower-cost bcrypt hashes to cost 12. Password creation, reset, and change require at least 8 characters, including a lowercase letter, an uppercase letter, a number, and a symbol, and at most 72 UTF-8 bytes, matching bcrypt's input limit. Spaces are allowed but do not count as symbols. Existing accounts can continue signing in and must meet the policy the next time they change or reset their password.

## Secret rotation

Database and signing secrets were displayed in earlier conversation context. Rotate the Supabase database password and `JWT_SECRET`; rotate `NEXTAUTH_SECRET` too if it was included in what was shared. Update the Vercel Preview variables and redeploy. Never commit `.env` or `.env.local`.
