ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE "OrderStatus"
  USING (
    CASE WHEN "status"::text = 'PENDING_PAYMENT' THEN 'PENDING' ELSE "status"::text END
  )::"OrderStatus";

ALTER TABLE "OrderEvent"
  ALTER COLUMN "previousStatus" TYPE "OrderStatus"
  USING (
    CASE WHEN "previousStatus"::text = 'PENDING_PAYMENT' THEN 'PENDING' ELSE "previousStatus"::text END
  )::"OrderStatus",
  ALTER COLUMN "newStatus" TYPE "OrderStatus"
  USING (
    CASE WHEN "newStatus"::text = 'PENDING_PAYMENT' THEN 'PENDING' ELSE "newStatus"::text END
  )::"OrderStatus";

DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "Order" ALTER COLUMN "paymentStatus" DROP DEFAULT;

ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'PROOF_SUBMITTED',
  'PAID',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "Order"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus"
  USING "paymentStatus"::text::"PaymentStatus";

ALTER TABLE "OrderEvent"
  ALTER COLUMN "previousPaymentStatus" TYPE "PaymentStatus"
  USING "previousPaymentStatus"::text::"PaymentStatus",
  ALTER COLUMN "newPaymentStatus" TYPE "PaymentStatus"
  USING "newPaymentStatus"::text::"PaymentStatus";

ALTER TABLE "InventoryTransaction"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus"
  USING "paymentStatus"::text::"PaymentStatus";

DROP TYPE "PaymentStatus_old";
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';

ALTER TABLE "Order"
  ADD COLUMN "reservationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Order_status_paymentStatus_reservationExpiresAt_idx"
  ON "Order"("status", "paymentStatus", "reservationExpiresAt");

UPDATE "Order"
SET "paymentStatus" = 'PROOF_SUBMITTED'
WHERE "paymentStatus" = 'PENDING'
  AND "paymentMethod" IN ('GCASH', 'PAYMAYA')
  AND "proofOfPaymentUrl" IS NOT NULL
  AND "status" <> 'CANCELLED';

UPDATE "Order"
SET "paymentStatus" = 'CANCELLED'
WHERE "status" = 'CANCELLED'
  AND "paymentStatus" = 'PENDING';

UPDATE "Order"
SET "paymentStatus" = 'PAID',
    "paidAt" = COALESCE("paidAt", "updatedAt")
WHERE "status" = 'COMPLETED'
  AND "paymentMethod" = 'CASH'
  AND "paymentStatus" = 'PENDING';

WITH invalid_online_orders AS (
  SELECT "id", "status", "paymentStatus"
  FROM "Order"
  WHERE "paymentMethod" IN ('GCASH', 'PAYMAYA')
    AND "paymentStatus" IN ('PENDING', 'PROOF_SUBMITTED')
    AND "status" IN ('CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED')
), normalized_orders AS (
  UPDATE "Order" AS order_row
  SET "status" = 'PENDING',
      "stateVersion" = order_row."stateVersion" + 1
  FROM invalid_online_orders AS invalid_order
  WHERE order_row."id" = invalid_order."id"
  RETURNING order_row."id"
)
INSERT INTO "OrderEvent" (
  "id",
  "orderId",
  "eventType",
  "previousStatus",
  "newStatus",
  "previousPaymentStatus",
  "newPaymentStatus",
  "actorName",
  "actorType",
  "note"
)
SELECT
  md5(invalid_order."id" || clock_timestamp()::text || random()::text),
  invalid_order."id",
  'ORDER_STATUS_NORMALIZED',
  invalid_order."status",
  'PENDING',
  invalid_order."paymentStatus",
  invalid_order."paymentStatus",
  'State migration',
  'SYSTEM',
  'Unpaid online order moved back to pending fulfillment.'
FROM invalid_online_orders AS invalid_order
JOIN normalized_orders ON normalized_orders."id" = invalid_order."id";

UPDATE "Order"
SET "reservationExpiresAt" = "createdAt" + INTERVAL '2 hours'
WHERE "status" = 'PENDING'
  AND "paymentMethod" IN ('GCASH', 'PAYMAYA')
  AND "paymentStatus" = 'PENDING'
  AND "proofOfPaymentUrl" IS NULL;

UPDATE "Order"
SET "reservationExpiresAt" = NULL
WHERE "paymentStatus" = 'PROOF_SUBMITTED';

ALTER TABLE "OrderEvent" DROP CONSTRAINT "OrderEvent_orderId_fkey";
ALTER TABLE "OrderEvent"
  ADD CONSTRAINT "OrderEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
