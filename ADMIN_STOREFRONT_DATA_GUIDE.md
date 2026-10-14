# Admin Dashboard and Storefront Data Guide

This guide explains what each major screen is for, what its cards and tables represent, and where their values come from. Paths below are the actual application routes and APIs.

## Data Flow at a Glance

- Admin and customer records live in PostgreSQL through Prisma. APIs are the source of truth for orders, prices, payment state, inventory, roles, and profile data.
- The storefront catalog is served by public catalog APIs. Only products with `PUBLISHED` status and active products/variants are exposed for sale.
- The customer cart (`apc-cart`) and cached profile display (`apc-user`) are browser localStorage. Cart prices and quantities are provisional; checkout/order APIs validate current server data.
- Product/customer photos and payment QR images are stored through the configured Supabase storage buckets. Wallet account names/numbers and QR paths are stored in `AppSetting`.
- Static labels, explanatory text, icons, and the home hero image are presentation assets, not live business metrics.

## Admin Dashboard

Route: `/dashboard`

Profile greeting comes from `/api/admin/profile`. Metrics and charts come from `/api/admin/analytics` with the chosen date range. The dashboard refreshes about every 30 seconds and when the tab becomes visible. `Print Report` formats the currently loaded dashboard stats in the browser; it does not run a separate report query.

### KPI Cards

| Card                      | What it means                                                                             | Data source / calculation                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revenue / Today's Revenue | Gross revenue for the chosen period; the label says “Today's Revenue” for the Daily range | `Order.totalAmount` summed for `status = COMPLETED`, filtered by `createdAt` for the range. Pending, cancelled, and other incomplete orders do not count.       |
| Orders                    | Active orders in the selected order-created period                                        | Orders whose status is neither `COMPLETED` nor `CANCELLED`. The smaller pending/completed figures beside it are separate today-only counts.                     |
| Low Stock Alerts          | Product or variant balances at/below their own minimum stock                              | `Product.stock <= minStock` for simple products and active variant stock compared with each variant's `minStock`. The dashboard endpoint returns the lowest 10. |
| Total Products            | Number of product records                                                                 | Prisma product count. This is product records, not total units or variant count.                                                                                |

### Supporting Values and Panels

- **Total Inventory Cost:** current on-hand quantity multiplied by unit cost; for variant products, sums active variants' `cost * stock`.
- **Total Retail Value:** current on-hand quantity multiplied by retail price; for variant products, sums active variants' `price * stock`.
- **Active Customers:** all users whose role is `CUSTOMER`. The current count does not additionally filter blocked accounts.
- **Total Units Sold:** sum of item quantities in completed orders in the selected period.
- **Revenue Overview:** daily or monthly buckets of completed-order revenue for the selected range; values use order `totalAmount` and `createdAt`.
- **Top Selling Products:** up to five products ranked by completed sales revenue, with units, order-line count, image, and category. Revenue uses completed `OrderItem.subtotal`.
- **Sales by Category:** completed item subtotals and units grouped by the product's category; uncategorized items use “Uncategorized”.
- **Today's Overview:** pending, completed, and cancelled orders created today. These are not filtered by the selected dashboard range.
- **Low Stock Items:** up to seven threshold warnings, linked to Inventory. “Critical” in the KPI is a client-side classification of in-stock items at 40% or less of their minimum threshold.
- **Quick Actions:** navigation links to inventory add-product flow, orders, and reports; these are not data cards.

## Admin Sections

