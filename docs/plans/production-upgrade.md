# Production Upgrade Plan

## 1. Executive Summary

### Current architecture

This project is a modular Next.js App Router application for inventory, ecommerce, and admin operations. The system currently centers around a Prisma/PostgreSQL data layer, route handlers in `src/app/api`, shared utilities in `src/lib`, feature logic in `src/features`, and UI in route-based folders under `src/app` plus reusable components under `src/components`.

### Current maturity

The application already contains a broad set of working capabilities:

- ecommerce storefront browsing and order placement
- customer profile and auth flows
- admin dashboard and order management
- inventory transaction tracking
- POS-style sales and inventory deduction behavior
- product variant, review, and catalog support
- analytics endpoints and reporting screens

### Main strengths

- Clear route separation by admin, auth, and ecommerce concerns
- Use of Prisma for type-safe database access
- Centralized Prisma client setup via `src/lib/prisma.ts`
- Inventory transaction logging for stock movement auditability
- Mature set of API routes and support modules
- Strong use of TypeScript and route-oriented architecture

### Main technical risks

- Some business logic is split across route handlers, feature modules, and shared utilities, which increases coordination risk
- Authorization depends on cookie-based JWT validation and server-side checks, but the authentication layer still uses a hardcoded fallback secret in `src/lib/auth.ts`
- Inventory and order logic are highly sensitive and spread across multiple handlers, making consistency harder to audit over time
- Some admin and public-facing logic appears to mix validation, routing, and business rules in the same route files
- Payment approval and order lifecycle logic need a stronger single-source-of-truth pattern to reduce edge-case drift

### Most important improvements

1. Consolidate key business rules into explicit service boundaries
2. Externalize all production secrets and deployment configuration
3. Strengthen transaction boundaries around stock changes and order completion logic
4. Reduce duplicated validation and status logic across order flows
5. Add stronger observability and data integrity checks for order, stock, and payment transitions

---

## 2. Current Architecture

```text
Next.js App Router
   │
   ├── Ecommerce UI
   │     ├── storefront pages
   │     ├── checkout flow
   │     ├── profile and orders
   │     └── public catalog APIs
   │
   ├── Admin UI
   │     ├── dashboard
   │     ├── orders
   │     ├── products
   │     ├── inventory
   │     ├── analytics
   │     └── settings
   │
   ├── Auth UI
   │     ├── login/register
   │     ├── password reset
   │     └── email verification
   │
   └── API Layer
         ├── src/app/api/admin/**
         ├── src/app/api/auth/**
         ├── src/app/api/public/**
         └── health endpoints

               ↓

          Business Logic
               ├── src/lib
               ├── src/features
               ├── src/services
               └── src/utils

               ↓

             Prisma ORM

               ↓

           PostgreSQL / Prisma Data Store
```

### Real architecture findings

This project is not a microservice system; it is a modular monolith structured around Next.js route groups and Prisma. That is a valid and maintainable architecture for its current scope, but its business logic is not fully centralized behind explicit domain boundaries.

Key architecture characteristics:

- UI routes live in `src/app`
- Shared logic is in `src/lib`
- Feature-specific rules live in `src/features`
- Inventory, order, product, and payment logic are spread across route handlers and helper modules
- Database access is performed directly in API routes and utility functions via `prisma`
- Authentication is JWT-based and cookie-backed via `src/lib/auth.ts`

---

## 3. Current Project Structure

```text
apc-inventory/
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   ├── (auth)/
│   │   ├── (ecommerce)/
│   │   ├── api/
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── admin/
│   │   ├── ecommerce/
│   │   ├── layout/
│   │   └── ui/
│   ├── features/
│   │   ├── auth/
│   │   ├── cart/
│   │   ├── catalog/
│   │   └── inventory/
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── cookies.ts
│   │   ├── order.ts
│   │   ├── prisma.ts
│   │   ├── logger.ts
│   │   ├── storage/
│   │   └── other utilities
│   ├── types/
│   ├── utils/
│   └── validators/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
├── scripts/
├── tests/
├── middleware.ts
├── next.config.ts
├── package.json
├── tsconfig.json
├── .env / .env.local
└── README.md
```

### Role of the current folders

- `src/app`: route-based pages and API handlers
- `src/components`: reusable UI blocks
- `src/features`: feature-domain logic and coordination
- `src/lib`: shared server-side utilities and auth/database wrappers
- `src/types`: contracts and shared type definitions
- `src/utils`: formatting and utility helpers
- `prisma`: database schema and migration history
- `scripts`: automation and setup scripts
- `tests`: regression and behavior verification

