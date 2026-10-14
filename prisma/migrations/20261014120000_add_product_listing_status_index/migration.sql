CREATE INDEX CONCURRENTLY "Product_status_isActive_createdAt_idx"
  ON "Product"("status", "isActive", "createdAt");
