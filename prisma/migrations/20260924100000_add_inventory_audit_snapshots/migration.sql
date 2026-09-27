ALTER TABLE "InventoryTransaction"
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "stockBefore" INTEGER,
  ADD COLUMN IF NOT EXISTS "stockAfter" INTEGER,
  ADD COLUMN IF NOT EXISTS "reservedBefore" INTEGER,
  ADD COLUMN IF NOT EXISTS "reservedAfter" INTEGER;

CREATE INDEX IF NOT EXISTS "InventoryTransaction_eventType_createdAt_idx"
  ON "InventoryTransaction"("eventType", "createdAt");