---

## 4. Database Assessment

### Models and major relationships

The schema in `prisma/schema.prisma` defines a production-oriented inventory and commerce app with the following major entities:

- `User`
- `Product`
- `Category`
- `ProductVariant`
- `ProductGroup`
- `ProductGroupItem`
- `Order`
- `OrderItem`
- `InventoryTransaction`
- `Cart` and `CartItem`
- `AppSetting`
- `ProductReview`
- `ActivityLog`
- `RateLimitEntry`

### Core schema notes

#### Products and variants

- Products support categories and multiple variants
- Variant inventory is tracked separately from product inventory
- Product group logic exists for grouped products and variant-style bundling
- Variant and product stock fields are central to inventory correctness

#### Orders

- `Order` contains status, payment status, payment method, total, customer, and pickup data
- `OrderItem` models each ordered product entry, including quantity and subtotal
- Order lifecycle is strongly tied to status transitions and payment transitions

#### Inventory transactions

- `InventoryTransaction` is the audit trail for stock movement
- It retains fields for `paymentMethod`, `paymentStatus`, `paymentReference`, and `orderNumber`
- This is a good pattern for auditing and traceability, but it also means inventory records carry payment metadata that may need stricter lifecycle rules

#### Enums and status systems

- `OrderStatus`: `PENDING_PAYMENT`, `PENDING`, `CONFIRMED`, `PREPARING`, `READY_FOR_PICKUP`, `COMPLETED`, `CANCELLED`
- `PaymentStatus`: `PENDING`, `PAID`, `FAILED`, `CANCELLED`
- `PaymentMethod`: `CASH`, `GCASH`, `PAYMAYA`

### Current data integrity strengths

- Strong Prisma schema typing
- Use of enums for critical status fields
- Unique indexes on important identifiers such as order number and idempotency key
- Inventory transactions are kept as an explicit audit trail

### Current integrity risks

- The order lifecycle depends on status transitions across multiple places, increasing risk of drift
- Some order creation flows and admin update flows carry duplicated status logic
- The schema supports optional customer relations and optional payment values, which can make incomplete order states harder to reason about
- Payment and inventory states are not always enforced in a single rule path

### Inventory architecture assessment

The project currently has a single explicit inventory ledger via `InventoryTransaction`, which is a good source-of-truth pattern for movement history. However, stock updates themselves are executed in several route and helper flow paths, which creates risk that future changes may mutate stock inconsistently unless the same movement API is used consistently.

### Key improvement recommendation

The schema is already aligned with a transaction-first inventory model. The most valuable future improvement is to consolidate all stock-changing operations behind a stronger, explicit domain service and enforce invariant checking at one boundary.

---

## 5. Backend Assessment

### API structure

The application has route groups for:

- `src/app/api/admin/**`
- `src/app/api/auth/**`
- `src/app/api/public/**`
- health and utility endpoints

### Business logic placement

Current business logic is distributed across:

- route handlers in `src/app/api`
- shared utilities in `src/lib`
- feature logic in `src/features/inventory/lib/inventory.ts`
- order helpers in `src/lib/order.ts`

This is workable but creates coupling between route orchestration and domain rules.

### Authentication and authorization

Authentication is cookie-based with a JWT secret in `src/lib/auth.ts`. The access control pattern is consistent, but there are important considerations:

- hardcoded fallback secret is not production-safe
- admin authorization checks are performed server-side via token verification and user role lookup
- UI role checks are informative but not sufficient as the real security layer

### Validation

Validation occurs in a few places:

- route-level checks in API handlers
- business helper validators in `src/lib/order.ts`
- inventory movement safety checks in `src/features/inventory/lib/inventory.ts`

This is a reasonable pattern, but some validation logic is duplicated across admin and auth order routes.

### Transactions

The application does use Prisma transactions for sensitive inventory and order operations, which is a strong production practice. Notable examples include:

- order creation with item creation and stock reservation
- order status updates with inventory movement decisions
- walk-in order creation and stock deduction

### Error handling

The project has structured logging and user-facing error handling patterns, especially in admin API routes. This is a good start for production readiness, but it should be standardized across all endpoints.

### Current backend risks

- Business logic appears in multiple places instead of a single domain entry point
- Some route files are quite large and combine validation, orchestration, transaction logic, and response handling
- Not all payment and status flows share the same source-of-truth interpretation
- Duplicate status logic can create differing behavior across admin and customer endpoints

---

## 6. Frontend Assessment

### Frontend architecture

The frontend uses Next.js App Router with route groups:

