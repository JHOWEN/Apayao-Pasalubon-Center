-- Add flexible option combinations and optional variant-specific image galleries.
ALTER TABLE "ProductVariant"
  ADD COLUMN IF NOT EXISTS "attributes" TEXT,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
