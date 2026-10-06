ALTER TABLE "InventoryTransaction"
ADD COLUMN "orderId" TEXT,
ADD COLUMN "performedById" TEXT,
ADD COLUMN "minStockBefore" INTEGER,
ADD COLUMN "minStockAfter" INTEGER;

CREATE INDEX "InventoryTransaction_orderId_createdAt_idx"
ON "InventoryTransaction"("orderId", "createdAt");
CREATE INDEX "InventoryTransaction_performedById_createdAt_idx"
ON "InventoryTransaction"("performedById", "createdAt");

ALTER TABLE "InventoryTransaction"
ADD CONSTRAINT "InventoryTransaction_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction"
ADD CONSTRAINT "InventoryTransaction_performedById_fkey"
FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "InventoryTransaction" AS itx
SET "orderId" = o."id"
FROM "Order" AS o
WHERE itx."orderNumber" = o."orderNumber"
  AND itx."orderId" IS NULL;

CREATE TYPE "InventoryTransactionEventAction" AS ENUM ('ARCHIVED', 'RESTORED');

CREATE TABLE "InventoryTransactionEvent" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "action" "InventoryTransactionEventAction" NOT NULL,
  "actorUserId" TEXT,
  "actorName" TEXT,
  "actorType" TEXT,
  "reason" TEXT NOT NULL,
  "previousArchivedState" BOOLEAN NOT NULL,
  "newArchivedState" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransactionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryTransactionEvent_transactionId_createdAt_idx"
ON "InventoryTransactionEvent"("transactionId", "createdAt");
CREATE INDEX "InventoryTransactionEvent_actorUserId_createdAt_idx"
ON "InventoryTransactionEvent"("actorUserId", "createdAt");

ALTER TABLE "InventoryTransactionEvent"
ADD CONSTRAINT "InventoryTransactionEvent_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransactionEvent"
ADD CONSTRAINT "InventoryTransactionEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
