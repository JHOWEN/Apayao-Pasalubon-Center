# Admin Payment Approval UI Guide

## Where to Find Payment Approval

### Admin Orders Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Orders Management Dashboard                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  📊 Filter by Status:  [ACTIVE ✓] [ALL] [PENDING] [PREPARING] ...           │
│                                                                               │
│  🔍 Search orders: [Order #, Customer Name, Phone...]     [Reset filters]   │
│                                                                               │
│  Showing 5 matching orders                                                   │
│                                                                               │
├──────┬──────────┬──────────┬──────────┬─────┬────────┬─────────┬──────┬─────┤
│Order │Customer  │ Ordered  │ Pickup   │Items│Method  │Payment  │Status│Total│
├──────┼──────────┼──────────┼──────────┼─────┼────────┼─────────┼──────┼─────┤
│#1001 │ Juan D.  │Sep 1 '26 │Sep 5 '26 │  2  │🔵Cash  │    —    │Pend. │₱890 │
│      │          │          │          │     │        │         │      │     │
├──────┼──────────┼──────────┼──────────┼─────┼────────┼─────────┼──────┼─────┤
│#1002 │ Maria S. │Sep 1 '26 │Sep 6 '26 │  1  │💚GCash │🟢PAID   │Pend  │₱450 │  ← Payment Ready!
│      │📍Taguig  │          │          │     │        │         │Pay.  │     │
│      │          │          │          │     │        │         │      │     │
├──────┼──────────┼──────────┼──────────┼─────┼────────┼─────────┼──────┼─────┤
│#1003 │ Pedro L. │Sep 1 '26 │Sep 7 '26 │  3  │💜PayMaya│🟢PAID  │Pend. │₱1250│  ← Payment Ready!
│      │          │          │          │     │        │         │Pay.  │     │
│      │          │          │          │     │        │         │      │     │
├──────┼──────────┼──────────┼──────────┼─────┼────────┼─────────┼──────┼─────┤
│#1004 │ Ana C.   │Aug 31 '26│Sep 4 '26 │  2  │🔵Cash  │    —    │Conf  │₱675 │
│      │          │          │          │     │        │         │      │     │
├──────┼──────────┼──────────┼──────────┼─────┼────────┼─────────┼──────┼─────┤
│#1005 │ Roberto F│Aug 31 '26│Sep 3 '26 │  1  │💚GCash │🟡PEN.  │Pend. │₱320 │
│      │          │          │          │     │        │         │Pay.  │     │
└──────┴──────────┴──────────┴──────────┴─────┴────────┴─────────┴──────┴─────┘
                                                                              ▲
                                                                    Action buttons
```

## Action Buttons (Right Column)

When you scroll right in the table, you'll see the Action column:

### For Online Payments Ready to Approve:

```
Order #1002 (GCash, Status: PAID, Order Status: Pending Payment)

Actions:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   🟢 APPROVE │ │   ➜ CONFIRM  │ │   👁 DETAILS │
│   Payment    │ │   Order      │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
  (green)        (blue)              (sky blue)
  ONLY SHOWS     Next action         View all
  for PAID       after approval      order items
  online payments
```

### For Cash Orders:

```
Order #1001 (Cash, Order Status: Pending)

Actions:
┌──────────────┐ ┌──────────────┐
│   ➜ CONFIRM  │ │   👁 DETAILS │
│   Order      │ │              │
└──────────────┘ └──────────────┘
  (blue)          (sky blue)
  No approval     View details
  needed for cash
```

---

## Step-by-Step: Approve a GCash Payment

### 1. Identify Online Payments Awaiting Approval

Look for rows with:

- **Method column**: Shows 💚 (GCash) or 💜 (PayMaya)
- **Payment column**: Shows 🟢 **PAID** in green badge
- **Status column**: Shows 🔵 **Pend. Pay.** (Pending Payment) in blue badge

Example from above: Orders #1002 and #1003 are ready for approval.

### 2. Click the Green Approval Button

In the rightmost "Action" area, click the **green ✓ APPROVE** button.

A confirmation modal appears:

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  🟢 ✓ Approve payment                                         ║
║                                                               ║
║  This will confirm the payment and reserve inventory.         ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ Approve online payment for Order #1002?                │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  [Cancel]  [Approve payment] ←  Click here to confirm         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### 3. Confirm in the Modal

Click the **"Approve payment"** button to confirm.

The system will:

- ✅ Update order status from `PENDING_PAYMENT` to `CONFIRMED`
- ✅ Deduct inventory from stock
- ✅ Show success message: "Payment approved. Stock has been reserved."

### 4. Order Moves to Preparation

After approval, the order:

- Status changes to **CONFIRMED** (blue badge)
- Can now be moved to **PREPARING** (blue ➜ button)
- Stock is locked (not available for other orders)
- Ready to be picked/packed

---

## Understanding Payment Status Badges

### For Online Payments Only

| Badge          | Meaning                          | What to Do                          |
| -------------- | -------------------------------- | ----------------------------------- |
| 🟡 **PENDING** | Customer hasn't paid yet         | Wait for payment                    |
| 🟢 **PAID**    | Receipt reviewed and marked paid | **Click green ✓ button to approve** |
| 🔴 **FAILED**  | Payment was declined             | Contact customer to retry           |
| ⚪ **—**       | Cash payment (no status)         | No approval needed                  |

### For Order Status (Column "Status")

| Badge             | Meaning                  | Cash               | GCash                  | PayMaya                |
| ----------------- | ------------------------ | ------------------ | ---------------------- | ---------------------- |
| 🟡 **PENDING**    | Initial state            | ✓ Ready to confirm | ✗ (shows "Pend. Pay.") | ✗ (shows "Pend. Pay.") |
| 🔵 **Pend. Pay.** | Online payment pending   | Never shows        | ✓ Until approved       | ✓ Until approved       |
| 🟦 **CONFIRMED**  | Order approved           | ✓ After confirm    | ✓ After approval       | ✓ After approval       |
| 🟧 **PREPARING**  | Staff is preparing order | ✓                  | ✓                      | ✓                      |
| 🟩 **READY**      | Ready for pickup         | ✓                  | ✓                      | ✓                      |
| ✅ **COMPLETED**  | Customer picked up       | ✓                  | ✓                      | ✓                      |
| ❌ **CANCELLED**  | Order cancelled          | ✓                  | ✓                      | ✓                      |

---

## Common Scenarios

### Scenario 1: Customer Pays with GCash

```
1. Customer places order, selects GCash
   → Order created with status: PENDING_PAYMENT
   → Payment status: PENDING

2. Customer completes payment on GCash app
   → Customer uploads payment proof

3. Admin reviews the uploaded receipt
   → Payment status remains PENDING until approved
   → Order status remains: PENDING_PAYMENT

4. Admin sees order in dashboard:
   Method: 💚 GCash
   Payment: 🟢 PAID
   Status: 🔵 Pend. Pay.
   Action: 🟢 Green APPROVE button visible

5. Admin clicks green APPROVE button
   → Confirms modal
   → System deducts inventory
   → Order status → CONFIRMED
   → Ready to move to PREPARING
```

### Scenario 2: Customer Pays with Cash

```
1. Customer places order, selects Cash
   → Order created with status: PENDING
   → No payment status (cash doesn't need pre-approval)

2. Staff receives payment in cash at pickup

3. Admin can immediately confirm order:
   Method: 🔵 Cash
   Payment: — (no online status)
   Status: 🟡 PENDING
   Action: 🔵 Blue ➜ CONFIRM button visible

4. Admin clicks blue CONFIRM button
   → Order moves to CONFIRMED
   → Inventory deducted
```

### Scenario 3: Payment Fails

```
1. Customer submits an invalid or declined GCash payment
   → Admin declines the uploaded proof

2. Payment status becomes FAILED
   → Order status: PENDING_PAYMENT

3. Admin sees:
   Method: 💚 GCash
   Payment: 🔴 FAILED
   Status: 🔵 Pend. Pay.
   Action: No approval button (payment failed)

4. Admin contacts customer to retry
   → Customer makes new payment attempt
   → New order created
```

---

## If Approval Button Doesn't Appear

Check these conditions:

1. **Is it an online payment?**
   - Method must show GCash or PayMaya
   - Cash orders don't have approval buttons

2. **Is payment status PAID?**
   - Payment column must show 🟢 PAID
   - If it shows 🟡 PENDING or 🔴 FAILED, no button appears

3. **Is order status PENDING_PAYMENT?**
   - Status column must show 🔵 Pend. Pay.
   - If it already shows CONFIRMED, order is already approved

4. **Was proof of payment uploaded?**
   - Wallet orders require a receipt before they can be approved
   - Check the order details for the uploaded proof

---

## Keyboard Shortcuts (if enabled)

- `R` - Refresh orders list
- `A` - Focus first approval button
- `C` - Focus first confirm button

---

## Mobile View

On small screens, the table may be scrollable. Swipe right to see:

- Payment column
- Status column
- Action buttons
