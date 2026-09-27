-- CreateEnum
CREATE TYPE "ProductGroupStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "optionType" TEXT NOT NULL,
    "optionName" TEXT,
    "unit" TEXT,
    "status" "ProductGroupStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroupItem" (
    "id" TEXT NOT NULL,
    "productGroupId" TEXT NOT NULL,
    "inventoryProductId" TEXT NOT NULL,
    "optionValue" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductGroupItem_productGroupId_idx" ON "ProductGroupItem"("productGroupId");

-- CreateIndex
CREATE INDEX "ProductGroupItem_inventoryProductId_idx" ON "ProductGroupItem"("inventoryProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroupItem_productGroupId_inventoryProductId_key" ON "ProductGroupItem"("productGroupId", "inventoryProductId");

-- AddForeignKey
ALTER TABLE "ProductGroupItem" ADD CONSTRAINT "ProductGroupItem_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroupItem" ADD CONSTRAINT "ProductGroupItem_inventoryProductId_fkey" FOREIGN KEY ("inventoryProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
