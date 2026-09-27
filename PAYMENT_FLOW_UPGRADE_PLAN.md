# Payment Flow Upgrade Plan

## 1. Objective

This document records the future implementation plan for the payment flow as designed in the security architecture. It is intentionally a planning artifact for later work and does not change current application behavior.

The goal is to enforce a consistent, secure order lifecycle for all payment methods:

- Cash orders remain pending until the order is completed
- Online wallet orders require proof of payment
- Online payment must be approved before the order proceeds beyond pending states
- Inventory movement and fulfillment should remain tied to verified status transitions

---

## 2. Current Design Goal

The desired behavior is:

1. Customer places an order
2. The server calculates and validates the order
3. For wallet payments, the customer provides proof of payment
4. The order remains in a payment-review state until an admin approves or rejects it
5. Inventory is not treated as safely reduced until payment is properly validated and order state is approved
6. Cash orders do not become fully paid until the order is marked completed

This is the correct business rule for a storefront that must protect stock, prevent fraud, and retain a clear audit trail.

---

## 3. Business Rules to Preserve

### Cash flow

- Cash orders should not be marked as `PAID` immediately just because they start
- A cash order should remain `PENDING` until the order is actually completed
- When the order reaches `COMPLETED`, the effective payment status may become `PAID`

### Online wallet flow

- Wallet orders should require proof of payment before submission
- The payment status should remain pending until approval
- The order should not move into fulfillment or completion approval until payment is approved
- Admin approval should be required to move the order forward from review state

### Inventory safety rule

- Inventory deduction should only happen under verified order flow conditions
- No payment or order state should be trusted from the browser alone
- Stock integrity must remain the main source of truth

---

## 4. Key Risks in the Current Payment Flow

### 1. State drift risk

The logic for payment status and order status is spread across:

- customer checkout page
- auth order route
- admin order route
- shared order utility
- admin payment approval route

This is manageable, but it creates a risk of inconsistent interpretations across flows.

### 2. Secret handling risk

The JWT secret fallback in the auth layer is not acceptable for production. This must not remain in deployment configuration.

### 3. Upload validation risk

Payment proof images must be validated at the API/storage boundary. Without strict validation, malicious or oversized files can be uploaded.

### 4. Incomplete audit trace

A payment flow should log the following for every decision:

- order id
- payment method
- payment status before update
- payment status after update
- actor identity
- timestamp
- decision reason
- proof reference

### 5. Order-state duplication

The same business rule is expressed in multiple places. That raises maintenance risk and increases the chance of conflicting transitions.

---

## 5. Proposed Future Architecture

### Goal

Create a single internal payment/order state service that all flows call.

### Recommended structure

- API route: accepts request and validates request shape
- order/payment service: owns business transitions and legal status rules
- repository/data layer: reads and writes Prisma records
- upload/storage layer: handles image proof validation and secure URLs
- admin approval route: orchestrates approval and rejection with audit logging

### The service should own:

- initial payment status calculation
- effective payment status for each payment type
- current order status progression checks
- whether the order is eligible for approval
- whether the order can advance to the next step
- final validation before inventory movement

---

## 6. Desired Payment Decision Table

| Payment method | Initial payment status | Required proof | Can proceed before approval    | Final allowed status after approval |
| -------------- | ---------------------- | -------------- | ------------------------------ | ----------------------------------- |
| CASH           | PENDING                | No             | Yes for local fulfillment flow | PAID when completed                 |
| GCASH          | PENDING                | Yes            | No                             | PAID after approval                 |
| PAYMAYA        | PENDING                | Yes            | No                             | PAID after approval                 |

### Important policy rule

The system must treat payment method and order status as separate dimensions.

Example:

- `CASH` + `COMPLETED` => `PAID`
- `CASH` + not completed => `PENDING`
- `GCASH` + `PENDING_PAYMENT` => `PENDING`
- `GCASH` + approved => `PAID`

---

## 7. Decision Flow to Implement Later

### Customer order creation

