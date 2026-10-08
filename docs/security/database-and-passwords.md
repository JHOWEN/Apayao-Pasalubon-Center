# Database and password security

## Query audit

The application uses Prisma model queries plus six handwritten raw-query call sites. All six use Prisma's tagged-template `$queryRaw`/`$executeRaw` APIs; their interpolations are bound values, including the product ID list passed through `Prisma.join`. No `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw`, or string-built SQL was found. Query identifiers and clauses are static. Keep dynamic table/column names out of request data and continue binding every value. Prisma documents tagged templates as prepared, parameterized queries that protect interpolated values from SQL injection.

## Database roles and Vercel

The application should connect with the `apc_runtime` role, not Supabase's `postgres` administrator role. `docs/security/supabase-runtime-role.sql` grants that role CRUD only on the 18 Prisma application tables, enables RLS with a policy for that server role, and revokes direct table access from Supabase's `anon`, `authenticated`, and `service_role` API roles for those tables. The app uses Supabase's Storage API separately.

1. Run `supabase-runtime-role.sql` in the Supabase SQL Editor as the project database administrator. Review its final result sets: the runtime role should have CRUD on only the listed `public` application tables, should have no sequence grants or memberships, and should have `USAGE` but not `CREATE` on `public`. It can execute functions granted to PostgreSQL's `PUBLIC` role; review that function list before relying on the role.
2. Set a new, unique password for `apc_runtime` using a password manager. Do not put it in this repository or paste it into chat. The SQL file deliberately contains no password.
3. In Vercel Preview Environment Variables, set `DATABASE_URL` to the Supabase transaction-pooler URI for `apc_runtime` (port 6543). Use the host and project reference shown by Supabase's **Connect** dialog. If the password contains URI-reserved characters, percent-encode it.
4. Remove `DIRECT_URL` from Vercel Preview. Migrations no longer run in the Vercel build; keep the administrator `DIRECT_URL` only in a trusted local environment and run `npm run db:migrate:deploy` before deploying schema changes.
5. Redeploy Preview after the environment variable changes. Run the verification query at the end of the SQL file and confirm no unexpected table appears.
6. Re-run the SQL file after a migration adds or renames a Prisma table so its access and RLS policy stay aligned.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable. It is only needed server-side for Storage.

## Password storage

Passwords are stored with bcryptjs, which generates and embeds a unique salt in each bcrypt hash. New passwords use work factor 12; successful sign-ins upgrade older lower-cost bcrypt hashes to cost 12. Password creation, reset, and change require at least 15 characters and at most 72 UTF-8 bytes, matching bcrypt's input limit. Passphrases and spaces are accepted; arbitrary symbol/case rules are not required. Existing accounts can continue signing in and can adopt the new length rule on their next password change.

## Secret rotation

Database and signing secrets were displayed in earlier conversation context. Rotate the Supabase database password and `JWT_SECRET`; rotate `NEXTAUTH_SECRET` too if it was included in what was shared. Update the Vercel Preview variables and redeploy. Never commit `.env` or `.env.local`.
