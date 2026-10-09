import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

const STORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getStoreCalendarDate(date: Date) {
  const storeDate = new Date(date.getTime() + STORE_UTC_OFFSET_MS);
  return {
    year: storeDate.getUTCFullYear(),
    month: storeDate.getUTCMonth(),
    day: storeDate.getUTCDate(),
  };
}

function getStoreDayStart(date: Date) {
  const { year, month, day } = getStoreCalendarDate(date);
  return new Date(Date.UTC(year, month, day) - STORE_UTC_OFFSET_MS);
}

function shiftStoreDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function getStoreMonthStart(date: Date, monthOffset: number) {
  const { year, month } = getStoreCalendarDate(date);
  return new Date(Date.UTC(year, month + monthOffset, 1) - STORE_UTC_OFFSET_MS);
}

function getMovementWindow(range: string) {
  const now = new Date();
  const todayStart = getStoreDayStart(now);

  if (range === "WEEKLY") {
    return shiftStoreDays(todayStart, -6);
  }

  if (range === "MONTHLY") {
    return shiftStoreDays(todayStart, -29);
  }

  if (range === "ANNUALLY") {
    return getStoreMonthStart(now, -11);
  }

  return todayStart;
}

function parseDateInput(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(calendarDate.getTime() - STORE_UTC_OFFSET_MS);
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:analytics:get", "admin");
  if (rateLimitResponse) return rateLimitResponse;

  const range = request.nextUrl.searchParams.get("range")?.toUpperCase() ?? "DAILY";
  const includeToday = request.nextUrl.searchParams.get("includeToday") === "true";
  const requestedStart = parseDateInput(request.nextUrl.searchParams.get("from"));
  const requestedEnd = parseDateInput(request.nextUrl.searchParams.get("to"));
  const customStart = requestedStart && requestedEnd && requestedStart <= requestedEnd ? requestedStart : null;
  const customEnd = customStart && requestedEnd !== null ? new Date(requestedEnd) : null;
  if (customEnd) customEnd.setTime(customEnd.getTime() + DAY_MS);
  const movementWindowStart = customStart ?? getMovementWindow(range);
  const orderDateFilter = customStart && customEnd
    ? { createdAt: { gte: customStart, lt: customEnd } }
    : movementWindowStart
      ? { createdAt: { gte: movementWindowStart } }
      : undefined;
  const completedDateFilter = customStart && customEnd
    ? { updatedAt: { gte: customStart, lt: customEnd } }
    : movementWindowStart
      ? { updatedAt: { gte: movementWindowStart } }
      : undefined;
  const todayStart = getStoreDayStart(new Date());
  const tomorrowStart = shiftStoreDays(todayStart, 1);

  const [customers, productCount, activeOrders, lowStock, revenue, completedOrders, completedOrderCount, statusBreakdown, todayStatusBreakdown, todayCompletedOrderCount, inventoryProducts, posOrders, ecommerceOrders, topProducts, pendingOrders, cancelledOrders, completedOrderItems, inventoryMovement, allProducts, allCategories] = await Promise.all([
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count(),
    prisma.order.count({ where: { status: { notIn: ["CANCELLED", "COMPLETED"] }, ...orderDateFilter } }),
    prisma.product.findMany({
      select: { id: true, name: true, stock: true, minStock: true, hasVariants: true, variants: { where: { isActive: true }, select: { id: true, sku: true, stock: true, minStock: true, attributes: true } } },
      orderBy: { stock: "asc" },
    }),
    prisma.order.aggregate({
      where: { status: "COMPLETED", ...completedDateFilter },
      _sum: { totalAmount: true },
    }),
    prisma.order.findMany({
      where: { status: "COMPLETED", ...completedDateFilter },
      select: { updatedAt: true, totalAmount: true },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.order.count({
      where: { status: "COMPLETED", ...completedDateFilter },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: orderDateFilter,
      _count: { id: true },
    }),
    includeToday
      ? prisma.order.groupBy({
          by: ["status"],
          where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    includeToday
      ? prisma.order.count({
          where: { status: "COMPLETED", updatedAt: { gte: todayStart, lt: tomorrowStart } },
        })
      : Promise.resolve(0),
    prisma.product.findMany({
      select: { price: true, cost: true, stock: true, hasVariants: true, variants: { select: { price: true, cost: true, stock: true, isActive: true } } },
    }),
    prisma.order.groupBy({
      by: ["isWalkIn"],
      where: { status: "COMPLETED", ...completedDateFilter },
      _count: { id: true },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { status: "COMPLETED", userId: { not: null }, ...completedDateFilter },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          status: "COMPLETED",
          ...completedDateFilter,
        }
      },
      _sum: { quantity: true, subtotal: true },
      _count: { id: true },
      orderBy: [{ _sum: { quantity: "desc" } }],
    }),
    prisma.order.count({ where: { status: "PENDING", ...orderDateFilter } }),
    prisma.order.count({ where: { status: "CANCELLED", ...orderDateFilter } }),
    prisma.orderItem.findMany({
      where: { order: { status: "COMPLETED", ...completedDateFilter } },
      select: {
        quantity: true,
        subtotal: true,
        product: {
          select: {
            name: true,
            category: {
              select: { name: true },
            },
          },
        },
      },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ["type"],
      where: movementWindowStart ? { createdAt: { gte: movementWindowStart } } : undefined,
      _sum: { quantity: true },
      _count: { id: true },
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        imageUrl: true,
        categoryId: true,
        category: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalCost = inventoryProducts.reduce((sum, product) => {
    if (product.hasVariants) {
      return sum + product.variants.filter((variant) => variant.isActive).reduce((variantSum, variant) => variantSum + Number(variant.cost ?? 0) * Number(variant.stock ?? 0), 0);
    }
    const unitCost = Number(product.cost ?? 0);
    const quantity = Number(product.stock ?? 0);
    return sum + unitCost * quantity;
  }, 0);

  const totalPrice = inventoryProducts.reduce((sum, product) => {
    if (product.hasVariants) {
      return sum + product.variants.filter((variant) => variant.isActive).reduce((variantSum, variant) => variantSum + Number(variant.price ?? 0) * Number(variant.stock ?? 0), 0);
    }
    return sum + Number(product.price ?? 0) * Number(product.stock ?? 0);
  }, 0);

  const lowStockItems = lowStock.flatMap((product) => {
    if (!product.hasVariants) {
      return Number(product.stock) <= Number(product.minStock) ? [{ id: product.id, name: product.name, stock: Number(product.stock), minStock: Number(product.minStock) }] : [];
    }
    return product.variants
      .filter((variant) => Number(variant.stock) <= Number(variant.minStock))
      .map((variant) => ({ id: variant.id, name: `${product.name} - ${variant.sku}`, stock: Number(variant.stock), minStock: Number(variant.minStock) }));
  }).sort((a, b) => a.stock - b.stock).slice(0, 10);

  const productNameMap = new Map(allProducts.map((product) => [product.id, product.name]));

  // Calculate POS vs Ecommerce breakdown
  const posSalesData = posOrders.find((item) => item.isWalkIn === true) || { _count: { id: 0 }, _sum: { totalAmount: 0 } };

  const channelComparison = [
    {
      name: "POS (Walk-in)",
      orders: posSalesData._count.id,
      revenue: Number(posSalesData._sum.totalAmount ?? 0),
    },
    {
      name: "Ecommerce",
      orders: ecommerceOrders._count.id,
      revenue: Number(ecommerceOrders._sum.totalAmount ?? 0),
    },
  ];

  const allStatusNames = ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const;
  const statusBreakdownMap = new Map<string, { name: string; orders: number }>();

  allStatusNames.forEach((status) => {
    statusBreakdownMap.set(status, { name: status, orders: 0 });
  });

  statusBreakdown.forEach((item) => {
    statusBreakdownMap.set(item.status, {
      name: item.status,
      orders: item._count.id,
    });
  });

  statusBreakdownMap.set("COMPLETED", {
    name: "COMPLETED",
    orders: completedOrderCount,
  });

  const statusBreakdownSeries = Array.from(statusBreakdownMap.values());
  const totalCompletedOrders = statusBreakdownMap.get("COMPLETED")?.orders || 0;
  const totalNonCancelledOrders = allStatusNames
    .filter((status) => status !== "CANCELLED")
    .reduce((sum, status) => sum + (statusBreakdownMap.get(status)?.orders || 0), 0);
  const completionRate = totalNonCancelledOrders > 0 ? ((totalCompletedOrders / totalNonCancelledOrders) * 100).toFixed(1) : "0";
  const avgOrderValue = totalCompletedOrders > 0 ? (Number(revenue._sum.totalAmount ?? 0) / totalCompletedOrders).toFixed(2) : "0";
  const todayStatusMap = new Map(todayStatusBreakdown.map((item) => [item.status, item._count.id]));
  todayStatusMap.set("COMPLETED", todayCompletedOrderCount);

  const stockInQuantity = inventoryMovement
    .filter((item) => item.type === "STOCK_IN")
    .reduce((sum, item) => sum + Number(item._sum.quantity ?? 0), 0);

  const stockOutQuantity = inventoryMovement
    .filter((item) => item.type === "STOCK_OUT")
    .reduce((sum, item) => sum + Number(item._sum.quantity ?? 0), 0);

  const netMovement = stockInQuantity - stockOutQuantity;

  const salesByCategoryMap = new Map<string, { name: string; revenue: number; quantity: number }>();
  const salesByProductMap = new Map<string, { name: string; revenue: number; quantity: number }>();

  allCategories.forEach((category) => {
    salesByCategoryMap.set(category.name, {
      name: category.name,
      revenue: 0,
      quantity: 0,
    });
  });

  allProducts.forEach((product) => {
    salesByProductMap.set(product.name, {
      name: product.name,
      revenue: 0,
      quantity: 0,
    });
  });

  completedOrderItems.forEach((item) => {
    const categoryName = item.product?.category?.name || "Uncategorized";
    const productName = item.product?.name || "Unknown";
    const quantity = Number(item.quantity ?? 0);
    const revenue = Number(item.subtotal ?? 0);

    const categoryEntry = salesByCategoryMap.get(categoryName) || { name: categoryName, revenue: 0, quantity: 0 };
    categoryEntry.revenue += revenue;
    categoryEntry.quantity += quantity;
    salesByCategoryMap.set(categoryName, categoryEntry);

    const productEntry = salesByProductMap.get(productName) || { name: productName, revenue: 0, quantity: 0 };
    productEntry.revenue += revenue;
    productEntry.quantity += quantity;
    salesByProductMap.set(productName, productEntry);
  });

  const salesByCategory = Array.from(salesByCategoryMap.values()).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const salesByProduct = Array.from(salesByProductMap.values()).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  const inventoryHealth = {
    lowStockCount: lowStockItems.length,
    outOfStockCount: inventoryProducts.reduce((count, product) => product.hasVariants
      ? count + product.variants.filter((variant) => variant.isActive && Number(variant.stock ?? 0) === 0).length
      : count + (Number(product.stock ?? 0) === 0 ? 1 : 0), 0),
    averageStock: inventoryProducts.length > 0
      ? Number((inventoryProducts.reduce((sum, product) => product.hasVariants
        ? sum + product.variants.filter((variant) => variant.isActive).reduce((variantSum, variant) => variantSum + Number(variant.stock ?? 0), 0)
        : sum + Number(product.stock ?? 0), 0) / inventoryProducts.length).toFixed(1))
      : 0,
  };

  const revenueTrend: { label: string; revenue: number }[] = [];
  const now = new Date();
  const dailyBucketCount = customStart && customEnd
    ? Math.min(Math.max(Math.ceil((customEnd.getTime() - customStart.getTime()) / 86400000), 1), 90)
    : range === "DAILY" ? 1 : range === "WEEKLY" ? 7 : range === "MONTHLY" ? 30 : 0;

  if (range === "ANNUALLY" && !customStart) {
    for (let offset = 11; offset >= 0; offset -= 1) {
      const bucketStart = getStoreMonthStart(now, -offset);
      const bucketEnd = getStoreMonthStart(now, -offset + 1);
      const revenueForBucket = completedOrders
        .filter((order) => order.updatedAt >= bucketStart && order.updatedAt < bucketEnd)
        .reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);

      revenueTrend.push({
        label: bucketStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "Asia/Manila" }),
        revenue: Number(revenueForBucket.toFixed(2)),
      });
    }
  } else {
    const firstBucket = customStart
      ? new Date(customStart)
      : shiftStoreDays(getStoreDayStart(now), -dailyBucketCount + 1);

    for (let offset = 0; offset < dailyBucketCount; offset += 1) {
      const bucketStart = shiftStoreDays(firstBucket, offset);
      const bucketEnd = shiftStoreDays(bucketStart, 1);
      const revenueForBucket = completedOrders
        .filter((order) => order.updatedAt >= bucketStart && order.updatedAt < bucketEnd)
        .reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);

      revenueTrend.push({
        label: bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" }),
        revenue: Number(revenueForBucket.toFixed(2)),
      });
    }
  }

  const topProductsById = new Map<string, { productId: string; quantity: number; revenue: number; orders: number }>();

  topProducts.forEach((item) => {
    topProductsById.set(item.productId, {
      productId: item.productId,
      quantity: Number(item._sum.quantity ?? 0),
      revenue: Number(item._sum.subtotal ?? 0),
      orders: item._count.id,
    });
  });

  const topProductsWithSales = Array.from(topProductsById.values())
    .map((summary) => ({
      ...summary,
      name: productNameMap.get(summary.productId) || "Unknown product",
      imageUrl: allProducts.find((product) => product.id === summary.productId)?.imageUrl ?? null,
      categoryName: allProducts.find((product) => product.id === summary.productId)?.category?.name ?? "Uncategorized",
    }))
    .sort((left, right) => right.revenue - left.revenue || right.quantity - left.quantity || left.name.localeCompare(right.name));

  return NextResponse.json({
    customers,
    products: productCount,
    orders: activeOrders,
    pendingOrders,
    cancelledOrders,
    completedOrders: totalCompletedOrders,
    lowStock: lowStockItems,
    revenue: Number(revenue._sum.totalAmount ?? 0),
    totalCost: Number(totalCost.toFixed(2)),
    totalPrice: Number(totalPrice.toFixed(2)),
    revenueTrend,
    statusBreakdown: statusBreakdownSeries,
    channelComparison,
    topProducts: topProductsWithSales.slice(0, 5),
    ...(includeToday
      ? {
          todayStats: {
            pendingOrders: todayStatusMap.get("PENDING") ?? 0,
            cancelledOrders: todayStatusMap.get("CANCELLED") ?? 0,
            completedOrders: todayStatusMap.get("COMPLETED") ?? 0,
          },
        }
      : {}),
    completionRate: Number(completionRate),
    avgOrderValue: Number(avgOrderValue),
    salesByCategory,
    salesByProduct,
    inventoryHealth,
    inventoryMovement: {
      stockIn: stockInQuantity,
      stockOut: stockOutQuantity,
      netChange: netMovement,
      lowStockCount: lowStockItems.length,
    },
  });
}