- `(admin)` for admin power-user flows
- `(auth)` for account and access flows
- `(ecommerce)` for storefront and customer interactions

This is a clean separation for a small-to-medium business application.

### Reusability

The project has reusable UI structures in `src/components`, including:

- admin screens
- ecommerce cards and product display features
- layout and generic UI tokens

### Data fetching and state

Frontend data fetching commonly uses `fetch()` from browser components and `useEffect`-driven data loading. This is acceptable for an App Router app in a moderate-sized project, but it places more responsibility on each component to manage loading, empty states, and error recovery.

### Maintainability concerns

The more critical maintainability issue is not visual design, but code volume and responsibility clustering. Larger route components handle large amounts of data, state, filtering, and rendering logic.

### Future recommendation

Keep the current route-based structure, but establish clearer component boundaries so page-level data orchestration does not become too coupled to UI rendering logic.

---

## 7. Security Assessment

| Area                | Current State                                             | Risk                                                            | Recommended Improvement                                                                   | Priority |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| JWT auth            | Cookie-based token validation exists in `src/lib/auth.ts` | Secret fallback is not production-safe                          | Move JWT secret to a secure deployment secret store and enforce non-default configuration | High     |
| Admin authorization | Role-based checks exist server-side                       | Route logic may still drift if access rules duplicate elsewhere | Centralize admin access checks behind shared server-side guards                           | High     |
| Input validation    | Some validation exists, especially for order payloads     | Validation is not uniformly centralized across all routes       | Standardize request validation into shared validators and enforce at all API boundaries   | High     |
| File uploads        | Storage logic exists under `src/lib/storage`              | Upload handling must be validated for format and size controls  | Add explicit upload security policy and validation enforcement                            | High     |
| Payment flows       | Payment approval and order lifecycle logic exist          | Risk of inconsistent payment-state transitions                  | Consolidate payment-state transitions into a single domain workflow                       | High     |
| Error exposure      | User-facing errors are partially normalized               | Technical error text may leak in some flows                     | Use standard safe error mapping across all routes                                         | Medium   |
| Secrets & config    | `.env` usage is present                                   | Production config could be weakly managed                       | Enforce environment validation and secret rotation policy                                 | High     |

---

## 8. Performance Assessment

| Area                 | Current Implementation                                             | Issue                                                         | Recommended Improvement                                                         | Priority |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Database queries     | Prisma queries are used widely across route handlers               | Some endpoints may perform multiple queries in sequence       | Consolidate complex reads into single queries and efficient `include` selection | Medium   |
| Inventory operations | Inventory updates and transaction logs occur on order changes      | Complex order flows can increase query count under heavy load | Standardize order processing into single transaction-heavy workflows            | High     |
| UI data loading      | Client-side fetches are used for many admin and storefront screens | Repeated fetches may create churn in large datasets           | Add stronger cached/fetch strategies and pagination-aware patterns              | Medium   |
| Product filtering    | Search and category filters are computed client-side or via API    | Large catalog datasets may get expensive                      | Add index-aware queries and server-side filtering optimization                  | Medium   |
| Images               | Public uploads and remote patterns are configured                  | Large image payloads can create slower pages if unoptimized   | Use image optimization and stricter media constraints                           | Medium   |
| Analytics            | Reporting and aggregation are computed likely by query sets        | Reporting may grow expensive with more order history          | Use aggregation tables or scheduled summaries when scale grows                  | Medium   |

---

## 9. Maintainability Assessment

### Areas to monitor

- `src/app/api/admin/orders/route.ts` is large and combines validation, business policy, stock logic, and mutation handling
- `src/app/api/auth/orders/route.ts` also mixes request validation, business logic, and inventory movement execution
- `src/lib/order.ts` is central and useful, but it can become overloaded if more payment and lifecycle rules are added
- `src/features/inventory/lib/inventory.ts` will remain important and should become a clear service boundary as complexity grows

### Duplicated or coupled patterns

- Order status progression rules are used across different endpoints and screens
- Payment status semantics are interpreted in multiple places
- Inventory movement actions and transaction creation logic are sensitive and should be more centralized

### Recommended future structure

A cleaner boundary would be:

- API routes handle request/response only
- domain services handle state transitions and business validation
- Prisma access remains in data access layer modules
- shared rule helpers are narrowed and versioned

---

## 10. Scalability Assessment

The current architecture can support moderate business scale, but the following patterns will need attention as volume grows:

### Products

- Product counts will grow, making product listing queries and variant-heavy catalog requests heavier
- Catalog filtering and sorting should be server-optimized and index-aware

### Variants

