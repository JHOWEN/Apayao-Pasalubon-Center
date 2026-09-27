CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "Order_pickupDate_status_idx" ON "Order"("pickupDate", "status");
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");
CREATE INDEX "InventoryTransaction_variantId_createdAt_idx" ON "InventoryTransaction"("variantId", "createdAt");
CREATE INDEX "InventoryTransaction_source_createdAt_idx" ON "InventoryTransaction"("source", "createdAt");
CREATE INDEX "ProductReview_userId_productId_idx" ON "ProductReview"("userId", "productId");
CREATE INDEX "ProductReview_productId_createdAt_idx" ON "ProductReview"("productId", "createdAt");