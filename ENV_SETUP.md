# Environment Variables Setup

Copy this to your `.env.local` file and fill in your values:

```bash
# ===============================
# DATABASE
# ===============================
DATABASE_URL="postgresql://user:password@localhost:5432/apc_inventory"

# ===============================
# AUTHENTICATION
# ===============================
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-random-string-here
NEXT_PUBLIC_APP_URL=https://your-canonical-app-domain.example
JWT_SECRET=generate-a-unique-secret-with-at-least-32-random-bytes
EMAIL_VERIFICATION_SECRET=generate-a-separate-unique-secret-with-at-least-32-random-bytes
PASSWORD_RESET_SECRET=generate-another-unique-secret-with-at-least-32-random-bytes

# ===============================
# PAYMENTS
# ===============================
# Payment receiving accounts and QR codes are configured by an admin in the
# admin settings page. Customers upload proof of payment for wallet payments.
# No payment gateway credentials are required.

# ===============================
# EMAIL VERIFICATION (if using)
# ===============================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# ===============================
# STORAGE (if using file uploads)
# ===============================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
SUPABASE_PRODUCT_BUCKET=product-images
SUPABASE_PROFILE_BUCKET=profile-images
SUPABASE_PAYMENT_QR_BUCKET=payment-qr
SUPABASE_RECEIPT_BUCKET=payment-proofs

# ===============================
# SHARED RATE LIMITING
# ===============================
# Required in production for multi-instance rate limiting.
UPSTASH_REDIS_REST_URL=https://your-region.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-server-only-upstash-token

# Optional policy overrides (defaults: auth 3/15m, public 300/1m,
# authenticated user 120/1m, admin 180/1m).
RATE_LIMIT_AUTH_MAX_REQUESTS=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_BACKOFF_BASE_MS=30000
RATE_LIMIT_AUTH_BACKOFF_MAX_MS=900000
RATE_LIMIT_PUBLIC_MAX_REQUESTS=300
RATE_LIMIT_PUBLIC_WINDOW_MS=60000
RATE_LIMIT_USER_MAX_REQUESTS=120
RATE_LIMIT_USER_WINDOW_MS=60000
RATE_LIMIT_ADMIN_MAX_REQUESTS=180
RATE_LIMIT_ADMIN_WINDOW_MS=60000

# Enable only when the hosting proxy sanitizes x-real-ip / x-forwarded-for.
RATE_LIMIT_TRUST_PROXY_HEADERS=true
# Set false in development when you need to exercise localhost limits.
RATE_LIMIT_BYPASS_LOCALHOST=false

# Optional operational alert webhook
OPERATIONAL_ALERT_WEBHOOK_URL=https://your-alert-webhook.example/endpoint

# Required in production for scheduled wallet reservation cleanup
CRON_SECRET=your-random-cron-secret
```

Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin in production. Do not
derive email verification or password-reset links from request host headers.

The optional seed scripts are development-only and require `SEED_ADMIN_EMAIL`,
`SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_EMAIL`, and `SEED_CUSTOMER_PASSWORD`.

## Payment Configuration

Online wallet checkout reserves stock before displaying payment instructions.
Customers have two hours to upload proof; submitted proof remains reserved for
admin review. The Vercel schedule in `vercel.json` calls
`GET /api/cron/expire-wallet-reservations` every five minutes. Set `CRON_SECRET`
in the deployment environment. On other hosts, configure an equivalent
five-minute scheduler that sends `Authorization: Bearer $CRON_SECRET`.

1. Sign in as an admin and open **Settings**.
2. Configure the GCash and Maya receiving account names and numbers.
3. Upload the corresponding QR codes if customers should scan them.
4. Customers select a wallet at checkout, pay directly, and upload a receipt.
5. Admins review the receipt and approve or decline the payment.

Cash orders do not require a payment proof upload.

Create `product-images`, `profile-images`, and `payment-qr` as public Supabase buckets. Create
`payment-proofs` as a private bucket. Receipt object keys are stored in orders,
and short-lived signed URLs are generated when receipts are viewed.

To create the profile image bucket with the service-role credentials in your
environment, run:

```bash
npm run storage:setup
```

For uptime monitoring, configure a monitor against `GET /api/health`. A healthy
database returns HTTP 200; database connectivity failures return HTTP 503.
Configure `OPERATIONAL_ALERT_WEBHOOK_URL` if database health failures should
also be forwarded to Slack, Teams, PagerDuty, or another webhook receiver.

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or prefix it with
`NEXT_PUBLIC_`.

Rate limiting uses Upstash Redis in production so multiple application
instances share the same login and API limits. Keep the Redis credentials
server-only. PostgreSQL remains the fallback when Redis is not configured or
temporarily unavailable, with an in-memory fallback during database failure.

## Testing Configuration

After setting environment variables:

```bash
# Restart dev server
npm run dev

```

To test payments, place an order with GCash or Maya, upload a receipt, and
approve it from the admin orders page. Use a development database when testing
inventory changes.
