ALTER TABLE "InventoryTransaction"
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "InventoryTransaction_isArchived_idx"
  ON "InventoryTransaction"("isArchived");
