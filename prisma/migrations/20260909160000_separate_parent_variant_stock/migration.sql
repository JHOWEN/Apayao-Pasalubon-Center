-- Parent stock is independent for variant products; preserve each ProductVariant stock value.
UPDATE "Product"
SET "stock" = 0
WHERE "hasVariants" = true;
