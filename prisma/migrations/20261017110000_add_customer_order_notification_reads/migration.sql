ALTER TABLE "OrderEvent"
ADD COLUMN "customerReadAt" TIMESTAMP(3);

UPDATE "OrderEvent"
SET "customerReadAt" = "createdAt";

CREATE INDEX "OrderEvent_customerReadAt_createdAt_idx"
ON "OrderEvent"("customerReadAt", "createdAt");
