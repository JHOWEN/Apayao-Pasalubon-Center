import { Prisma } from "@prisma/client";

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

export class InventoryItemUnavailableError extends Error {
  constructor(itemLabel: string) {
    super(`${itemLabel} is no longer available for sale. Refresh the POS catalog and try again.`);
    this.name = "InventoryItemUnavailableError";
  }
}

export class InventoryConflictError extends Error {
  constructor(itemLabel: string) {
    super(`Inventory changed while processing ${itemLabel}. Refresh the POS catalog and try again.`);
    this.name = "InventoryConflictError";
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
type InventoryPaymentStatus = "PENDING" | "PROOF_SUBMITTED" | "PAID" | "FAILED" | "CANCELLED";

export function buildInventoryAuditPaymentData(input: Pick<InventoryAuditContext, "paymentMethod" | "paymentStatus" | "paymentReference"> = {}): {
  paymentMethod: InventoryPaymentMethod | null;
  paymentStatus: InventoryPaymentStatus | null;
  paymentReference: string | null;
} {
  const rawMethod = typeof input.paymentMethod === "string" ? input.paymentMethod.trim().toUpperCase() : null;
  const rawStatus = typeof input.paymentStatus === "string" ? input.paymentStatus.trim().toUpperCase() : null;
  const paymentReference = typeof input.paymentReference === "string" ? input.paymentReference.trim() || null : null;

  const paymentMethod = rawMethod === "CASH" || rawMethod === "GCASH" || rawMethod === "PAYMAYA" ? rawMethod : null;
  const paymentStatus = rawStatus === "PENDING" || rawStatus === "PROOF_SUBMITTED" || rawStatus === "PAID" || rawStatus === "FAILED" || rawStatus === "CANCELLED"
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

  if (type === "STOCK_OUT" && aggregatedItems.size > 0) {
    const productItems = [...aggregatedItems.values()].filter((item) => !item.variantId);
    const variantItems = [...aggregatedItems.values()].filter((item) => Boolean(item.variantId));
    // Variant sales also need their parent product loaded for the active-state check below.
    const productIds = [...new Set([...aggregatedItems.values()].map((item) => item.productId))];
    const variantIds = [...new Set(variantItems.map((item) => item.variantId!))];
    const [products, variants] = await Promise.all([
      productIds.length
        ? tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, isActive: true },
          })
        : Promise.resolve([]),
      variantIds.length
        ? tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: {
              id: true,
              productId: true,
              sku: true,
              isActive: true,
              product: { select: { name: true, isActive: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    for (const item of aggregatedItems.values()) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new Error("Each checkout quantity must be a whole number greater than zero.");
      }

      const product = productById.get(item.productId);
      if (!product || !product.isActive) {
        throw new InventoryItemUnavailableError(product?.name ?? item.productId);
      }

      if (item.variantId) {
        const variant = variantById.get(item.variantId);
        if (!variant || variant.productId !== item.productId || !variant.isActive || !variant.product.isActive) {
          throw new InventoryItemUnavailableError(variant?.product.name ?? product.name);
        }
      }
    }

    const updatedProducts = productItems.length
      ? await tx.$queryRaw<Array<{ id: string; stockAfter: number }>>`
          UPDATE "Product" AS product
          SET "stock" = product."stock" - requested."quantity",
              "updatedAt" = CURRENT_TIMESTAMP
          FROM (VALUES ${Prisma.join(productItems.map((item) => Prisma.sql`(${item.productId}, ${item.quantity})`))})
            AS requested("id", "quantity")
          WHERE product."id" = requested."id"
            AND product."isActive" = true
            AND product."stock" >= requested."quantity"
          RETURNING product."id" AS "id", product."stock" AS "stockAfter"
        `
      : [];
    const updatedVariants = variantItems.length
      ? await tx.$queryRaw<Array<{ id: string; stockAfter: number }>>`
          UPDATE "ProductVariant" AS variant
          SET "stock" = variant."stock" - requested."quantity",
              "updatedAt" = CURRENT_TIMESTAMP
          FROM (VALUES ${Prisma.join(variantItems.map((item) => Prisma.sql`(${item.variantId}, ${item.quantity})`))})
            AS requested("id", "quantity"),
            "Product" AS product
          WHERE variant."id" = requested."id"
            AND product."id" = variant."productId"
            AND product."isActive" = true
            AND variant."isActive" = true
            AND variant."stock" >= requested."quantity"
          RETURNING variant."id" AS "id", variant."stock" AS "stockAfter"
        `
      : [];
    const productStockById = new Map(updatedProducts.map((product) => [product.id, product.stockAfter]));
    const variantStockById = new Map(updatedVariants.map((variant) => [variant.id, variant.stockAfter]));

    for (const item of aggregatedItems.values()) {
      const stockAfter = item.variantId
        ? variantStockById.get(item.variantId)
        : productStockById.get(item.productId);
      if (stockAfter !== undefined) continue;

      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
          select: { stock: true, isActive: true, product: { select: { name: true, isActive: true } } },
        });
        const label = variant?.product.name ?? productById.get(item.productId)?.name ?? item.productId;
        if (!variant || !variant.isActive || !variant.product.isActive) {
          throw new InventoryItemUnavailableError(label);
        }
        if (variant.stock < item.quantity) throw new InsufficientStockError(label);
        throw new InventoryConflictError(label);
      }

      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { name: true, stock: true, isActive: true },
      });
      const label = product?.name ?? item.productId;
      if (!product || !product.isActive) throw new InventoryItemUnavailableError(label);
      if (product.stock < item.quantity) throw new InsufficientStockError(label);
      throw new InventoryConflictError(label);
    }

    const auditRows = [...aggregatedItems.values()].map((item) => {
      const quantity = item.quantity;
      const stockAfter = item.variantId
        ? variantStockById.get(item.variantId)!
        : productStockById.get(item.productId)!;
      const variant = item.variantId ? variantById.get(item.variantId) : null;
      const product = productById.get(item.productId)!;
      const eventType = auditContext.eventType ?? "STOCK_OUT";

      return {
        productId: item.productId,
        productName: product.name,
        orderId: auditContext.orderId ?? null,
        performedById: auditContext.actorUserId ?? null,
        variantId: item.variantId || null,
        variantSku: variant?.sku ?? null,
        type,
        eventType,
        quantity,
        stockBefore: stockAfter + quantity,
        stockAfter,
        minStockBefore: auditContext.minStockBefore ?? null,
        minStockAfter: auditContext.minStockAfter ?? null,
        reservedBefore: auditContext.reservedBefore ?? (eventType === "RESERVATION_CREATED" || eventType === "RESERVATION_RELEASED" ? (eventType === "RESERVATION_RELEASED" ? quantity : 0) : null),
        reservedAfter: auditContext.reservedAfter ?? (eventType === "RESERVATION_CREATED" || eventType === "RESERVATION_RELEASED" ? (eventType === "RESERVATION_CREATED" ? quantity : 0) : null),
        remarks,
        performedByName: performedByName || null,
        performedByType: auditContext.performedByType ?? (performedByName ? "ADMIN" : "SYSTEM"),
        source: auditContext.source ?? "INVENTORY",
        customerName: auditContext.customerName ?? null,
        orderNumber: auditContext.orderNumber ?? null,
        paymentMethod: paymentAudit.paymentMethod,
        paymentStatus: paymentAudit.paymentStatus,
        paymentReference: paymentAudit.paymentReference,
      };
    });

    await tx.inventoryTransaction.createMany({ data: auditRows });

    return;
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
