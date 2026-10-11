# Product Requirements Document

**Product:** Apayao Pasalubong Center inventory, sales, and storefront system  
**Status:** Repository-derived product brief  
**Basis:** Current application routes, Prisma schema, deployment configuration, and project documentation

## Executive Summary

The application brings the Apayao Pasalubong Center’s customer storefront and store operations into one Next.js system. Customers can browse products, place pickup orders, choose cash or supported e-wallet methods, and follow order status. Staff and administrators can manage catalog and stock, process orders, record point-of-sale sales, and review wallet-payment proof. PostgreSQL is the application data store; Prisma handles database access, with Supabase Storage, Upstash Redis, and email services supporting uploads, shared operations, and account flows.

## Problem Statement

The system addresses the operational need to connect a customer-facing catalog and pickup-order flow with the store’s product, inventory, payment-review, and fulfillment workflows. The repository shows these as related tasks handled by separate storefront, admin, and POS screens. Checkout revalidates product prices and stock on the server, while inventory transactions and order events provide records of stock movements and order changes.

The product is designed to reduce reliance on disconnected product lists, manually reconciled orders, and untracked stock changes. That is a system-based problem statement, not a claim based on customer interviews.

## Core Goals and Objectives

| Goal | Objective | Observable outcome in this system |
| --- | --- | --- |
| Make the catalog and ordering path accessible to customers | Let customers find products and submit pickup orders online | Published products, categories, product details, cart, checkout, and customer order history |
| Keep order fulfillment tied to available stock | Revalidate items, prices, and stock on the server; record stock movements | Checkout and POS create orders against current database data; inventory transactions record movements |
| Support both online and in-store sales | Provide wallet-proof review for online orders and a cashier POS flow | Cash, GCash, and Maya methods; admin approval/decline; walk-in order creation and receipts |
| Give store staff operational visibility and control | Provide role-gated tools for catalog, orders, inventory, and reporting | ADMIN/STAFF portal, order lifecycle, inventory ledger, dashboard, and reports |
| Protect customer and store data | Apply account verification, session, role, ownership, and server-side validation checks | CUSTOMER/STAFF/ADMIN roles, protected admin APIs, scoped customer order access, and validated mutations |

## Target Users and Audience

| User type | Typical needs | Main tasks |
| --- | --- | --- |
| Store customer | `CUSTOMER` | Browse the catalog, maintain a cart, place a pickup order, submit wallet-payment proof, track orders, and manage profile details |
| Store staff / cashier | `STAFF` | Find products, create walk-in POS orders, process permitted order steps, and review stock and transaction information |
| Store administrator | `ADMIN` | Manage catalog and inventory, review wallet payments, oversee customers and staff accounts, configure store/payment details, and inspect reports |

The repository implements role checks for the admin portal and additional ADMIN-only operations. It does not describe other user groups, such as delivery drivers, suppliers, or multi-branch operators.

## MVP Features

The MVP is the smallest complete customer-to-store transaction loop represented by the current application:

1. **Customer access:** registration as a customer, login/logout, email verification, password reset, and profile/contact management.
2. **Product discovery:** published catalog, category filtering, product details, simple or variant products, and stock-aware availability.
3. **Pickup ordering:** cart, pickup details, server-validated order creation, order history, and permitted cancellation/status actions.
4. **Payment handling:** cash on pickup and GCash/Maya instructions; wallet proof upload; staff/admin review and approve/decline actions.
5. **Store operations:** admin/staff order processing, POS walk-in sales, catalog/category/variant management, inventory movements, and a transaction ledger.
6. **Access and records:** role and ownership checks, order-event history, inventory transaction records, and protected server-side credentials.

The wallet flow is manual proof review; the code does not implement an online payment gateway or automatic wallet settlement.

## Full Feature List and Prioritization


| Priority | Feature area | Included capabilities | Repository state |
| --- | --- | --- | --- |
| **P0 — MVP transaction loop** | Storefront | Home/catalog, category filtering, product details, product and variant availability, cart, pickup checkout | Present |
| **P0 — MVP transaction loop** | Customer account and orders | Registration, login, email verification, password recovery, profile, order history, order status, cancellation where allowed | Present |
| **P0 — MVP transaction loop** | Payments and fulfillment | Cash, GCash, Maya, proof upload, manual payment approval/decline, pickup-order status progression, time-limited wallet stock reservation | Present |
| **P0 — MVP transaction loop** | POS and inventory | Walk-in POS, cash tender/change, receipt, stock-in/out/adjustment flows, low-stock thresholds, inventory transaction history | Present |
| **P0 — MVP transaction loop** | Catalog administration | Products, categories, simple and variant products, product groups, publishing state, image upload | Present |
| **P0 — MVP transaction loop** | Authorization and validation | CUSTOMER/STAFF/ADMIN roles, protected admin surfaces, customer-owned order access, server-side price and stock validation | Present |
| **P1 — Operating controls** | Dashboard and reports | Revenue and order summaries, low-stock alerts, inventory value, top products, category sales, reports and export/print flows | Present; verify figures against real operating data |
| **P1 — Operating controls** | Customer and team administration | Customer search and account controls, admin/staff account and role management, profile and password settings | Present; access varies by role |
| **P1 — Operating controls** | Store and payment configuration | Store identity/settings, wallet account details, payment QR management, profile and image settings | Present |
| **P1 — Operating controls** | Engagement and history | Favorites, product reviews, order events, activity/audit records, archived/restored inventory transaction records | Present |
| **P1 — Launch operations** | Runtime services | Health endpoint, shared rate limiting/session revocation support, email delivery, private payment-proof storage, reservation-expiry endpoint | Present; configure and verify per deployment environment |
| **P2 — Reliability and measurement** | Reservation expiry cadence | Align the scheduled cleanup interval with the two-hour reservation lifetime and the desired stock-release timing | Follow-up required: `vercel.json` currently schedules the route daily; the deployment runbook says every five minutes |
| **P2 — Reliability and measurement** | Stock freshness | Validate how quickly inventory changes appear in storefront and other admin clients; tune cache invalidation/event delivery if measured delay is too high | Follow-up based on the repository’s cache and realtime design |
| **P2 — Reliability and measurement** | Product and operations metrics | Establish baselines for checkout, payment-review, fulfillment, inventory, and service reliability | Targets and several event counters are not defined in the repository |

