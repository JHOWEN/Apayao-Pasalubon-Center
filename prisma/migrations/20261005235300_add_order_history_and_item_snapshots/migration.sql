ALTER TABLE "OrderItem"
  ADD COLUMN "productNameSnapshot" TEXT,
  ADD COLUMN "productSkuSnapshot" TEXT,
  ADD COLUMN "variantSkuSnapshot" TEXT,
  ADD COLUMN "variantAttributesSnapshot" TEXT;

UPDATE "OrderItem" AS order_item
SET
  "productNameSnapshot" = product."name",
  "productSkuSnapshot" = product."sku"
FROM "Product" AS product
WHERE order_item."productId" = product."id";

UPDATE "OrderItem" AS order_item
SET
  "variantSkuSnapshot" = variant."sku",
  "variantAttributesSnapshot" = variant."attributes"
FROM "ProductVariant" AS variant
WHERE order_item."variantId" = variant."id";

ALTER TABLE "OrderItem"
  ALTER COLUMN "productNameSnapshot" SET NOT NULL,
  ALTER COLUMN "productSkuSnapshot" SET NOT NULL;

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "previousStatus" "OrderStatus",
  "newStatus" "OrderStatus",
  "previousPaymentStatus" "PaymentStatus",
  "newPaymentStatus" "PaymentStatus",
  "actorUserId" TEXT,
  "actorName" TEXT,
  "actorType" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx"
  ON "OrderEvent"("orderId", "createdAt");
CREATE INDEX "OrderEvent_eventType_createdAt_idx"
  ON "OrderEvent"("eventType", "createdAt");
CREATE INDEX "OrderEvent_actorUserId_createdAt_idx"
  ON "OrderEvent"("actorUserId", "createdAt");

ALTER TABLE "OrderEvent"
  ADD CONSTRAINT "OrderEvent_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
