ALTER TABLE "InventoryTransaction"
  ADD COLUMN IF NOT EXISTS "productName" TEXT;

UPDATE "InventoryTransaction" transaction
SET "productName" = product."name"
FROM "Product" product
WHERE transaction."productId" = product."id"
  AND transaction."productName" IS NULL;

ALTER TABLE "InventoryTransaction"
  ALTER COLUMN "productId" DROP NOT NULL;

ALTER TABLE "InventoryTransaction"
  DROP CONSTRAINT IF EXISTS "InventoryTransaction_productId_fkey";

ALTER TABLE "InventoryTransaction"
  ADD CONSTRAINT "InventoryTransaction_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
