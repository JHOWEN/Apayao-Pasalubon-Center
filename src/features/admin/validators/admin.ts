import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.extend({ id: idSchema });

export const customerUpdateSchema = z.object({
  id: idSchema,
  name: optionalText(120),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()).optional(),
  phone: optionalText(40),
  address: optionalText(500),
  emailVerified: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});

export const paymentDecisionSchema = z.object({ orderId: idSchema });

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  role: z.enum(["ADMIN", "STAFF"]),
});

export const userUpdateSchema = z.object({
  id: idSchema,
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  isBlocked: z.boolean().optional(),
}).refine((value) => value.role !== undefined || value.isBlocked !== undefined, {
  message: "Provide a role or blocked status to update.",
});

export const idBodySchema = z.object({ id: idSchema });

export const profileUpdateSchema = z.object({
  name: optionalText(120),
  email: z.string().trim().email().max(160).optional(),
  phone: optionalText(40),
  address: optionalText(500),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
});

export const profilePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(1).max(72),
});

export const storefrontSettingsSchema = z.object({
  appName: optionalText(120),
  registeredBusinessName: optionalText(120),
  businessAddress: optionalText(240),
  contactEmail: z.string().trim().max(160).optional(),
  contactPhone: optionalText(40),
  facebookUrl: z.string().trim().max(240).optional(),
  storeHours: optionalText(120),
  tinNumber: optionalText(40),
  currency: z.string().trim().min(3).max(3).optional(),
  gcashAccountName: optionalText(120),
  gcashAccountNumber: optionalText(40),
  gcashQrCodeUrl: z.string().trim().max(2048).optional(),
  mayaAccountName: optionalText(120),
  mayaAccountNumber: optionalText(40),
  mayaQrCodeUrl: z.string().trim().max(2048).optional(),
});

export const inventoryMovementSchema = z.object({
  productId: idSchema,
  variantId: idSchema.nullable().optional(),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "RETURN"]),
  quantity: z.number().int().min(0).max(1_000_000),
  remarks: optionalText(500),
  minStock: z.number().int().min(0).max(1_000_000).optional(),
});

export const inventoryArchiveSchema = z.object({
  action: z.enum(["archive", "restore"]),
  ids: z.union([
    idSchema,
    z.array(idSchema).min(1).max(100),
  ]).optional(),
  id: idSchema.optional(),
  reason: optionalText(500),
}).refine((value) => value.ids !== undefined || value.id !== undefined, {
  message: "Provide one or more transaction ids.",
});

export const variantCreateSchema = z.object({
  productId: idSchema,
  sku: z.string().trim().min(1).max(100),
  price: z.number().finite().min(0).max(99_999_999.99),
  cost: z.number().finite().min(0).max(99_999_999.99),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  minStock: z.number().int().min(0).max(1_000_000).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  imageUrls: z.array(z.string().trim().min(1).max(2048)).max(12).optional(),
});

export const variantUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  price: z.number().finite().min(0).max(99_999_999.99).optional(),
  cost: z.number().finite().min(0).max(99_999_999.99).optional(),
  minStock: z.number().int().min(0).max(1_000_000).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  imageUrls: z.array(z.string().trim().min(1).max(2048)).max(12).optional(),
  stockChangeReason: optionalText(500),
  minStockChangeReason: optionalText(500),
});
