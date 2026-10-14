import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelOrder,
  getEffectivePaymentStatus,
  getNextOrderStatus,
  getPickupDateKey,
  isPickupDateAheadOfToday,
  isPickupDateOnOrAfterToday,
  resolveInitialOrderStatus,
  resolveInitialPaymentStatus,
  validateOrderPayload,
} from "../src/lib/order";
import { calculatePickupAlertCount } from "../src/lib/admin-notifications";
import { applyOrderInventoryMovement, InsufficientStockError, isInventoryMovementAllowed } from "../src/features/inventory/lib/inventory";

test("validates a normal cash order payload", () => {
  const result = validateOrderPayload({
    userId: "user-1",
    customerName: "Customer",
    customerPhone: "09170000000",
    pickupDate: "2026-10-01T10:00:00.000Z",
    paymentMethod: "CASH",
    items: [{ productId: "product-1", quantity: 2, price: 150 }],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.payload.items[0].quantity, 2);
    assert.equal(result.payload.paymentMethod, "CASH");
  }
});

test("accepts wallet order payload before receipt upload so stock can be reserved", () => {
  const result = validateOrderPayload({
    items: [{ productId: "product-1", quantity: 1, price: 100 }],
    paymentMethod: "GCASH",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.payload.paymentMethod, "GCASH");
    assert.equal("proofOfPaymentUrl" in result.payload, false);
  }
});

test("cash orders stay pending until completion and only show paid when completed", () => {
  assert.equal(getEffectivePaymentStatus({ paymentMethod: "CASH", paymentStatus: "PENDING", status: "PENDING" }), "PENDING");
  assert.equal(getEffectivePaymentStatus({ paymentMethod: "CASH", paymentStatus: "PENDING", status: "READY_FOR_PICKUP" }), "PENDING");
  assert.equal(getEffectivePaymentStatus({ paymentMethod: "CASH", paymentStatus: "PENDING", status: "COMPLETED" }), "PAID");
  assert.equal(getEffectivePaymentStatus({ paymentMethod: "CASH", paymentStatus: "PENDING", status: "CANCELLED" }), "CANCELLED");
  assert.equal(getEffectivePaymentStatus({ paymentMethod: "GCASH", paymentStatus: "PENDING", status: "PENDING" }), "PENDING");
  assert.equal(getEffectivePaymentStatus({ paymentMethod: "GCASH", paymentStatus: "CANCELLED", status: "CANCELLED" }), "CANCELLED");
  assert.equal(resolveInitialOrderStatus(false), "PENDING");
});

test("cash orders remain pending until completion while online payment stays pending", () => {
  assert.equal(resolveInitialPaymentStatus("CASH"), "PENDING");
  assert.equal(resolveInitialPaymentStatus("GCASH"), "PENDING");
  assert.equal(resolveInitialPaymentStatus("PAYMAYA"), "PENDING");
});

test("rejects invalid order items and payment methods", () => {
  const missingProduct = validateOrderPayload({ items: [{ quantity: 1, price: 10 }] });
  const invalidPayment = validateOrderPayload({
    items: [{ productId: "product-1", quantity: 1, price: 10 }],
    paymentMethod: "CARD",
  });

  assert.equal(missingProduct.success, false);
  assert.equal(invalidPayment.success, false);
});

test("normalizes idempotency keys and variant data", () => {
  const result = validateOrderPayload({
    idempotencyKey: "  checkout-attempt-1  ",
    items: [{ productId: " product-1 ", variantId: " variant-1 ", quantity: "2", price: "99.50" }],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.payload.idempotencyKey, "checkout-attempt-1");
    assert.deepEqual(result.payload.items[0], {
      productId: "product-1",
      variantId: "variant-1",
      quantity: 2,
      price: 99.5,
      sku: undefined,
      unitLabel: undefined,
    });
  }
});

test("enforces order status progression and cancellation rules", () => {
  assert.equal(resolveInitialOrderStatus(false), "PENDING");
  assert.equal(resolveInitialOrderStatus(true), "COMPLETED");
  assert.equal(getNextOrderStatus("PENDING"), "CONFIRMED");
  assert.equal(getNextOrderStatus("COMPLETED"), null);
  assert.equal(canCancelOrder("PENDING"), true);
  assert.equal(canCancelOrder("COMPLETED"), false);
  assert.equal(canCancelOrder("CANCELLED"), false);
});