1. Validate user authentication and profile completeness
2. Recalculate total from order items
3. Reject invalid or missing product/variant data
4. Require proof for wallet orders
5. Set server-side initial order status and payment status
6. Save order record and audit metadata
7. Avoid inventory deduction until the built-in order validation path confirms the order is safe

### Admin approval

1. Verify admin access
2. Load order with item and payment data
3. Reject if the order is already cancelled or completed
4. Reject if the payment method is cash and no payment approval is required
5. Confirm the order is in a valid review state
6. Update payment status to `PAID` only when policy allows it
7. Move order status forward if approved and allowed by business rules
8. Write approval audit record

### Admin rejection

1. Verify admin access
2. Load order
3. Reject if no valid review state exists
4. Set payment status to `FAILED` or cancel order according to policy
5. Log the rejection with reason and actor

### Completion / receipt flow

1. Allow completion only when order is ready for pickup
2. For cash orders, set payment status to `PAID` when the order is completed
3. For wallet orders, ensure payment was already approved
4. Log explicit completion and payment transitions

---

## 8. Security Requirements for Implementation

### Authentication

- Require signed, verified user tokens
- Use production secret configuration only
- Enforce least privilege for admin-only approval routes

### Proof-of-payment validation

- Reject missing files for online methods
- Validate type, extension, and size
- Restrict storage access to authenticated users/admins only
- Store the proof reference and not just a raw browser value

### Server-side trust boundaries

- Treat all browser inputs as untrusted, especially:
  - payment method
  - proof URL
  - status field
  - total amount
  - order state transitions

### Inventory protections

- Deduct stock only through validated order lifecycle transitions
- Ensure deduct and return paths are idempotent and transaction-safe
- No direct manual modification without audit trail

---

## 9. Audit Logging Requirements

Every payment decision should record:

- order id
- order number
- user id
- payment method
- payment status before
- payment status after
- order status before
- order status after
- admin or customer actor id
- timestamp
- reason / note
- proof reference

This logs should support dispute resolution and fraud investigation.

---

## 10. Validation Checklist for Later Work

### Order creation

- [ ] User is authenticated
- [ ] User profile is complete for checkout
- [ ] Customer is not blocked
- [ ] Order items are valid
- [ ] Total is recalculated on the server
- [ ] Payment proof is required for wallet payments
- [ ] Initial order state is server-defined

### Payment approval

- [ ] Admin access is verified
- [ ] Order exists and is valid for approval
- [ ] Payment status is eligible for approval
- [ ] Order is not already completed or cancelled
- [ ] Audit log is recorded

### Completion flow

- [ ] Order must be ready for pickup before marked completed
- [ ] Cash payment is set to `PAID` only upon completion
- [ ] Wallet payment is only accepted if approved
- [ ] No duplicate inventory movement occurs

---

## 11. Future Refactor Recommendation

The current code is functional but may still duplicate rules across UI and API layers. The future refactor should align around a single source of truth:

- `resolveInitialPaymentStatus`
- `getEffectivePaymentStatus`
- `resolveInitialOrderStatus`
- admin approval handler logic
- inventory movement decision point

These should be centralized behind a single payment/order service and called consistently by the customer and admin flows.

---

## 12. Implementation Priority

### Highest priority

1. Remove fallback JWT secret requirement
2. Centralize payment status rules
3. Enforce proof-of-payment validation
4. Standardize approval logging
5. Prevent duplicate order or inventory transitions

### Medium priority

1. Improve UI state messaging around payment review vs completion
2. Add stronger admin audit dialogs and confirmation text
3. Standardize payment-state labels across the app

### Lower priority

1. UI polish and explanatory messaging
2. Additional analytics for payment trends and fraud flags
3. Expanded operational dashboards

---

## 13. Final Position

The design principle is correct and should be preserved:

- do not trust browser state
- require proof for online payments
- require admin approval before orders progress beyond review
- tie inventory movement to verified transitions
- support cash as a delayed payment confirmation model

The project should implement this flow through one consistent state machine rather than multiple duplicated rules. That is the right upgrade direction for the future.
