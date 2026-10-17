# System architecture

This diagram describes the deployed Apayao Pasalubong Center app as a three-tier system: the browser-facing storefront and admin pages, the Vercel-hosted Next.js application, and the database and supporting services.

![Three-tier system architecture diagram](system-architecture.svg)

## Editable diagram

```mermaid
flowchart TB
  subgraph presentation[Presentation Layer]
    direction LR
    users[Users<br/>Administrator · Staff · Customer]
    internet((Internet))
    frontend[Next.js Frontend on Vercel<br/>App Router pages and components]
    storefront[Customer Storefront<br/>Catalog · Cart · Checkout · Orders · Profile]
    staff[Staff Pages<br/>POS · Products · Profile and security]
    admin[Admin Pages<br/>Dashboard · Orders · Products · Inventory<br/>Categories · Customers · Analytics · Reports · Settings]
    users --> internet --> frontend
    frontend --> storefront
    frontend --> staff
    frontend --> admin
  end

  subgraph application[Application Layer]
    direction LR
    cron[Vercel Cron<br/>Reservation-expiry task]
    api[Next.js API Routes<br/>Vercel server functions]
    auth[Authentication and Authorization<br/>JWT cookies · Session checks · Role-based access]
    logic[Business Logic<br/>Catalog · Inventory · POS · Orders · Payments<br/>Customers · Analytics · Reports]
    limits[Validation and Rate Limiting<br/>Request schemas · Upstash / database limits]
    cron -->|Scheduled HTTPS call| api
    api --> auth
    api --> logic
    api --> limits
  end

  subgraph data[Data Layer]
    direction LR
    prisma[Prisma ORM<br/>Data access from API routes]
    postgres[(PostgreSQL<br/>Users · Products · Inventory · Orders<br/>Carts · Reviews · Transactions · Settings)]
    services[Supporting Services<br/>Supabase Storage · Upstash Redis<br/>Resend API or SMTP]
    prisma <-->|Database connection over TLS| postgres
  end

  frontend -->|HTTPS requests| api
  api -.->|Server-Sent Events| frontend
  api -->|Prisma Client| prisma
  api -->|HTTPS service APIs| services
```

The deployed Next.js app serves customer, staff, and administrator experiences and handles API requests in Vercel server functions. Prisma accesses PostgreSQL; the application also calls Supabase Storage for product, profile, review, and payment media, Upstash Redis for shared rate limits, revoked token IDs, and live-event relay, and Resend or SMTP for account and payment emails.

Vercel Cron calls the reservation-expiry endpoint on its configured schedule. Wallet payments are recorded as orders and reviewed by staff; 
