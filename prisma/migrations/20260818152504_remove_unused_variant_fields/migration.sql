/*
  Warnings:

  - You are about to drop the column `colors` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `hasVariants` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `measurementUnit` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `measurementValue` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `optionUnit` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `measurementUnit` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `measurementValue` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the `ProductAttribute` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductAttributeValue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VariantAttributeValue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductAttribute" DROP CONSTRAINT "ProductAttribute_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductAttributeValue" DROP CONSTRAINT "ProductAttributeValue_attributeId_fkey";

-- DropForeignKey
ALTER TABLE "VariantAttributeValue" DROP CONSTRAINT "VariantAttributeValue_valueId_fkey";

-- DropForeignKey
ALTER TABLE "VariantAttributeValue" DROP CONSTRAINT "VariantAttributeValue_variantId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "colors",
DROP COLUMN "hasVariants",
DROP COLUMN "measurementUnit",
DROP COLUMN "measurementValue",
DROP COLUMN "optionUnit";

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "color",
DROP COLUMN "isActive",
DROP COLUMN "measurementUnit",
DROP COLUMN "measurementValue";

-- DropTable
DROP TABLE "ProductAttribute";

-- DropTable
DROP TABLE "ProductAttributeValue";

-- DropTable
DROP TABLE "VariantAttributeValue";
