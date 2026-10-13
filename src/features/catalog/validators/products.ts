import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const textNumber = z.union([
  z.number().finite(),
  z.string().trim().min(1).regex(/^\d+(?:\.\d+)?$/).transform(Number),
]);
const priceInput = textNumber.refine((value) => value >= 0 && value <= 99_999_999.99);
const stockInput = textNumber.refine((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000);
const textList = z.array(z.string().trim().min(1).max(2048)).max(12);
const attributesSchema = z.record(z.string(), z.unknown());

const createVariantSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  price: priceInput,
  cost: priceInput,
  stock: stockInput,
  minStock: stockInput.optional(),
  isActive: z.boolean().optional(),
  attributeValues: attributesSchema.optional(),
  imageUrls: textList.optional(),
});

const updateVariantSchema = z.object({
  id: idSchema,
  sku: z.string().trim().min(1).max(100).optional(),
  price: priceInput.optional(),
  cost: priceInput.optional(),
  minStock: stockInput.optional(),
  attributeValues: attributesSchema.optional(),
  imageUrls: textList.optional(),
});

const optionValueSchema = z.object({
  id: idSchema.optional(),
  optionValue: z.string().trim().max(120).optional(),
  assignedProductId: idSchema.optional(),
  isParentOption: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(100).optional(),
  categoryId: idSchema,
  description: z.string().max(4000).optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  imageUrls: textList.optional(),
  price: priceInput,
  cost: priceInput,
  stock: stockInput,
  minStock: stockInput.optional(),
  isActive: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]).optional(),
  hasVariants: z.boolean().optional(),
  optionType: z.string().trim().max(80).optional(),
  optionName: z.string().trim().max(80).optional(),
  optionValues: z.array(optionValueSchema).max(100).optional(),
  variants: z.array(createVariantSchema).max(500).optional(),
}).refine((value) => value.hasVariants === true || Boolean(value.sku?.trim()), {
  message: "A product code is required for a simple product.",
  path: ["sku"],
});

export const productUpdateSchema = z.object({
  id: idSchema,
  name: z.string().trim().max(160).optional(),
  sku: z.string().trim().max(100).optional(),
  categoryId: idSchema.optional(),
  description: z.string().max(4000).optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  imageUrls: textList.optional(),
  price: priceInput.optional(),
  cost: priceInput.optional(),
  stock: stockInput.optional(),
  minStock: stockInput.optional(),
  isActive: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]).optional(),
  sellingMode: z.enum(["SIMPLE", "PARENT_AND_VARIANTS"]).optional(),
  optionType: z.string().trim().max(80).optional(),
  optionName: z.string().trim().max(80).optional(),
  optionValues: z.array(optionValueSchema).max(100).optional(),
  variants: z.array(updateVariantSchema).max(500).optional(),
  stockChangeReason: z.string().trim().max(500).optional(),
  minStockChangeReason: z.string().trim().max(500).optional(),
});
