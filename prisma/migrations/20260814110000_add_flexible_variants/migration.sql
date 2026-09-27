-- Add unit and hasVariants columns to Product if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Product' AND column_name = 'unit'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'piece';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Product' AND column_name = 'hasVariants'
  ) THEN
    ALTER TABLE "Product" ADD COLUMN "hasVariants" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add snapshot fields to OrderItem if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderItem' AND column_name = 'sku'
  ) THEN
    ALTER TABLE "OrderItem" ADD COLUMN "sku" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderItem' AND column_name = 'unitLabel'
  ) THEN
    ALTER TABLE "OrderItem" ADD COLUMN "unitLabel" TEXT;
  END IF;
END $$;

-- Create ProductAttribute table if it doesn't exist
CREATE TABLE IF NOT EXISTS "ProductAttribute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE
);

-- Create unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS "ProductAttribute_productId_name_key" ON "ProductAttribute"("productId", "name");

-- Create ProductAttributeValue table if it doesn't exist
CREATE TABLE IF NOT EXISTS "ProductAttributeValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute" ("id") ON DELETE CASCADE
);

-- Create unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS "ProductAttributeValue_attributeId_value_key" ON "ProductAttributeValue"("attributeId", "value");

-- Add isActive column to ProductVariant if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ProductVariant' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE "ProductVariant" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Create VariantValueAssignment table if it doesn't exist
CREATE TABLE IF NOT EXISTS "VariantValueAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    CONSTRAINT "VariantValueAssignment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE CASCADE,
    CONSTRAINT "VariantValueAssignment_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "ProductAttributeValue" ("id") ON DELETE CASCADE
);

-- Create unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS "VariantValueAssignment_variantId_attributeId_key" ON "VariantValueAssignment"("variantId", "attributeId");