- Variant combinatorics and stock synchronization can become expensive if inventory logic is not centralized
- Product group and variant metadata should be carefully profiled as catalog size grows

### Customers and orders

- Order volume and lifecycle transitions can create heavier transaction pressure, particularly around stock deduction and fulfillment events
- A single unified order service will reduce drift and risky branching logic

### Inventory transactions

- Inventory transaction tables can become very large over time
- Historical reporting queries and analytics should be designed with archival or summary strategies in mind

### Analytics

- Reporting dashboards and aggregate metrics can become expensive if they are computed on demand over very large transaction history
- Summary tables or aggregation jobs may become necessary at scale

### Images and uploaded files

- The app stores and serves uploaded media through storage abstractions, which is scalable if limits and optimization are enforced
- Storage policies should be explicit for size, format, and lifecycle

---

## 11. Production Readiness Checklist

| Area                      | Status             | Notes                                                                                  |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Authentication            | Partially ready    | Server-side validation exists, but secret handling needs hardening                     |
| Authorization             | Partially ready    | Role checks exist but should be standardized across routes                             |
| Validation                | Partially ready    | Some validation is present but not uniformly centralized                               |
| Database integrity        | Ready              | Prisma schema and constraints are strong enough for the current scope                  |
| Transactions              | Partially ready    | Transaction logic exists but should be standardized for all critical flows             |
| Inventory consistency     | Partially ready    | Strong movement ledger exists; consistency depends on route discipline                 |
| Error handling            | Partially ready    | Logging exists, but should be consistent across all modules                            |
| Logging                   | Partially ready    | Some logging is present; observability should be expanded                              |
| Security                  | Partially ready    | Role checks and validation exist; secret and upload hardening remain                   |
| Backups                   | Missing            | Must be defined for production deployment                                              |
| Migrations                | Needs verification | Migration discipline is present but deployment process must be documented              |
| Environment configuration | Needs improvement  | Production secret handling must be standardized                                        |
| Performance               | Partially ready    | Works for moderate scale, but needs query optimization and profiling                   |
| Testing                   | Partially ready    | There are tests, but broader regression coverage for critical flows should be expanded |
| Deployment                | Needs verification | Production deployment process requires explicit verification                           |

---

## 12. Recommended Target Architecture

### Preferred direction

The project should remain a modular monolith, not a microservices architecture.

```text
Presentation Layer
   ├── App Router pages
   ├── route-group UIs
   └── reusable components

         ↓

Application Layer
   ├── API routes
   ├── request validation
   └── controller-style orchestration

         ↓

Domain / Business Logic
   ├── order service
   ├── inventory service
   ├── payment service
   ├── product service
   └── auth policy layer

         ↓

Data Access Layer
   ├── Prisma repositories / services
   ├── storage adapters
   └── shared queries

         ↓

PostgreSQL / storage backend
```

### Why this is the right target

- The project already has a coherent monolith structure
- The business domain is sufficiently integrated to benefit from a single codebase
- A microservice architecture would add operational cost without a demonstrated need
- A modular monolith keeps maintainability high and reduces migration risk

---

## 13. Recommended Module Boundaries

The actual project already has the right conceptual grouping. The future improvement should be to reinforce boundaries rather than rework the app into a different architecture.

### Recommended modules

- Authentication and user access
- Product catalog and product variants
- Inventory management and stock movement
- Orders and payment lifecycle
- POS / walk-in sales
- Reporting and analytics
- Settings and platform configuration
- Storage / media handling

### Communication rules

- UI components should not directly manipulate Prisma or core inventory logic
- API routes should orchestrate, not own all business logic
- Domain services should own stock and order invariants
- Analytics should read from consistent, normalized data sources
- Storage and auth should remain behind explicit adapters

---

## 14. Production Upgrade Roadmap

### Phase 1 — Critical stability

- Harden authentication secret handling
- Define a single, validated order lifecycle policy
- Enforce consistent stock invariants and transaction safety
- Centralize error handling and user-safe responses

### Phase 2 — Architecture cleanup

- Create clear domain services for orders, inventory, and payments
- Reduce duplicate logic in route handlers
- Standardize validation patterns across routes
- Move sensitive logic away from UI-facing or ad hoc helper structures

### Phase 3 — Performance and query tuning

- Profile the slowest inventory and reporting queries
- Add appropriate indexes for order and catalog filters
- Review large listing endpoints for pagination and filtering efficiency

### Phase 4 — Security hardening

- Validate and restrict upload handling
- Review all admin routes for least-privilege enforcement
- Standardize environment and secret management
- Add deployment and runtime logging policies

