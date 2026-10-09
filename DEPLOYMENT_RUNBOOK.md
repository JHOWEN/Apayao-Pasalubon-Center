# Production Deployment Runbook

This guide keeps the current providers and application behavior: Vercel, PostgreSQL, Supabase Storage, the app's JWT-cookie authentication, Resend or SMTP, Upstash Redis, and the Vercel Cron schedule. It does not migrate or replace any provider.

## 1. Prepare production services

1. Create or select the production PostgreSQL database. Keep development and production databases separate.
2. Create or select the Supabase project used for Storage. Create these buckets:
   - `product-images`: public; product images are processed to WebP, with a 10 MB source upload limit by default.
   - `profile-images`: public; profile uploads are limited to 2 MB.
   - `payment-qr`: public; QR uploads are limited to 5 MB.
   - `payment-proofs`: private; receipt uploads are limited to 5 MB and are viewed using short-lived signed URLs.
3. Create or select the production Upstash Redis database. It is used for rate limits and cross-instance realtime event delivery.
4. Verify the sending domain in Resend and publish its required DNS records. Alternatively, configure SMTP. The current mailer prefers Resend when both `RESEND_API_KEY` and `RESEND_FROM` are present.
5. Select the canonical production hostname and make sure it has HTTPS. This value must match the origin used in verification and password-reset emails.

## 2. Configure deployment variables

Add values to Vercel Project Settings > Environment Variables. Set them for **Production** and, separately, for **Preview** when previews need to use a safe test database and test email configuration. Do not commit secrets or copy production secrets into preview deployments.

Required for the current production app:

| Variable                                             | Purpose                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                       | Reachable PostgreSQL connection string for the selected environment.                            |
| `APP_URL`                                            | Server-only canonical HTTPS origin, for example `https://shop.example.com`; used to construct email links. |
| `JWT_SECRET`                                         | Signs 10-minute access tokens. Use a unique random secret of at least 32 bytes.                 |
| `ADMIN_ROUTE_KEY`                                    | Random URL-safe key of at least 32 bytes used to prefix admin pages and APIs. Keep server-only and consistent across instances. |
| `EMAIL_VERIFICATION_SECRET`                          | Signs verification links; use a separate unique random secret.                                  |
| `PASSWORD_RESET_SECRET`                              | Recommended dedicated key for password-reset links. If unset, the app derives a reset-only key from `EMAIL_VERIFICATION_SECRET` or `JWT_SECRET`. |
| `SUPABASE_URL`                                       | Supabase project URL used by the Storage adapter.                                               |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Server-only Storage credential. Never expose it to browser code or use a `NEXT_PUBLIC_` prefix. |
| `SUPABASE_PRODUCT_BUCKET`                            | Usually `product-images`.                                                                       |
| `SUPABASE_PROFILE_BUCKET`                            | Usually `profile-images`.                                                                       |
| `SUPABASE_PAYMENT_QR_BUCKET`                         | Usually `payment-qr`.                                                                           |
| `SUPABASE_RECEIPT_BUCKET`                            | Usually `payment-proofs`; this bucket must remain private.                                      |
| `RESEND_API_KEY`, `RESEND_FROM`                      | Resend credentials and verified sender, if using Resend.                                        |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Required for production JTI revocation, shared rate limiting, and cross-instance realtime.      |
| `CRON_SECRET`                                        | Random secret required by the wallet-reservation cleanup endpoint.                              |

Optional variables include `OPERATIONAL_ALERT_WEBHOOK_URL`, `MAX_PRODUCT_IMAGE_SIZE_MB`, and the `RATE_LIMIT_*` policy overrides documented in [ENV_SETUP.md](ENV_SETUP.md).

For SMTP instead of Resend, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. `EMAIL_FROM` is not read by the current mailer. `NEXTAUTH_URL` and `NEXTAUTH_SECRET` do not configure the primary login flow; the current app signs its own JWT cookie with `JWT_SECRET`.

In local development, put development values in `.env.local`, which Next.js loads alongside `.env`. Confirm `.env` and `.env.local` are ignored by Git; never print or paste secret values into tickets or chat.

Login stores only a hash of each rotating refresh token in PostgreSQL (7 days by default, 30 days with “Remember me”). Access tokens expire after 10 minutes. Access and refresh credentials are HttpOnly cookies; Redis stores revoked access-token IDs until each token's expiry. Production authentication fails closed if Upstash Redis is not configured.

## 3. Apply database migrations

1. From a clean release branch, run `npx prisma validate`.
2. Review the pending migration files and take a database backup or snapshot.
3. Apply already-created migrations to the production database with `npx prisma migrate deploy`. This creates the `AdminAuditLog` table. Do not use `prisma migrate dev` against production.
4. Verify Vercel's production `DATABASE_URL` points to the intended database, then check `GET /api/health` after deployment. It should return HTTP 200 with the database check marked `ok`.

## 4. Configure email and verify links

