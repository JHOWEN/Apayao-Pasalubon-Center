DO $$
BEGIN
  CREATE TYPE "ProductSellingMode" AS ENUM ('SIMPLE', 'PARENT_AND_VARIANTS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sellingMode" "ProductSellingMode" NOT NULL DEFAULT 'SIMPLE';

UPDATE "Product"
SET "sellingMode" = 'PARENT_AND_VARIANTS'
WHERE "hasVariants" = true;
