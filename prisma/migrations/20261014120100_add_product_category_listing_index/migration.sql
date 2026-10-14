CREATE INDEX CONCURRENTLY "Product_categoryId_status_isActive_createdAt_idx"
  ON "Product"("categoryId", "status", "isActive", "createdAt");
