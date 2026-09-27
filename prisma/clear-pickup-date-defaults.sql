UPDATE "Order"
SET "pickupDate" = NULL
WHERE "pickupDate" IS NOT NULL
  AND "pickupTime" IS NULL
  AND CAST("pickupDate" AS DATE) = CAST("createdAt" AS DATE);
