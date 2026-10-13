import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const STORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseStoreDateStart(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return undefined;
  }

  return new Date(calendarDate.getTime() - STORE_UTC_OFFSET_MS);
}

export async function GET(request: Request) {
  const userId = await ensureAuthenticatedAdmin();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  const rateLimitResponse = await enforceRateLimit(request, "admin:reports:get", { group: "admin", accountId: userId });
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const category = searchParams.get("category");

  const fromDate = parseStoreDateStart(startDate);
  const endDateStart = parseStoreDateStart(endDate);
  const toDateExclusive = endDateStart ? new Date(endDateStart.getTime() + DAY_MS) : undefined;

  if (toDateExclusive && fromDate && toDateExclusive <= fromDate) {
    return NextResponse.json({ message: "End date cannot be earlier than start date." }, { status: 400 });
  }

  const whereClause = {
    status: "COMPLETED" as const,
    items: { some: {} },
    // Completed orders are terminal, so updatedAt is the timestamp of completion.
    ...(fromDate || toDateExclusive
      ? {
          updatedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDateExclusive ? { lt: toDateExclusive } : {}),
          },
        }
      : {}),
  };

  const productWhere = category ? { categoryId: category } : {};

  const recentOrdersWhere = {
    ...whereClause,
    ...(category
      ? {
          items: {
            some: {
              product: { categoryId: category },
            },
          },
        }
      : {}),
  };

  const [orders, lowStockProducts, allProducts, completedOrderItems, categories, settings] = await Promise.all([
    prisma.order.findMany({
      where: recentOrdersWhere,
      select: {
        id: true,
        orderNumber: true,
        updatedAt: true,
        isWalkIn: true,
        paymentMethod: true,
        totalAmount: true,
        items: {
          where: category
            ? {
                product: { categoryId: category },
              }
            : {},
          select: {
            quantity: true,
            price: true,
            subtotal: true,
            productNameSnapshot: true,
            productSkuSnapshot: true,
            variantSkuSnapshot: true,
            variantAttributesSnapshot: true,
            product: {
              select: { name: true, sku: true, cost: true },
            },
            variant: {
              select: { sku: true, attributes: true, cost: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.product.findMany({
      where: productWhere,
      select: { id: true, name: true, stock: true, minStock: true, sku: true, price: true, cost: true, hasVariants: true, variants: { where: { isActive: true }, select: { id: true, sku: true, stock: true, minStock: true, price: true, cost: true, attributes: true } } },
      orderBy: { stock: "asc" },
    }),
    prisma.product.findMany({
      where: productWhere,
      select: { id: true, name: true, sku: true, stock: true, cost: true, price: true, hasVariants: true, variants: { select: { id: true, sku: true, attributes: true, minStock: true, cost: true, price: true, stock: true, isActive: true } } },
    }),
    prisma.orderItem.findMany({
      where: {
        order: whereClause,
        ...(category ? { product: { categoryId: category } } : {}),
      },
      select: {
        orderId: true,
        productId: true,
        variantId: true,
        quantity: true,
        subtotal: true,
        product: { select: { cost: true } },
        variant: { select: { sku: true, attributes: true, cost: true } },
        order: { select: { isWalkIn: true, paymentMethod: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.appSetting.findUnique({
      where: { key: "default" },
      select: { registeredBusinessName: true, businessAddress: true },
    }),
  ]);

  const productMap = new Map(allProducts.map((product) => [product.id, product]));

  const getVariantLabel = (attributes: string | null | undefined, sku: string) => {
    if (!attributes) return sku;
    try {
      const parsed = JSON.parse(attributes) as Record<string, unknown>;
      const values = Object.values(parsed).filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
      return values.length ? values.join(" / ") : sku;
    } catch {
      return sku;
    }
  };

  type ProductSalesEntry = {
    productId: string;
    variantId: string | null;
    variant: { sku: string; attributes: string | null } | null;
    quantity: number;
    revenue: number;
  };

  const completedOrderIds = new Set<string>();
  const salesByChannel = new Map<string, { orderIds: Set<string>; revenueCents: number }>();
  const salesByPaymentMethod = new Map<string, { orderIds: Set<string>; revenueCents: number }>();
  let totalRevenueCents = 0;
  let grossProfitCents = 0;
  let totalItemsSold = 0;

  for (const item of completedOrderItems) {
    const quantity = Number(item.quantity ?? 0);
    const revenueCents = Math.round(Number(item.subtotal ?? 0) * 100);
    const unitCostCents = Math.round(Number(item.variant?.cost ?? item.product.cost ?? 0) * 100);
    const grossProfitCentsForItem = revenueCents - quantity * unitCostCents;
    const channel = item.order.isWalkIn ? "Walk-in / POS" : "Online orders";
    const paymentMethod = item.order.paymentMethod === "PAYMAYA"
      ? "Maya"
      : item.order.paymentMethod === "GCASH"
        ? "GCash"
        : "Cash";

    completedOrderIds.add(item.orderId);
    totalItemsSold += quantity;
    totalRevenueCents += revenueCents;
    grossProfitCents += grossProfitCentsForItem;

    const channelSales = salesByChannel.get(channel) ?? { orderIds: new Set<string>(), revenueCents: 0 };
    channelSales.orderIds.add(item.orderId);
    channelSales.revenueCents += revenueCents;
    salesByChannel.set(channel, channelSales);

    const paymentSales = salesByPaymentMethod.get(paymentMethod) ?? { orderIds: new Set<string>(), revenueCents: 0 };
    paymentSales.orderIds.add(item.orderId);
    paymentSales.revenueCents += revenueCents;
    salesByPaymentMethod.set(paymentMethod, paymentSales);
  }

  const grossProfit = grossProfitCents / 100;
  const lowStockItems = lowStockProducts.flatMap((product) => product.hasVariants
    ? product.variants.filter((variant) => Number(variant.stock) <= Number(variant.minStock)).map((variant) => ({ id: variant.id, name: `${product.name} (${getVariantLabel(variant.attributes, variant.sku)})`, stock: Number(variant.stock), minStock: Number(variant.minStock), sku: variant.sku, price: variant.price, cost: variant.cost, stockValue: Number(variant.cost ?? 0) * Number(variant.stock ?? 0) }))
    : Number(product.stock) <= Number(product.minStock) ? [{ id: product.id, name: product.name, stock: Number(product.stock), minStock: Number(product.minStock), sku: product.sku, price: product.price, cost: product.cost, stockValue: Number(product.cost ?? 0) * Number(product.stock ?? 0) }] : []);
  const stockValue = allProducts.reduce((sum, product) => product.hasVariants
    ? sum + product.variants.filter((variant) => variant.isActive).reduce((variantSum, variant) => variantSum + Number(variant.cost ?? 0) * Number(variant.stock ?? 0), 0)
    : sum + Number(product.cost ?? 0) * Number(product.stock ?? 0), 0);
  const retailValue = allProducts.reduce((sum, product) => product.hasVariants
    ? sum + product.variants.filter((variant) => variant.isActive).reduce((variantSum, variant) => variantSum + Number(variant.price ?? 0) * Number(variant.stock ?? 0), 0)
    : sum + Number(product.price ?? 0) * Number(product.stock ?? 0), 0);

  const productSales = completedOrderItems.reduce((map, item) => {
    const productKey = `${item.productId}:${item.variantId ?? "parent"}`;
    const existing = map.get(productKey) ?? { productId: item.productId, variantId: item.variantId, variant: item.variant, quantity: 0, revenue: 0 };
    existing.quantity += Number(item.quantity ?? 0);
    existing.revenue += Number(item.subtotal ?? 0);
    map.set(productKey, existing);
    return map;
  }, new Map<string, ProductSalesEntry>());

  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.quantity - a.quantity)
    .map((entry) => {
      const product = productMap.get(entry.productId);
      const variantLabel = entry.variant ? getVariantLabel(entry.variant.attributes, entry.variant.sku) : null;
      return {
        id: entry.variantId ?? entry.productId,
        name: product ? `${product.name}${variantLabel ? ` (${variantLabel})` : ""}` : "Unknown product",
        sku: entry.variant?.sku ?? product?.sku ?? "-",
        unitsSold: entry.quantity,
        revenue: Number(entry.revenue.toFixed(2)),
      };
    });

  const channelBreakdown = Object.fromEntries(
    Array.from(salesByChannel, ([label, values]) => [
      label,
      { count: values.orderIds.size, revenue: values.revenueCents / 100 },
    ]),
  );

  const paymentBreakdown = Object.fromEntries(
    Array.from(salesByPaymentMethod, ([label, values]) => [
      label,
      { count: values.orderIds.size, revenue: values.revenueCents / 100 },
    ]),
  );

  return NextResponse.json({
    business: {
      name: settings?.registeredBusinessName ?? "APAYAO PASALUBONG CENTER",
      address: settings?.businessAddress ?? "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
    },
    summary: {
      totalRevenue: totalRevenueCents / 100,
      grossProfit,
      completedOrders: completedOrderIds.size,
      totalItemsSold,
      lowStockCount: lowStockItems.length,
      stockValue: Number(stockValue.toFixed(2)),
      retailValue: Number(retailValue.toFixed(2)),
      activeProducts: allProducts.length,
    },
    channelBreakdown,
    paymentBreakdown,
    recentOrders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.items
        .reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0)
        .toFixed(2),
      grossProfit: order.items.reduce(
        (sum, item) => sum
          + Math.round(Number(item.subtotal ?? 0) * 100)
          - Number(item.quantity ?? 0) * Math.round(Number(item.variant?.cost ?? item.product?.cost ?? 0) * 100),
        0,
      ) / 100,
      completedAt: order.updatedAt,
      itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
      items: order.items.map((item) => ({
        quantity: Number(item.quantity ?? 0),
        sku: item.variantSkuSnapshot || item.productSkuSnapshot || item.variant?.sku || item.product?.sku || "-",
        productName: item.productNameSnapshot
          ? `${item.productNameSnapshot}${item.variantSkuSnapshot || item.variantAttributesSnapshot
              ? ` (${getVariantLabel(item.variantAttributesSnapshot, item.variantSkuSnapshot ?? "Variant")})`
              : ""}`
          : item.product
          ? `${item.product.name}${item.variant ? ` (${getVariantLabel(item.variant.attributes, item.variant.sku)})` : ""}`
          : "Unknown product",
        unitPrice: Number(item.price ?? 0),
        unitCost: Number(item.variant?.cost ?? item.product?.cost ?? 0),
        subtotal: Number(item.subtotal ?? 0),
        grossProfit: (
          Math.round(Number(item.subtotal ?? 0) * 100)
          - Number(item.quantity ?? 0) * Math.round(Number(item.variant?.cost ?? item.product?.cost ?? 0) * 100)
        ) / 100,
      })),
    })),
    lowStock: lowStockItems,
    topProducts,
    inventoryItems: allProducts.flatMap((product) => product.hasVariants
      ? product.variants.filter((variant) => variant.isActive).map((variant) => ({
          id: variant.id,
          name: `${product.name} (${getVariantLabel(variant.attributes, variant.sku)})`,
          sku: variant.sku,
          stock: Number(variant.stock ?? 0),
          cost: Number(variant.cost ?? 0).toFixed(2),
          price: Number(variant.price ?? 0).toFixed(2),
          stockValue: (Number(variant.cost ?? 0) * Number(variant.stock ?? 0)).toFixed(2),
        }))
      : [{
          id: product.id,
          name: product.name,
          sku: product.sku,
          stock: Number(product.stock ?? 0),
          cost: Number(product.cost ?? 0).toFixed(2),
          price: Number(product.price ?? 0).toFixed(2),
          stockValue: (Number(product.cost ?? 0) * Number(product.stock ?? 0)).toFixed(2),
        }]),
    categories,
  });
}
