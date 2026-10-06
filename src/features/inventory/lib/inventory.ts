import type { Prisma } from "@prisma/client";
import { emitInventoryUpdatedEvent } from "@/lib/realtime";

type TransactionClient = Prisma.TransactionClient;

type InventoryMovementItem = {
  productId: string;
  variantId?: string; // Optional variant ID for variant products
  quantity: number;
};

export class InsufficientStockError extends Error {
  constructor(itemLabel = "one of the selected items") {
    super(`Not enough stock for ${itemLabel}. Refresh your cart and try again.`);
    this.name = "InsufficientStockError";
  }
}

type InventoryAuditContext = {
  actorUserId?: string | null;
  orderId?: string | null;
  eventType?: string | null;
  reservedBefore?: number | null;
  reservedAfter?: number | null;
  minStockBefore?: number | null;
  minStockAfter?: number | null;
  performedByType?: "ADMIN" | "STAFF" | "SYSTEM" | "CUSTOMER";
  source?: "INVENTORY" | "POS" | "ECOMMERCE" | "ADMIN";
  customerName?: string | null;
  orderNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
};

type InventoryPaymentMethod = "CASH" | "GCASH" | "PAYMAYA";
type InventoryPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export function buildInventoryAuditPaymentData(input: Pick<InventoryAuditContext, "paymentMethod" | "paymentStatus" | "paymentReference"> = {}): {
  paymentMethod: InventoryPaymentMethod | null;
  paymentStatus: InventoryPaymentStatus | null;
  paymentReference: string | null;
} {
  const rawMethod = typeof input.paymentMethod === "string" ? input.paymentMethod.trim().toUpperCase() : null;
  const rawStatus = typeof input.paymentStatus === "string" ? input.paymentStatus.trim().toUpperCase() : null;
  const paymentReference = typeof input.paymentReference === "string" ? input.paymentReference.trim() || null : null;

  const paymentMethod = rawMethod === "CASH" || rawMethod === "GCASH" || rawMethod === "PAYMAYA" ? rawMethod : null;
  const paymentStatus = rawStatus === "PENDING" || rawStatus === "PAID" || rawStatus === "FAILED" || rawStatus === "CANCELLED"
    ? rawStatus
    : null;

  return {
    paymentMethod,
    paymentStatus,
    paymentReference,
  };
}

export function isInventoryMovementAllowed(
  item: { productId?: string | null; quantity?: number | null },
  type: "STOCK_IN" | "STOCK_OUT" | "RETURN",
  currentStock: number | null | undefined,
) {
  const quantity = Number(item.quantity ?? 1);

  if (!item.productId || !Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }

  if (type === "STOCK_OUT") {
    if (currentStock == null) {
      return false;
    }

    return currentStock >= quantity;
  }

  return true;
}

