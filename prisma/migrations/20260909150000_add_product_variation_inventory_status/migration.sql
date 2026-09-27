-- Add product publication state and flexible variant metadata.
DO $$ BEGIN
  CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "status" "ProductStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS "hasVariants" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProductVariant"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "attributes" TEXT,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

DO $$ BEGIN
  ALTER TYPE "InventoryType" ADD VALUE 'RETURN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
