ALTER TABLE "InventoryTransaction"
ADD COLUMN "performedByType" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "customerName" TEXT,
ADD COLUMN "orderNumber" TEXT;

CREATE INDEX "InventoryTransaction_orderNumber_idx" ON "InventoryTransaction"("orderNumber");