### Phase 5 — Production operations

- Define deployment checklist and rollback plan
- Set up backup and restore process
- Define migration rollout and verification steps
- Configure external monitoring and alerting

---

## 15. File-by-File Upgrade Plan

### File: `src/lib/auth.ts`

Current problem:

- JWT secret uses a fallback value for local development.

Why it matters:

- Production secrets must not be mounted to a code default.

Recommended change:

- Require a secure environment secret in production and fail fast if missing.

Dependencies:

- deployment environment configuration
- middleware and API route behavior

Risk:

- Medium

Priority:

- High

### File: `src/lib/order.ts`

Current problem:

- Order lifecycle and payment logic are centrally useful but spread across route-driven status logic.

Why it matters:

- Rule drift can create inconsistent status transitions across customer and admin flows.

Recommended change:

- Keep the helper file but formalize a single order state transition service and align all callers to it.

Dependencies:

- admin and auth order routes
- inventory movement logic

Risk:

- Medium

Priority:

- High

### File: `src/features/inventory/lib/inventory.ts`

Current problem:

- Inventory movement is highly critical and should be treated as a dedicated domain service.

Why it matters:

- Stock integrity is one of the biggest production risks in any commerce application.

Recommended change:

- Keep the movement logic but tighten it behind a singular invariant validation and audit pattern.

Dependencies:

- order creation/update flows
- POS order processing paths
- inventory transaction auditing

Risk:

- High

Priority:

- High

### File: `src/app/api/admin/orders/route.ts`

Current problem:

- This route handles large amounts of order orchestration, validation, and stock logic.

Why it matters:

- Route files become harder to reason about as the business grows.

Recommended change:

- Refactor to delegate inventory/order transitions to services while keeping routes as thin HTTP-specific adapters.

Dependencies:

- inventory and order helper layers
- admin UI behavior

Risk:

- High

Priority:

- High

### File: `src/app/api/auth/orders/route.ts`

Current problem:

- Authenticated customer order creation and status update logic is mixed with request validation and stock updates.

Why it matters:

- Customer and admin flows should share the same core rules to prevent drift.

Recommended change:

- Unify state transition rules with the same service logic used by admin order updates.

Dependencies:

- `src/lib/order.ts`
- inventory logic

Risk:

- High

Priority:

- High

### File: `prisma/schema.prisma`

Current problem:

- The schema is solid but should be reviewed periodically as the system grows.

Why it matters:

- More order volume and product complexity will demand stronger query and integrity patterns.

Recommended change:

- Add or validate indexes and constraints as usage patterns mature; keep schema evolution intentional.

Dependencies:

- database performance analysis
- deployment migration planning

Risk:

- Medium

Priority:

- Medium

---

## 16. Do Not Break Existing Functionality

Future upgrades must preserve these current responsibilities:

- existing ecommerce storefront behavior
- existing admin management modules
- existing inventory transaction audit patterns
- existing order lifecycle behavior and pickup workflow
- existing POS and walk-in order logic
- existing authentication flows with role separation
- existing payment approval logic for online transactions
- existing analytics and reporting routes

The upgrade should be incremental and verifiable. No future change should rewrite entire systems without a documented reason.

---

## 17. Upgrade Rules for Future Implementation

### Rule 1

Inspect before modifying.

### Rule 2

Make one logical change at a time.

### Rule 3

Do not rewrite working modules without a documented reason.

### Rule 4

Do not introduce unnecessary dependencies.

### Rule 5

Do not duplicate business logic.

### Rule 6

Business-critical operations must be server-controlled.

### Rule 7

Inventory-changing operations must be transaction-safe.

### Rule 8

Use the database as the source of truth.

### Rule 9

Do not trust client-side validation for security.

### Rule 10

Do not expose sensitive information.

### Rule 11

Prefer simple architecture over unnecessary complexity.

### Rule 12

Every structural change must have a clear reason.

### Rule 13

Run appropriate validation and tests after each future change.

### Rule 14

Do not modify unrelated functionality.

### Rule 15

Preserve existing routes and contracts unless a breaking change is explicitly approved.

---

## Final Audit Position

This project is already a practical, working application with a solid foundation for a modular monolith. The most important production-readiness gaps are not a lack of functionality—they are disciplined governance around secure configuration, transaction boundaries, duplicated business logic, and clearer service layering.

The future upgrade should focus on a disciplined architectural cleanup rather than a large rewrite. The best path is to strengthen the current structure by centralizing critical rules, protecting stock integrity, and making deployment and observability explicit.