| Route / section                                | Purpose and visible content                                                                                                                                                                                                                                                                    | Data source                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin-orders` — Orders                       | Searchable, paginated order list; status tabs/counts; pickup-date filters; customer, items, totals, payment state/proof, and pickup details. Status controls advance fulfillment. Online wallet orders can be approved/declined when eligible; pickup sheets and labels print filtered orders. | GET/PUT `/api/admin/orders`; payment actions POST `/api/admin/payments/approve` and `/api/admin/payments/decline`. The API loads order, item, variant, and customer records from Prisma; proof URLs are resolved for viewing.                                                                                         |
| `/pos` — Point of Sale                         | In-store product/variant search, stock-aware cart, quantity controls, cash tender/change, order confirmation, and printable receipt.                                                                                                                                                           | Product catalog and stock from `/api/admin/products`; employee identity from `/api/auth/profile`; order creation through POST `/api/admin/orders`. The server checks current stock and creates the walk-in order.                                                                                                     |
| `/products` — Products                         | Admin catalog list, filters/search, simple/variant products, pricing/cost/stock, edit/archive/delete and image/variant management.                                                                                                                                                             | `/api/admin/products`, `/api/admin/variants`, and `/api/admin/products/upload`; categories are product relations. Paginated product rows can be filtered, while the API summary is computed over the catalog.                                                                                                         |
| `/products/add` — Add Product                  | Product image, identity/details, category, price/cost, inventory, and optional variant setup.                                                                                                                                                                                                  | Categories from `/api/admin/categories`; create via POST `/api/admin/products`; images via `/api/admin/products/upload`.                                                                                                                                                                                              |
| `/categories` — Categories                     | Category directory, search, create/edit/delete form. Categories organize products and storefront filtering.                                                                                                                                                                                    | GET/POST/PUT/DELETE `/api/admin/categories`; public category names/IDs come from `/api/public/categories`.                                                                                                                                                                                                            |
| `/inventory` — Inventory                       | Stock overview and summary cards, product/category filters, stock-in/out/adjustment, thresholds, variants, and product management.                                                                                                                                                             | Product rows and summary from `/api/admin/products`; mutations and audit rows via `/api/admin/inventory`; variants and uploads use their admin APIs. Cost valuation is current cost × on-hand stock, not sales revenue.                                                                                               |
| `/inventory/transactions` — Transaction Ledger | Search/filter/paginate/export stock movement and reservation history; archive/restore actions. Rows show product/variant, type, quantity, before/after balance, actor, source, order/payment metadata, and remarks when recorded.                                                              | GET/PATCH `/api/admin/inventory`; underlying `InventoryTransaction` rows. Export requests the same endpoint with export parameters.                                                                                                                                                                                   |
| `/customers` — Customers                       | Customer directory, search/filter/pagination, account verification/block state, contact details, purchase metrics, and edit/block actions.                                                                                                                                                     | `/api/admin/customers`; customer/order metrics are aggregated server-side from `User` and `Order`. Customer profile updates use PUT on that endpoint.                                                                                                                                                                 |
| `/analytics` — Analytics                       | Range selector and custom dates; gross revenue, average order value, fulfillment rate, inventory capital; revenue trend, POS-vs-ecommerce split, category and product sales, stock movement/health.                                                                                            | `/api/admin/analytics`. Shares the same server calculations as the dashboard but presents a fuller breakdown. AOV = completed revenue / completed orders. Fulfillment rate = completed / non-cancelled orders in the period. Channel split uses `isWalkIn` on completed orders.                                       |
| `/reports` — Reports                           | All-in-one, inventory, sales, low-stock, and top-products reports; date/category filters; detailed ledgers and exports/print views.                                                                                                                                                            | `/api/admin/reports`. Sales and payment/channel breakdowns use completed orders; top products use completed order-item quantities/subtotals. Inventory valuation uses current stock × cost or retail price. Its top-products ordering is by units sold (the dashboard/analytics top-products view is revenue-ranked). |
| `/admin-settings` — Settings                   | Tabs for administrator profile/avatar, store identity/currency, wallet receiving details and QR images, security/password, and (ADMIN only) team accounts/roles/blocking.                                                                                                                      | `/api/admin/profile`, `/api/admin/profile/upload`, `/api/admin/profile/password`, `/api/admin/settings`, `/api/admin/payment-qr/upload`, and `/api/admin/users`. Store and payment settings are `AppSetting`; account/team information is `User`.                                                                     |

### Revenue and Inventory Terms

- **Revenue / Gross Revenue** is completed-order gross sales, not cash deposited, profit, or all orders placed. It uses order totals.
- **Product/category sales revenue** uses completed order-item subtotals. It can differ slightly from order totals if order-level adjustments exist.
- **Inventory Capital / Cost Value** is current stock at recorded cost. **Retail Value** is current stock at listed selling price. Neither is revenue.
- **Status counts** may use different time bases: selected-period counts use order creation date; “today” counts use today's creation date; pickup views filter the scheduled pickup date.

## Storefront

### Home / Catalog (`/`)

- The banner, store copy, and benefit strip are static content/assets.
- Catalog products come from GET `/api/public/products`, filtered to published/active products; category filters are populated from GET `/api/public/categories`.
- Search, category selection, pagination/load-more, and grid/list mode change the client query/view. Product cards show current catalog price, image, SKU, stock/availability, and variant choices from the API response.
- Add-to-cart writes a snapshot of product/variant ID, display name, price, stock, and quantity into localStorage (`apc-cart`). The snapshot is for the UI only; the server validates the order later.

### Product Detail (`/products/[id]`)

- Main product and variant details are loaded by product ID from `/api/public/products`; related items use the public product catalog API.
- Ratings/reviews and review pagination come from `/api/public/products/reviews`. Whether the current user can review is determined server-side from completed purchases and existing reviews.
- Add-to-cart/buy-now updates local cart state; it does not reserve stock or finalize a sale.

### Cart (`/cart`)

- Cart lines/subtotal are read from localStorage (`apc-cart`); quantities and removal update that local draft.
- The page fetches `/api/auth/profile` to refresh the cached profile and identify missing contact details. The local user cache is not proof of authentication.
- “Proceed to checkout” starts prefetching `/api/auth/checkout-data`; a signed-in user proceeds to checkout, otherwise to registration.

### Checkout (`/checkout`)

- Cart contents still originate in localStorage, while profile and wallet settings arrive together from `/api/auth/checkout-data`.
- Pickup name/phone, optional pickup date/time, and Cash/GCash/Maya selection are submitted to POST `/api/auth/orders`. The server re-reads products/variants, prices, availability, profile eligibility, and stock before creating an order; the browser subtotal is not trusted as the charge amount.
- Cash orders enter the normal order workflow. GCash/Maya create a time-limited stock reservation; wallet recipient name/number/QR comes from `AppSetting`. Receipt images upload through `/api/auth/payment-proof` and are attached only to the owner's eligible order.

### Order History (`/orders`)

- The page fetches `/api/auth/orders`, which scopes results to the authenticated user ID. It shows statuses, pickup schedule, totals, line items, payment state, reservation expiry, and proof upload where appropriate.
- Status tabs/search-like controls filter the fetched list in the browser. Cancel, proof upload, and review actions call their respective server APIs; “Buy again” copies a prior line to local cart using current displayed details, then checkout revalidates.

### Customer Profile (`/profile`)

- `/api/auth/profile` is the server source for name/contact/address/avatar/verification state. A local `apc-user` cache may render quickly but is refreshed from the API.
- Profile/photo changes use `/api/auth/profile` and `/api/auth/profile/upload`; account deletion requires server-side email/password confirmation.
- Theme preference is localStorage (`apc-theme`), not an account or authentication setting.

## Useful Source Files

- Dashboard metrics: `src/app/(admin)/dashboard/page.tsx` and `src/app/api/admin/analytics/route.ts`
- Orders and state transitions: `src/app/(admin)/admin-orders/page.tsx` and `src/app/api/admin/orders/route.ts`
- Reports: `src/app/(admin)/reports/page.tsx` and `src/app/api/admin/reports/route.ts`
- Catalog/product model: `src/app/api/public/products/route.ts`, `src/app/api/admin/products/route.ts`, and `prisma/schema.prisma`
- Cart storage: `src/features/cart/lib/cart.ts`
- Checkout validation: `src/app/api/auth/orders/route.ts`
