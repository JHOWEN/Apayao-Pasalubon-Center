ALTER TABLE "InventoryTransaction"
  ADD COLUMN IF NOT EXISTS "performedByName" TEXT;