1. Set `APP_URL` to the final HTTPS domain before sending any production verification or reset email. The app intentionally builds links from this server-only configured origin rather than the incoming request host.
2. For Resend, set `RESEND_API_KEY` and `RESEND_FROM` to an address on the verified sending domain. For SMTP, set the SMTP variables listed above. Restart local development after changing local variables.
3. Register a test customer and confirm the verification email arrives and links back to the production origin. Verification links expire after 24 hours.
4. Use **Forgot password** for that account. Confirm the reset email arrives and links to `/reset-password` on the production origin. Reset links expire after 30 minutes and are single-use.
5. Submit a reset request for an unknown address and confirm the response does not disclose whether the account exists. Check provider delivery logs when a message is not received.

**Known pre-launch mail check:** `sendVerificationEmail` currently uses the same HTML copy for verification and password-reset emails; review the delivered verification message for reset-password wording. The registration endpoint also reports successful account creation even when email delivery fails, so confirm delivery in Resend/SMTP logs rather than relying only on the registration response.

## 5. Verify login cookies and access control

1. Test login over HTTPS on the deployed hostname. In browser developer tools, confirm the `token` cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to `/`.
2. Test both remember-me choices: normal login tokens last 7 days; remembered logins last 30 days.
3. Sign out and verify the cookie is removed. Try a protected admin page and admin API without a cookie; access must be denied. Confirm customer accounts cannot access admin routes and staff accounts are redirected away from restricted admin pages.
4. Do not use `NEXTAUTH_*` settings as evidence that this app's login is configured; its primary auth path is the custom JWT cookie and the database-backed role check.

## 6. Verify uploads and bucket privacy

1. Confirm all four buckets exist and have the public/private settings in step 1. The `npm run storage:setup` helper only creates the profile-image bucket; it does not create the other buckets.
2. As an admin, upload a product image. Confirm the API returns main and thumbnail URLs and that both render from the configured Supabase project. Product source files may be JPEG, PNG, WebP, or AVIF, up to 10 MB by default; the app stores processed WebP images.
3. Upload a profile image (JPEG, PNG, WebP, or GIF, up to 2 MB) and a payment QR image (JPEG, PNG, or WebP, up to 5 MB).
4. Place a wallet test order and upload a receipt (JPEG, PNG, or WebP, up to 5 MB). Confirm the stored value is an object key, the payment-proof bucket is private, and an admin can view the short-lived signed URL. Confirm an unauthenticated browser cannot read that object directly.
5. Check Supabase Storage logs and the browser network panel for failed uploads, public URL errors, or signed-URL failures. Do not make the payment-proof bucket public to work around a signed-URL issue.

## 7. Understand stock updates and caching

1. The source of truth is PostgreSQL. A storefront order or POS sale changes stock through the inventory movement logic and writes an inventory transaction. An admin manual inventory adjustment also writes stock and a transaction.
2. Admin clients receive events over `/api/admin/live` when the event is published. Cross-instance delivery depends on Upstash Redis. If Redis is unavailable, the realtime layer falls back to process-local delivery, which is not shared across Vercel instances.
3. The storefront public-products API has a 15-second process-local cache and sends `s-maxage=15, stale-while-revalidate=30`. Storefront product pages do not subscribe to the admin SSE stream. Therefore storefront stock is **not guaranteed to update instantly**; CDN stale-while-revalidate may extend the observed delay. Refresh the storefront and verify the latest quantity before treating a stock change as visible.
4. Manual `POST /api/admin/inventory` movements currently update the database but do not publish an `inventory-updated` event from that route. If the requirement is immediate stock refresh in other admin clients or on the storefront, treat event publication/cache invalidation or storefront polling as a required code change; Vercel settings alone cannot enable it.
5. Test both directions: make a small stock-in movement and confirm the product becomes available; make a stock-out movement or complete a test order and confirm available stock falls. Check the product API response, storefront display after the cache window, admin transaction log, POS, and checkout. Use a non-production database and restore the test stock afterward.

## 8. Configure reservation expiry and monitoring

1. Confirm `vercel.json` is deployed with the five-minute schedule for `/api/cron/expire-wallet-reservations` and that the Vercel plan supports the configured cadence.
2. Set `CRON_SECRET` in Vercel. The cron route expects `Authorization: Bearer <CRON_SECRET>`; do not call it without that header or expose the secret in logs.
3. Monitor `GET /api/health` for HTTP 200. Configure an uptime monitor. If `OPERATIONAL_ALERT_WEBHOOK_URL` is set, test that database failure alerts reach the right channel.
4. Check Vercel function logs, Supabase Storage logs, Resend delivery logs, and Upstash metrics during the smoke tests. Confirm there are no DNS/connectivity failures or repeated 5xx responses.

## 9. Run release checks and smoke tests

Before promoting the deployment, run:

```bash
npm run lint
npm test
npx prisma validate
npm run build
```

After those checks pass and the database backup is confirmed, apply pending migrations with `npx prisma migrate deploy` as the release migration step.

Then test production or a production-like preview end to end: registration and verification, login/logout and cookie flags, forgot-password and one-time reset, product/profile/QR/receipt uploads, cash checkout, wallet checkout and receipt review, POS stock deduction, manual stock-in and stock-out, transaction history, storefront stock after the cache window, reservation expiry, and the health endpoint.

The current test suite has a time-sensitive cash-order fixture in `tests/order.test.ts` using a pickup date that is now in the past. Make that fixture relative to the current date before requiring `npm test` to pass in CI.
