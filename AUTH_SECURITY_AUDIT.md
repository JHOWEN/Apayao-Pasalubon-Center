# Authentication Security Audit

Audit date: 2026-10-02
Status: Remediation implemented; verification results and remaining risks recorded below.

## Scope and Architecture

The project uses Next.js 16.3.5 App Router, Prisma/PostgreSQL, a custom `token` JWT cookie, plus a NextAuth route with no providers. There are 12 admin pages; all are client components. No admin `loading.tsx` or `error.tsx` exists. The original `middleware.ts` only assigned request IDs. Next 16 requires Proxy in `src/proxy.ts` when the app is under `src/app`.

Login verifies bcrypt credentials and blocked status, rate-limits attempts, signs a JWT, and sets an HttpOnly, SameSite=Lax cookie. Default JWT expiry is 7 days; Remember me is 30 days. Production cookies set Secure. Logout deletes the browser cookie; there is no server-side token revocation, so a copied JWT remains valid until expiry. Registration hardcodes CUSTOMER role and rejects any submitted non-CUSTOMER role. Admin APIs use a mixture of database role checks, signed JWT role checks, and a shared rate-limit helper. Customer order reads/updates are scoped to the JWT subject; payment-proof uploads check order ownership.

## Route Map

| Route family | Authentication / authorization | Existing protection | Finding and required fix |
| --- | --- | --- | --- |
| `/dashboard`, `/admin-orders`, `/admin-settings`, `/analytics`, `/categories`, `/customers`, `/inventory`, `/inventory/transactions`, `/pos`, `/products`, `/products/add`, `/reports` | ADMIN/STAFF portal with existing STAFF restrictions | `src/proxy.ts` validates cookie signature, current DB user, block state, and role before render | Fixed. Unauthenticated/invalid tokens redirect; STAFF restrictions match the existing layout behavior. |
| `/api/admin/analytics` | ADMIN/STAFF | Shared `enforceAuthenticatedRateLimit` plus existing handler | Fixed. Shared helper now requires a verified current user and current portal role before data queries. |
| `/api/admin/categories`, `/inventory`, `/products`, `/variants`, `/reports`, `/live`, `/payment-qr/upload`, `/profile/password` | ADMIN/STAFF, with existing ADMIN-only operations retained | DB-backed `ensureAuthenticatedAdmin` and/or shared helper | Shared helper now denies absent/deleted/invalid users, blocked accounts, and current non-portal roles. |
| `/api/admin/customers`, `/orders`, `/payments/*` | ADMIN/STAFF | Signed JWT checks plus shared helper | Fixed against stale role claims by current DB role validation in shared helper. |
| `/api/admin/profile`, `/api/admin/settings`, `/api/admin/users` | Admin-portal or ADMIN-only per route | Direct DB role checks | Blocked users are now denied. Customer update returns an explicit safe field projection. |
| `/api/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | Public entry points | Validation, rate limits, bcrypt, stored one-time tokens and expiry | Registration remains CUSTOMER-only. Production token secrets fail closed; reset links use configured canonical origin. |
| `/api/auth/logout` | Public operation on the current browser cookie | Rate-limited, then deletes the auth cookie | Logout intentionally does not require a valid session so expired/invalid cookies can still be cleared. |
| `/api/auth/profile`, `/orders`, `/payment-proof`, `/profile/upload` | Authenticated user; ownership for order data | Verify JWT and query current user; order/payment paths scope by user ID | No anonymous bypass found in inspected handlers. |
| `/api/public/*`, `/api/health` | Public by design | Public rate limits or health response | Not admin data routes. |
| `/api/cron/expire-wallet-reservations` | Scheduled service | Requires timing-safe `CRON_SECRET` bearer comparison and fails closed when unset | Protected. |

## Verified Findings

### High: Admin page routes had no server-side authentication gate (fixed)

Location: `middleware.ts`, `src/app/(admin)/layout.tsx`, and all 12 admin page components.

The middleware only added a request ID. The route-group layout is client-only and checked the profile after the page response. Anonymous GET `/dashboard` returned HTTP 200 before the fix. `src/proxy.ts` now guards the discovered page paths before rendering; a live anonymous matrix returned HTTP 307 to `/login?reason=login-required` for all 12 routes, and an invalid token also redirected.

### High: Dashboard analytics API was anonymous (fixed)

Location: `src/app/api/admin/analytics/route.ts` and `src/lib/rate-limit.ts` (`enforceAuthenticatedRateLimit`).

The analytics handler only called a helper that parsed a token when present, then applied a rate limit without requiring an account or role. Anonymous GET `/api/admin/analytics?range=DAILY&includeToday=true` returned HTTP 200. The shared helper now denies unauthenticated/invalid users and validates current ADMIN/STAFF role before querying. Post-fix live API requests were blocked from reliable verification by a separate Next dev CSS compilation failure described below.

### High: Shared admin rate limiting trusted stale token role claims (fixed)

Location: `src/lib/rate-limit.ts` and admin handlers that call `enforceAuthenticatedRateLimit`.

The helper previously used `payload.role` only to select a rate-limit account key. It now resolves the subject through the database, then checks the current role and blocked state centrally. ADMIN/STAFF role changes therefore take effect on subsequent API requests.

### Medium: Admin customer update exposed password/reset fields (fixed)

Location: `src/app/api/admin/customers/route.ts` PUT.

`prisma.user.update` returned the whole User record in the JSON response, including password hash and password-reset/email-verification fields. The update now selects and returns only profile/contact/status/timestamp fields.

### Conditional High: Known production token-secret fallbacks (fixed)

Location: `src/lib/auth.ts`.

JWT signing now fails closed without `JWT_SECRET` in production and explicitly uses/verifies HS256. Email verification and password reset also fail closed without their dedicated production secrets (`EMAIL_VERIFICATION_SECRET`, `PASSWORD_RESET_SECRET`).

### High: Password-reset link host was request-controlled (fixed)

Location: `src/app/api/auth/forgot-password/route.ts`.

The reset endpoint constructed email links from `Host`/`X-Forwarded-Host`, allowing a forged request to redirect a reset email to an attacker-controlled domain. Auth links now use the configured `NEXT_PUBLIC_APP_URL`; production requires a canonical HTTPS origin.

### Medium: HMAC signature verification used ordinary string comparison (fixed)

Location: `src/lib/email-verification.ts`, `src/lib/password-reset.ts`.

Signature checks now require exactly 64 hexadecimal characters and use `timingSafeEqual` after equal-length decoding.

### Low/Medium: Security headers and image-fetch configuration

Location: `next.config.ts`.

Compatible frame, MIME-sniffing, referrer, permissions, and production HSTS headers are configured. `dangerouslyAllowLocalIP` was removed from the image optimizer. A strict CSP is deferred because the storefront embeds Google Maps and Next.js uses inline runtime assets; test a CSP before enabling one.

### Informational: Seed scripts contain fixed sample credentials

Location: `scripts/seed.ts` and `seed-users.mjs`.

These manually run scripts previously created predictable sample ADMIN/CUSTOMER credentials and printed them. They now refuse production execution, require explicit seed credentials, hash passwords with cost 12, and do not print credential values. No seed command is wired into `package.json`.

## Authentication Flow

Browser login -> POST `/api/auth/login` -> bcrypt/password and blocked checks -> signed JWT -> HttpOnly `token` cookie -> server verifies signature/expiry -> server resolves current user and role -> protected page/API allows or denies -> logout deletes cookie.

The browser-provided role, localStorage, and sessionStorage are not authentication sources. The custom JWT cookie is the active application session mechanism; NextAuth currently has an empty provider list and is not used by the inspected client pages. Opening `/login` now calls the logout endpoint, clears the cookie and stored display profile, broadcasts a non-sensitive cross-tab event, and keeps credential inputs disabled until cleanup succeeds. Existing admin tabs respond to that event by navigating to login; server-side Proxy/API checks remain authoritative.

## Verification Results

| Security test | Result |
| --- | --- |
| Anonymous `/dashboard` | PASS: HTTP 307 to login |
| Direct access to all 12 discovered admin pages | PASS: each returned HTTP 307 to login |
| Customer-to-admin page | PARTIAL: role policy test denies CUSTOMER; live authenticated customer session not available |
| Anonymous admin API access | PASS: analytics, customers, orders, and inventory returned HTTP 401 |
| Unauthorized admin operation | PARTIAL: shared helper and route guards statically require valid current role; no authenticated lower-role DB session available |
| Fake browser authentication | PARTIAL: invalid token cookie redirected; localStorage/sessionStorage manipulation was not exercised in a browser |
| Fake ADMIN role | PARTIAL: signed JWT required and current DB role checked; no real lower-role session available for end-to-end mutation test |
| Invalid token | PASS: invalid cookie on `/dashboard` redirected before render |
| Login-page session cleanup across tabs | PARTIAL: browser test with synthetic invalid cookie observed logout HTTP 200, cookie removal, session signal, and enabled form; no valid authenticated account session was used |
| Logout protection | NOT RUN: requires a usable authenticated browser session; logout deletes cookie but does not revoke copied JWTs |
| Authenticated refresh | NOT RUN: requires a usable authenticated browser session |
| JWT/HMAC signatures, role policy, canonical URL | PASS: 6 focused auth tests passed |
| Lint | PASS: touched TypeScript files |
| Full TypeScript check | PASS: `npx tsc --noEmit` |
| Full test suite | PARTIAL: 40/41 pass; existing cash-order payload test fails at `tests/order.test.ts` |
| Public app and security headers | PASS: `/`, `/login`, health, and public settings return HTTP 200; configured headers present |

## Remediation Plan and Remaining Risks

Modified files: `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/rate-limit.ts`, `src/lib/app-url.ts`, `src/lib/email-verification.ts`, `src/lib/password-reset.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/admin/customers/route.ts`, `src/app/api/admin/profile/route.ts`, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/users/route.ts`, `src/app/(admin)/inventory/page.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/globals.css`, `next.config.ts`, `ENV_SETUP.md`, `scripts/seed.ts`, `seed-users.mjs`, `tests/auth-cookie-rotation.test.ts`, and this report. The obsolete `middleware.ts` was removed in favor of the Next.js 16 `src/proxy.ts` convention.

A valid positive-login, customer-role, logout/back, and refresh browser test requires a usable authenticated session; no credentials were exposed or assumed. The dev server generated `AGENTS.md`/`CLAUDE.md` during startup; these are cleanup artifacts, not application changes. The Tailwind/PostCSS failure was traced to one arbitrary calc utility in the inventory modal; replacing it with equivalent named CSS restored the login page and public/API responses. Logout is cookie deletion rather than server-side revocation, so stolen tokens remain usable until JWT expiry. No strict CSP was added; production HTTPS/HSTS and authenticated role integration still require deployment/browser validation.