export async function applyOrderInventoryMovement(
  tx: TransactionClient,
  items: InventoryMovementItem[],
  type: "STOCK_IN" | "STOCK_OUT" | "RETURN",
  remarks: string,
  performedByName?: string | null,
  auditContext: InventoryAuditContext = {},
) {
  const paymentAudit = buildInventoryAuditPaymentData(auditContext);
  const aggregatedItems = new Map<string, InventoryMovementItem>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const existing = aggregatedItems.get(key);
    aggregatedItems.set(key, {
      ...item,
      quantity: Number(existing?.quantity ?? 0) + Number(item.quantity ?? 0),
    });
  }

  for (const item of aggregatedItems.values()) {
    const quantity = Number(item.quantity);
    const stockDelta = type === "STOCK_OUT" ? { decrement: quantity } : { increment: quantity };
    let stockBefore: number;
    let stockAfter: number;
    let productName: string | null = null;
    let variantSku: string | null = null;

    if (item.variantId) {
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        select: { id: true, sku: true, stock: true, isActive: true, product: { select: { name: true, isActive: true } } },
      });

      stockBefore = Number(variant?.stock ?? 0);
      productName = variant?.product.name ?? null;
      variantSku = variant?.sku ?? null;
      if (!variant || !variant.product.isActive || (type === "STOCK_OUT" && !variant.isActive) || !isInventoryMovementAllowed(item, type, stockBefore)) {
        if (type === "STOCK_OUT") throw new InsufficientStockError(productName ?? item.productId);
        continue;
      }
      stockAfter = type === "STOCK_OUT" ? stockBefore - quantity : stockBefore + quantity;

      const update = await tx.productVariant.updateMany({
        where: {
          id: item.variantId,
          ...(type === "STOCK_OUT" ? { stock: { gte: quantity }, isActive: true } : {}),
        },
        data: { stock: stockDelta },
      });
      if (type === "STOCK_OUT" && update.count !== 1) {
        throw new InsufficientStockError(productName ?? item.productId);
      }
    } else {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, stock: true, isActive: true },
      });

      stockBefore = Number(product?.stock ?? 0);
      productName = product?.name ?? null;
      if (!product || (type === "STOCK_OUT" && !product.isActive) || !isInventoryMovementAllowed(item, type, stockBefore)) {
        if (type === "STOCK_OUT") throw new InsufficientStockError(productName ?? item.productId);
        continue;
      }
      stockAfter = type === "STOCK_OUT" ? stockBefore - quantity : stockBefore + quantity;

      const update = await tx.product.updateMany({
        where: {
          id: item.productId,
          ...(type === "STOCK_OUT" ? { stock: { gte: quantity }, isActive: true } : {}),
        },
        data: { stock: stockDelta },
      });
      if (type === "STOCK_OUT" && update.count !== 1) {
        throw new InsufficientStockError(productName ?? item.productId);
      }
    }

    await tx.inventoryTransaction.create({
      data: {
        productId: item.productId,
        productName,
        orderId: auditContext.orderId ?? null,
        performedById: auditContext.actorUserId ?? null,
        variantId: item.variantId || null,
        variantSku,
        type,
        eventType: auditContext.eventType ?? (type === "STOCK_OUT" ? "STOCK_OUT" : type === "RETURN" ? "RETURN" : "STOCK_IN"),
        quantity,
        stockBefore,
        stockAfter,
        minStockBefore: auditContext.minStockBefore ?? null,
        minStockAfter: auditContext.minStockAfter ?? null,
        reservedBefore: auditContext.reservedBefore ?? (auditContext.eventType === "RESERVATION_CREATED" || auditContext.eventType === "RESERVATION_RELEASED" ? (auditContext.eventType === "RESERVATION_RELEASED" ? quantity : 0) : null),
        reservedAfter: auditContext.reservedAfter ?? (auditContext.eventType === "RESERVATION_CREATED" || auditContext.eventType === "RESERVATION_RELEASED" ? (auditContext.eventType === "RESERVATION_CREATED" ? quantity : 0) : null),
        remarks,
        performedByName: performedByName || null,
        performedByType: auditContext.performedByType ?? (performedByName ? "ADMIN" : "SYSTEM"),
        source: auditContext.source ?? "INVENTORY",
        customerName: auditContext.customerName ?? null,
        orderNumber: auditContext.orderNumber ?? null,
        paymentMethod: paymentAudit.paymentMethod ?? null,
        paymentStatus: paymentAudit.paymentStatus ?? null,
        paymentReference: paymentAudit.paymentReference ?? null,
      },
    });

    emitInventoryUpdatedEvent({
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity,
      type,
      orderNumber: auditContext.orderNumber ?? null,
    });
  }
}

export async function recordInventoryLifecycleEvent(
  tx: TransactionClient,
  items: InventoryMovementItem[],
  eventType: string,
  remarks: string,
  performedByName?: string | null,
  auditContext: InventoryAuditContext = {},
) {
  const paymentAudit = buildInventoryAuditPaymentData(auditContext);

  await Promise.all(items.map(async (item) => {
    const quantity = Number(item.quantity ?? 0);
    const variant = item.variantId
      ? await tx.productVariant.findUnique({ where: { id: item.variantId }, select: { sku: true, stock: true } })
      : null;
    const product = await tx.product.findUnique({ where: { id: item.productId }, select: { name: true, stock: true } });
    const stock = Number(variant?.stock ?? product?.stock ?? 0);
    const reservedBefore = auditContext.reservedBefore ?? (["RESERVATION_FULFILLED", "RESERVATION_RELEASED"].includes(eventType) ? quantity : eventType === "RESERVATION_CREATED" ? 0 : null);
    const reservedAfter = auditContext.reservedAfter ?? (["RESERVATION_FULFILLED", "RESERVATION_RELEASED"].includes(eventType) ? 0 : eventType === "RESERVATION_CREATED" ? quantity : null);

    await tx.inventoryTransaction.create({
      data: {
        productId: item.productId,
        productName: product?.name ?? null,
        orderId: auditContext.orderId ?? null,
        performedById: auditContext.actorUserId ?? null,
        variantId: item.variantId || null,
        variantSku: variant?.sku ?? null,
        type: "ADJUSTMENT",
        eventType,
        quantity: 0,
        stockBefore: stock,
        stockAfter: stock,
        reservedBefore,
        reservedAfter,
        remarks,
        performedByName: performedByName || null,
        performedByType: auditContext.performedByType ?? (performedByName ? "ADMIN" : "SYSTEM"),
        source: auditContext.source ?? "INVENTORY",
        customerName: auditContext.customerName ?? null,
        orderNumber: auditContext.orderNumber ?? null,
        paymentMethod: paymentAudit.paymentMethod ?? null,
        paymentStatus: paymentAudit.paymentStatus ?? null,
        paymentReference: paymentAudit.paymentReference ?? null,
      },
    });
  }));
}
