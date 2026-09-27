# APC Inventory repository instructions

## Project overview

- This repository is a Next.js App Router inventory and sales management system.
- The main app is split into admin, auth, and ecommerce routes under src/app.
- API handlers live in src/app/api and should keep database access and validation logic close to the route.
- Shared business logic should live in src/lib, while reusable UI should live in src/components.

## Folder purpose map

- src/app: route-level pages, layouts, and API endpoints for the application.
- src/components: reusable UI components grouped by feature area such as admin, ecommerce, layout, and ui.
- src/lib: shared application utilities and helper modules such as auth, cart, cookies, and Prisma client access.
- src/constants: shared constant values, enum-like definitions, status labels, and static configuration.
- src/context: React context providers for global application state such as auth, cart, or settings.
- src/hooks: reusable custom React hooks.
- src/services: higher-level API or domain service wrappers used by components or pages.
- src/store: global state management files such as Zustand/Redux stores when needed.
- src/types: shared TypeScript interfaces, types, and DTO definitions.
- src/utils: small reusable helper functions and formatter utilities.
- src/validators: Zod schemas and input validation logic for forms and API requests.
- public: static assets such as icons, images, logos, and uploaded files.

##Conventions for future changes

- Prefer keeping feature-specific code in the nearest matching folder.
- Keep server-side logic in src/lib or route handlers, not in components.
- Use src/validators for request validation and src/types for shared data contracts.
- When a new reusable helper is needed, place it in the most specific existing folder instead of creating a new top-level area without intent.
- Keep the folder structure consistent with the app’s admin/ecommerce split and the current Next.js App Router architecture.

## AI behavior and audit constraints

- Default to documentation, analysis, and recommendations unless the user explicitly asks for code changes or implementation work.
- During audit, inspection, or production-readiness review tasks, do not modify application logic, database schema, API behavior, UI logic, or business rules unless the user explicitly instructs otherwise.
- Prefer creating documentation files such as upgrade plans, audit notes, risk assessments, or checklists over changing working code during review-only tasks.
- If a user asks for a fix or implementation, perform the relevant code changes only after confirming the exact requirement and scope.
- Preserve current production behavior during audit-only work and avoid unnecessary refactors or cleanup that are not requested.
- When preparing audit output, clearly distinguish between findings, recommendations, and future implementation work; do not mix inspection-only conclusions with unapproved code changes.

## Admin payment approval UI guidance

- The admin payment approval flow belongs in the admin orders dashboard and should follow the workflow described in ADMIN_PAYMENT_UI_GUIDE.md.
- For online payment methods such as GCash or PayMaya, show the approval action only when the order is in a valid review state: payment status is PAID and order status is PENDING_PAYMENT.
- Do not show payment approval buttons for cash orders; cash orders should follow the confirm/complete flow instead of a payment approval flow.
- If payment is pending, failed, or cancelled, keep the payment state visible but do not allow approval.
- The UI must reflect the server-backed payment and order state accurately, never assume client-side values are valid.
- Do not change the meaning of payment status badges or order status labels without updating the business logic and the UI guide together.
- Keep payment approval distinct from general order confirmation: approval is for online payment verification, while confirmation is for order progression or cash settlement.
- Cash payment must not be treated as paid before the order reaches completion; the effective cash payment status should remain pending until the order is completed.
- For future implementation work, prefer a single source of truth for order lifecycle rules instead of duplicating logic between UI, route handlers, and shared helpers.