test("allows same-day pickup and accepts optional pickup scheduling details", () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  assert.equal(isPickupDateOnOrAfterToday(todayKey), true);
  assert.equal(isPickupDateOnOrAfterToday(yesterdayKey), false);
  assert.equal(getPickupDateKey(todayKey) >= getPickupDateKey(new Date()), true);

  const result = validateOrderPayload({
    userId: "user-1",
    customerName: "Customer",
    customerPhone: "09170000000",
    pickupDate: todayKey,
    pickupTime: "10:30",
    paymentMethod: "CASH",
    items: [{ productId: "product-1", quantity: 1, price: 100 }],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.payload.pickupDate, todayKey);
    assert.equal(result.payload.pickupTime, "10:30");
  }
});

test("treats tomorrow as a valid upcoming pickup date without timezone drift", () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dateKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  assert.equal(getPickupDateKey(dateKey) > getPickupDateKey(new Date()), true);
  assert.equal(isPickupDateAheadOfToday(dateKey), true);
});

test("counts only active upcoming pickup orders for the admin badge", () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const past = new Date(today);
  past.setDate(today.getDate() - 1);
  const pastKey = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;

  const orders = [
    { status: "PENDING", pickupDate: todayKey },
    { status: "READY_FOR_PICKUP", pickupDate: tomorrowKey },
    { status: "COMPLETED", pickupDate: todayKey },
    { status: "CANCELLED", pickupDate: tomorrowKey },
    { status: "PENDING", pickupDate: pastKey },
    { status: "PENDING", pickupDate: null },
  ];

  assert.equal(calculatePickupAlertCount(orders), 2);
});

test("skips stock movement when the product record is gone or stock is insufficient", () => {
  assert.equal(isInventoryMovementAllowed({ productId: "missing-product", quantity: 1 }, "STOCK_OUT", null), false);
  assert.equal(isInventoryMovementAllowed({ productId: "product-1", quantity: 3 }, "STOCK_OUT", 2), false);
  assert.equal(isInventoryMovementAllowed({ productId: "product-1", quantity: 2 }, "STOCK_OUT", 3), true);
  assert.equal(isInventoryMovementAllowed({ productId: "product-1", quantity: 2 }, "STOCK_IN", null), true);
  assert.equal(isInventoryMovementAllowed({ productId: "product-1", quantity: 2 }, "RETURN", null), true);
});

test("aggregates duplicate order lines before reserving stock", async () => {
  const updateQuantities: number[] = [];
  const auditQuantities: number[] = [];
  const tx = {
    product: {
      findUnique: async () => ({ id: "product-1", name: "Tea", stock: 2, isActive: true }),
      updateMany: async (args: { where: { stock?: { gte: number } } }) => {
        updateQuantities.push(args.where.stock?.gte ?? 0);
        return { count: 1 };
      },
    },
    inventoryTransaction: {
      create: async (args: { data: { quantity: number } }) => {
        auditQuantities.push(args.data.quantity);
        return args.data;
      },
    },
  } as unknown as Parameters<typeof applyOrderInventoryMovement>[0];

  await applyOrderInventoryMovement(
    tx,
    [
      { productId: "product-1", quantity: 1 },
      { productId: "product-1", quantity: 1 },
    ],
    "STOCK_OUT",
    "Order placed - stock reserved",
  );

  assert.deepEqual(updateQuantities, [2]);
  assert.deepEqual(auditQuantities, [2]);
});

test("fails the reservation when a conditional stock update loses a race", async () => {
  let auditCreated = false;
  const tx = {
    product: {
      findUnique: async () => ({ id: "product-1", name: "Tea", stock: 1, isActive: true }),
      updateMany: async () => ({ count: 0 }),
    },
    inventoryTransaction: {
      create: async () => {
        auditCreated = true;
        return {};
      },
    },
  } as unknown as Parameters<typeof applyOrderInventoryMovement>[0];

  await assert.rejects(
    applyOrderInventoryMovement(
      tx,
      [{ productId: "product-1", quantity: 1 }],
      "STOCK_OUT",
      "Order placed - stock reserved",
    ),
    InsufficientStockError,
  );
  assert.equal(auditCreated, false);
});
