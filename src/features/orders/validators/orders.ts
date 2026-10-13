import { z } from "zod";

const optionalPriceSchema = z.number().finite().min(0).max(99_999_999.99).optional();

export const orderItemInputSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  variantId: z.string().trim().min(1).max(128).nullable().optional(),
  quantity: z.number().int().min(1).max(10_000),
  // This is only the price the client displayed. The order API always loads
  // the persisted catalog price before it writes the order.
  price: optionalPriceSchema,
  sku: z.string().trim().max(128).optional(),
  unitLabel: z.string().trim().max(80).optional(),
});

export const orderCreateSchema = z.object({
  userId: z.string().trim().min(1).max(128).nullable().optional(),
  items: z.array(orderItemInputSchema).min(1).max(500),
  orderNumber: z.string().trim().min(1).max(100).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  pickupDate: z.string().trim().max(64).nullable().optional(),
  pickupTime: z.string().trim().max(16).nullable().optional(),
  paymentMethod: z.enum(["CASH", "GCASH", "PAYMAYA"]).optional(),
  isWalkIn: z.boolean().optional(),
});

export const orderStatusUpdateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]),
});

export const productReviewCreateSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
  optionValue: z.string().trim().max(120).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
