ALTER TABLE "InventoryTransaction"
ADD COLUMN "variantSku" TEXT;

UPDATE "InventoryTransaction" AS itx
SET "variantSku" = variant."sku"
FROM "ProductVariant" AS variant
WHERE itx."variantId" = variant."id"
  AND itx."variantSku" IS NULL;
