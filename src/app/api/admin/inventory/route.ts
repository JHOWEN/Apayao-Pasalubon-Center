import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { InventoryType, Prisma } from "@prisma/client";
import { canAccessAdminPortal, verifyToken } from "@/lib/auth";
import { normalizeArchiveAction, normalizeArchiveFilter, normalizeArchiveIds } from "@/lib/inventory-transaction-archive";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

async function ensureAdminOnly() {
  const token = (await cookies()).get("token")?.value;
  const payload = token ? (verifyToken(token) as { sub?: string; role?: string } | null) : null;
  if (!payload?.sub || !canAccessAdminPortal(payload.role)) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true } });
  return user && canAccessAdminPortal(user.role) ? payload.sub : null;
}

function getVariantLabel(attributes: string | null | undefined, sku: string) {
  if (!attributes) return sku;

  try {
    const parsed = JSON.parse(attributes) as Record<string, unknown>;
    const values = Object.values(parsed).filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    return values.length ? values.join(" / ") : sku;
  } catch {
    return sku;
  }
}

export async function GET(request: Request) {
  const userId = await ensureAdminOnly();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const exportAll = searchParams.get("export") === "1";
  const limit = exportAll ? 10000 : Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 15) || 15));
  const search = searchParams.get("search")?.trim() ?? "";
  const type = searchParams.get("type") ?? "ALL";
  const source = searchParams.get("source")?.trim().toUpperCase() ?? "";
  const movementType = ["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "RETURN"].includes(type)
    ? (type as InventoryType)
    : undefined;
  const eventType = ["RESERVATION_CREATED", "RESERVATION_FULFILLED", "RESERVATION_RELEASED", "POS_SALE", "THRESHOLD_ADJUSTMENT"].includes(type)
    ? type
    : undefined;
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const archiveMode = normalizeArchiveFilter(searchParams.get("archiveMode"));
  const createdAt = fromDate || toDate
    ? {
        ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00.000Z`) } : {}),
        ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999Z`) } : {}),
      }
    : undefined;
  const where: Prisma.InventoryTransactionWhereInput = {
    isArchived: archiveMode === "archived" ? true : false,
    ...(movementType ? { type: movementType } : {}),
    ...(eventType ? { eventType } : {}),
    ...(source ? { source } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(search
      ? {
          OR: [
            { productName: { contains: search, mode: "insensitive" as const } },
            { remarks: { contains: search, mode: "insensitive" as const } },
            { performedByName: { contains: search, mode: "insensitive" as const } },
            { customerName: { contains: search, mode: "insensitive" as const } },
            { orderNumber: { contains: search, mode: "insensitive" as const } },
            { product: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const countWhere = { ...where };
  delete countWhere.type;
  const returnWhere: Prisma.InventoryTransactionWhereInput = {
    ...countWhere,
    AND: [
      {
        OR: [
          { type: "RETURN" },
          { type: "STOCK_IN", remarks: { contains: "cancelled - stock returned", mode: "insensitive" } },
        ],
      },
    ],
  };
  if (movementType === "RETURN") {
    delete where.type;
    where.AND = [
      {
        OR: [
          { type: "RETURN" },
          { type: "STOCK_IN", remarks: { contains: "cancelled - stock returned", mode: "insensitive" } },
        ],
      },
    ];
  }

  const [transactions, totalCount, stockInCount, stockOutCount, adjustmentCount, returnCount, posSaleCount, reservationCreatedCount, reservationFulfilledCount, reservationReleasedCount] = await Promise.all([
    prisma.inventoryTransaction.findMany({
    where,
    include: {
      product: true,
      variant: {
        select: {
          sku: true,
          attributes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    }),
    prisma.inventoryTransaction.count({ where }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, type: "STOCK_IN" } }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, type: "STOCK_OUT" } }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, type: "ADJUSTMENT", quantity: { not: 0 } } }),
    prisma.inventoryTransaction.count({ where: returnWhere }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, eventType: "POS_SALE" } }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, eventType: "RESERVATION_CREATED" } }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, eventType: "RESERVATION_FULFILLED" } }),
    prisma.inventoryTransaction.count({ where: { ...countWhere, eventType: "RESERVATION_RELEASED" } }),
  ]);

  const counts = { STOCK_IN: stockInCount, STOCK_OUT: stockOutCount, ADJUSTMENT: adjustmentCount, RETURN: returnCount, POS_SALE: posSaleCount, RESERVATION_CREATED: reservationCreatedCount, RESERVATION_FULFILLED: reservationFulfilledCount, RESERVATION_RELEASED: reservationReleasedCount };

  return NextResponse.json(
    {
      transactions: transactions.map((transaction) => {
      const variantLabel = transaction.variant ? getVariantLabel(transaction.variant.attributes, transaction.variant.sku) : null;
      const productLabel = transaction.product?.name ?? transaction.productName ?? "Unknown product";
      const isLegacyReturn = transaction.type === "STOCK_IN" && transaction.remarks?.toLowerCase().includes("cancelled - stock returned");
      const displayType = isLegacyReturn ? "RETURN" : transaction.type;

      return {
        ...transaction,
        type: displayType,
        productName: productLabel,
        productDisplayName: transaction.product ? `${productLabel}${variantLabel ? ` (${variantLabel})` : ""}` : productLabel,
        variantLabel,
        quantity: Number(transaction.quantity),
        paymentMethod: transaction.paymentMethod ?? null,
        paymentStatus: transaction.paymentStatus ?? null,
        paymentReference: transaction.paymentReference ?? null,
      };
      }),
      pagination: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
      counts,
    }
  );
}