### Product boundaries

- The configured customer workflow is pickup; the project does not show shipping or delivery management.
- Wallet payments use customer-submitted proof and staff/admin review. No card processor or automatic wallet API settlement is shown.
- The product describes one store operation; multi-branch inventory and supplier purchasing are outside this PRD.

## Success Metrics

Collect a baseline during Preview and a controlled store pilot before setting numeric targets. The repository defines data sources for some measures but does not contain approved target values. Checkout-attempt and service-latency measures require platform telemetry or additional event instrumentation.

| Metric | Definition | Data source / measurement note |
| --- | --- | --- |
| Order completion rate | Completed orders divided by placed orders, reported by order-created cohort | `Order.status` and `Order.createdAt`; break out cancelled orders separately |
| Wallet proof review time | Median time from proof submission to approve/decline decision | Order-event timestamps for proof submission and payment decision |
| Reservation expiry correctness | Eligible expired reservations that are cancelled and have reserved stock returned | Expiry route result, order events, and inventory transactions; compare with expired eligible orders |
| Inventory movement traceability | Stock-changing operations with a corresponding inventory transaction record | Inventory movements and transaction ledger; verify with controlled stock counts |
| Checkout success rate | Successfully created orders divided by checkout attempts | Order creation API plus attempt/failure telemetry; attempts are not a complete persisted metric today |
| Service availability | Successful health checks divided by all scheduled checks; track response time separately | `GET /api/health` currently checks database connectivity; use deployment monitoring for uptime and latency |
| Catalog availability accuracy | Published products shown as available compared with current server-side stock/variant state | Public product API compared with product and variant inventory data |

Use the admin dashboard’s existing revenue, order, low-stock, and product-sales views for operational reporting. Do not treat dashboard revenue as profit or cash collected; the current dashboard guide defines it from completed orders.

## Deployment Strategy

1. **Development:** use a non-production PostgreSQL database and local `.env.local` values. Keep credentials out of Git.
2. **Preview:** deploy branch changes to Vercel Preview with separate test data and service credentials. Exercise customer, staff, admin, POS, upload, and payment-proof flows without using production records.
3. **Release checks:** run lint, the existing test suite, Prisma schema validation, and the production build. Apply reviewed Prisma migrations to the intended database with `npm run db:migrate:deploy` before relying on new schema fields.
4. **Production:** deploy through Vercel with production-scoped server secrets. The current code uses PostgreSQL through Prisma, Supabase Storage, Upstash Redis for shared controls/realtime support, and Resend or SMTP for email.
5. **Post-deploy checks:** call `/api/health`, then smoke-test login/role boundaries, catalog, cash checkout, wallet proof and review, POS stock movement, order completion, uploads, and reservation expiry.

### Launch configuration gate

The wallet reservation lifetime in code is two hours. The checked-in `vercel.json` schedules `/api/cron/expire-wallet-reservations` once daily (`0 0 * * *`), while the deployment runbook describes a five-minute schedule. Resolve this discrepancy and verify the deployed cron configuration before treating wallet reservation expiry as timely. The cron endpoint also requires `CRON_SECRET`.

The health route currently verifies database connectivity only. Storage, email, Redis, and cron should be validated through the release smoke checks and their provider logs/metrics.

## Phase Roadmap

The roadmap is sequenced by dependency rather than calendar date; the repository contains no estimates or staffing plan.

| Phase | Focus | Exit criteria |
| --- | --- | --- |
| **1. MVP readiness** | Confirm environment separation, migrations, account access, catalog data, storage buckets, and payment configuration | Health check passes; customer can place a cash pickup order; wallet proof can be submitted and reviewed; POS and admin stock changes create expected records |
| **2. Controlled pilot** | Use Preview or a designated pilot environment with staff and test customers; exercise complete order and inventory workflows | Staff can process orders through pickup completion; administrators can investigate order and inventory history; pilot issues and baseline metrics are recorded |
| **3. Production rollout** | Promote the reviewed release to Vercel Production with production-only secrets and database | Migration and smoke-check gates pass; backup/rollback owner and operational contacts are identified; health and provider monitoring are active |
| **4. Stabilization** | Resolve measured reliability and usability gaps in reservation timing, stock freshness, and telemetry | Reservation cleanup matches its TTL; stock visibility and operational metrics meet targets set from pilot baselines |

## Repository Basis

- Customer and admin routes: `src/app/(ecommerce)`, `src/app/(admin)`, and `src/app/api`.
- Roles, orders, inventory, products, settings, events, and reviews: `prisma/schema.prisma`.
- Order status and reservation lifetime: `src/lib/order.ts`.
- Reservation cleanup and schedule: `src/features/inventory/lib/reservation-expiry.ts`, `src/app/api/cron/expire-wallet-reservations/route.ts`, and `vercel.json`.
- Dashboard/storefront behavior: `guides/admin-dashboard-and-storefront.md`.
- Deployment guidance: `operations/deployment-runbook.md`; verify it against `vercel.json` and current source when the two disagree.
