ALTER TABLE "InventoryTransaction"
ADD COLUMN "reason" TEXT,
ADD COLUMN "unitCostSnapshot" DECIMAL(10, 2);