export async function PATCH(request: Request) {
  try {
    const userId = await ensureAdminOnly();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const action = normalizeArchiveAction(body?.action);
    const ids = normalizeArchiveIds(body?.ids ?? body?.id);

    if (!action) {
      return NextResponse.json({ success: false, message: "Archive action must be either 'archive' or 'restore'." }, { status: 400 });
    }

    if (!ids.length) {
      return NextResponse.json({ success: false, message: "Transaction id is required." }, { status: 400 });
    }

    const existingTransactions = await prisma.inventoryTransaction.findMany({
      where: { id: { in: ids } },
      select: { id: true, isArchived: true },
    });
    const foundIds = existingTransactions.map((transaction) => transaction.id);
    const missingIds = ids.filter((id) => !foundIds.includes(id));

    if (missingIds.length) {
      return NextResponse.json({ success: false, message: "One or more transactions could not be found." }, { status: 404 });
    }

    const result = await prisma.inventoryTransaction.updateMany({
      where: { id: { in: ids } },
      data: {
        isArchived: action === "archive",
        archivedAt: action === "archive" ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, action, updatedCount: result.count, ids });
  } catch (error) {
    console.error("[PATCH /api/admin/inventory] archive update failed:", error);
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update transaction archive state.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await ensureAdminOnly();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });

    const body = await request.json();

    const { productId, variantId, type, quantity, remarks, minStock } = body;

    if (!productId || !type || quantity === undefined) {
      return NextResponse.json(
        { success: false, message: "Product, type, and quantity are required." },
        { status: 400 }
      );
    }

    const quantityValue = Number(quantity);
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });
    }

    const isVariantProduct = Boolean(product.hasVariants);
    if (isVariantProduct && !variantId) {
      return NextResponse.json({ success: false, message: "Please choose a variant for this product before updating stock." }, { status: 400 });
    }

    const variant = variantId
      ? await prisma.productVariant.findFirst({ where: { id: String(variantId), productId }, select: { id: true, stock: true, minStock: true, isActive: true } })
      : null;
    if (variantId && (!variant || !variant.isActive)) {
      return NextResponse.json({ success: false, message: "Variant not found or inactive." }, { status: 404 });
    }

    const isVariantTarget = Boolean(variantId && variant);
    const baseStock = isVariantTarget ? Number(variant?.stock ?? 0) : Number(product.stock ?? 0);
    const baseMinStock = isVariantTarget ? Number(variant?.minStock ?? 5) : Number(product.minStock ?? 5);
    const minStockValue = Number(minStock ?? baseMinStock ?? 5);
    const isThresholdOnlyUpdate = type === "ADJUSTMENT" && quantityValue === 0;
    let newStock = baseStock;

    if (type === "STOCK_IN" || type === "RETURN") {
      newStock = baseStock + quantityValue;
    } else if (type === "STOCK_OUT") {
      newStock = baseStock - quantityValue;
    } else if (type === "ADJUSTMENT" && !isThresholdOnlyUpdate) {
      newStock = quantityValue;
    }

    const normalizedRemarks =
      remarks?.trim() ||
      (isThresholdOnlyUpdate
        ? "Updated minimum stock threshold"
        : type === "STOCK_IN"
          ? "Direct stock addition by admin"
          : type === "STOCK_OUT"
            ? "Direct stock deduction by admin"
            : "Direct inventory adjustment by admin");

    const transaction = await prisma.$transaction(async (tx) => {
      if (variant) {
        await tx.productVariant.update({ where: { id: variant.id, stock: type === "STOCK_OUT" || type === "ADJUSTMENT" ? { gte: type === "ADJUSTMENT" && !isThresholdOnlyUpdate ? 0 : quantityValue } : undefined }, data: { stock: newStock, minStock: isThresholdOnlyUpdate ? minStockValue : variant.minStock } });
      } else {
        await tx.product.update({ where: { id: productId, stock: type === "STOCK_OUT" || type === "ADJUSTMENT" ? { gte: type === "ADJUSTMENT" && !isThresholdOnlyUpdate ? 0 : quantityValue } : undefined }, data: { stock: newStock, minStock: isThresholdOnlyUpdate ? minStockValue : product.minStock } });
      }

      return tx.inventoryTransaction.create({ data: { productId, productName: product.name, variantId: variant?.id ?? null, type, eventType: isThresholdOnlyUpdate ? "THRESHOLD_ADJUSTMENT" : type, quantity: isThresholdOnlyUpdate ? minStockValue : quantityValue, stockBefore: baseStock, stockAfter: newStock, remarks: normalizedRemarks, performedByName: actor?.name ?? null, performedByType: actor?.role ?? "ADMIN", source: "INVENTORY" } });
    });

    return NextResponse.json({ success: true, transaction }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: getUserFacingErrorMessage(error, "Unable to process inventory update.") },
      { status: 500 }
    );
  }
}

