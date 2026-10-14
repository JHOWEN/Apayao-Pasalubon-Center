CREATE INDEX CONCURRENTLY "Order_userId_status_createdAt_idx"
  ON "Order"("userId", "status", "createdAt");
