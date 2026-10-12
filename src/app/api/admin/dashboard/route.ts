import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

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

  if (range === "WEEKLY") return shiftStoreDays(todayStart, -6);
  if (range === "MONTHLY") return shiftStoreDays(todayStart, -29);
  if (range === "ANNUALLY") return getStoreMonthStart(now, -11);
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
  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:dashboard:get", "admin");
  if (rateLimitResponse) return rateLimitResponse;

  const range = request.nextUrl.searchParams.get("range")?.toUpperCase() ?? "DAILY";
  const requestedStart = parseDateInput(request.nextUrl.searchParams.get("from"));
  const requestedEnd = parseDateInput(request.nextUrl.searchParams.get("to"));
  const customStart = requestedStart && requestedEnd && requestedStart <= requestedEnd ? requestedStart : null;
  const customEnd = customStart && requestedEnd ? new Date(requestedEnd.getTime() + DAY_MS) : null;
  const rangeStart = customStart ?? getMovementWindow(range);
  const completedDateFilter: Prisma.OrderWhereInput = {
    status: "COMPLETED",
    updatedAt: { gte: rangeStart, ...(customEnd ? { lt: customEnd } : {}) },
  };
  const orderDateFilter: Prisma.OrderWhereInput = {
    createdAt: { gte: rangeStart, ...(customEnd ? { lt: customEnd } : {}) },
  };
  const todayStart = getStoreDayStart(new Date());
  const tomorrowStart = shiftStoreDays(todayStart, 1);

  const [productCount, statusBreakdown, completedSalesRows, todayStatusBreakdown, todayCompletedCount, topProductGroups, lowStockItems, inventoryValueRows, salesByCategoryRows] = await Promise.all([
    prisma.product.count(),
    prisma.order.groupBy({ by: ["status"], where: orderDateFilter, _count: { id: true } }),
    prisma.$queryRaw<Array<{
      completedCount: number;
      revenue: number;
      posOrders: number;
      posRevenue: number;
      ecommerceOrders: number;
      ecommerceRevenue: number;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::int AS "completedCount",
        COALESCE(SUM("totalAmount") FILTER (WHERE "status" = 'COMPLETED'), 0)::double precision AS "revenue",
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED' AND "isWalkIn" = true)::int AS "posOrders",
        COALESCE(SUM("totalAmount") FILTER (WHERE "status" = 'COMPLETED' AND "isWalkIn" = true), 0)::double precision AS "posRevenue",
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED' AND "userId" IS NOT NULL)::int AS "ecommerceOrders",
        COALESCE(SUM("totalAmount") FILTER (WHERE "status" = 'COMPLETED' AND "userId" IS NOT NULL), 0)::double precision AS "ecommerceRevenue"
      FROM "Order"
      WHERE "status" = 'COMPLETED'
        AND "updatedAt" >= ${rangeStart}
        AND (${customEnd}::timestamptz IS NULL OR "updatedAt" < ${customEnd})
    `,
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
      _count: { id: true },
    }),
    prisma.order.count({
      where: { status: "COMPLETED", updatedAt: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: completedDateFilter },
      _sum: { quantity: true, subtotal: true },
      _count: { id: true },
      orderBy: [{ _sum: { subtotal: "desc" } }, { _sum: { quantity: "desc" } }],
      take: 5,
    }),
    prisma.$queryRaw<Array<{ id: string; name: string; stock: number; minStock: number }>>`
      SELECT "id", "name", "stock", "minStock"
      FROM "Product"
      WHERE "hasVariants" = false AND "stock" <= "minStock"
      UNION ALL
      SELECT variant."id", product."name" || ' - ' || variant."sku", variant."stock", variant."minStock"
      FROM "ProductVariant" AS variant
      INNER JOIN "Product" AS product ON product."id" = variant."productId"
      WHERE product."hasVariants" = true
        AND variant."isActive" = true
        AND variant."stock" <= variant."minStock"
      ORDER BY "stock" ASC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{ totalCost: number; totalPrice: number }>>`
      SELECT
        (
          COALESCE((SELECT SUM(product."cost" * product."stock") FROM "Product" AS product WHERE product."hasVariants" = false), 0)
          + COALESCE((SELECT SUM(variant."cost" * variant."stock") FROM "ProductVariant" AS variant INNER JOIN "Product" AS product ON product."id" = variant."productId" WHERE product."hasVariants" = true AND variant."isActive" = true), 0)
        )::double precision AS "totalCost",
        (
          COALESCE((SELECT SUM(product."price" * product."stock") FROM "Product" AS product WHERE product."hasVariants" = false), 0)
          + COALESCE((SELECT SUM(variant."price" * variant."stock") FROM "ProductVariant" AS variant INNER JOIN "Product" AS product ON product."id" = variant."productId" WHERE product."hasVariants" = true AND variant."isActive" = true), 0)
        )::double precision AS "totalPrice"
    `,
    prisma.$queryRaw<Array<{ name: string; revenue: number; quantity: number }>>`
      SELECT
        COALESCE(category."name", 'Uncategorized') AS "name",
        COALESCE(SUM(item."subtotal"), 0)::double precision AS "revenue",
        COALESCE(SUM(item."quantity"), 0)::int AS "quantity"
      FROM "OrderItem" AS item
      INNER JOIN "Order" AS orders ON orders."id" = item."orderId"
      LEFT JOIN "Product" AS product ON product."id" = item."productId"
      LEFT JOIN "Category" AS category ON category."id" = product."categoryId"
      WHERE orders."status" = 'COMPLETED'
        AND orders."updatedAt" >= ${rangeStart}
        AND (${customEnd}::timestamptz IS NULL OR orders."updatedAt" < ${customEnd})
      GROUP BY category."name"
      ORDER BY "revenue" DESC, "name" ASC
    `,
  ]);

  const topProductIds = topProductGroups.map((item) => item.productId);
  const topProductRecords = topProductIds.length > 0
    ? await prisma.product.findMany({
        where: { id: { in: topProductIds } },
        select: { id: true, name: true, imageUrl: true, category: { select: { name: true } } },
      })
    : [];
  const topProductById = new Map(topProductRecords.map((product) => [product.id, product]));
  const topProducts = topProductGroups.map((item) => {
    const product = topProductById.get(item.productId);
    return {
      productId: item.productId,
      name: product?.name ?? "Unknown product",
      imageUrl: product?.imageUrl ?? null,
      categoryName: product?.category.name ?? "Uncategorized",
      quantity: Number(item._sum.quantity ?? 0),
      revenue: Number(item._sum.subtotal ?? 0),
      orders: item._count.id,
    };
  });

  const statusCounts = new Map(statusBreakdown.map((item) => [item.status, item._count.id]));
  const todayStatusCounts = new Map(todayStatusBreakdown.map((item) => [item.status, item._count.id]));
  const completedSales = completedSalesRows[0] ?? {
    completedCount: 0,
    revenue: 0,
    posOrders: 0,
    posRevenue: 0,
    ecommerceOrders: 0,
    ecommerceRevenue: 0,
  };
  const activeOrderCount = [...statusCounts.entries()]
    .filter(([status]) => status !== "CANCELLED" && status !== "COMPLETED")
    .reduce((sum, [, count]) => sum + count, 0);
  const inventoryValue = inventoryValueRows[0] ?? { totalCost: 0, totalPrice: 0 };

  return NextResponse.json(
    {
      products: productCount,
      orders: activeOrderCount,
      pendingOrders: statusCounts.get("PENDING") ?? 0,
      cancelledOrders: statusCounts.get("CANCELLED") ?? 0,
      completedOrders: completedSales.completedCount,
      lowStock: lowStockItems.map((item) => ({
        ...item,
        stock: Number(item.stock),
        minStock: Number(item.minStock),
      })),
      revenue: Number(completedSales.revenue),
      totalCost: Number(inventoryValue.totalCost),
      totalPrice: Number(inventoryValue.totalPrice),
      topProducts,
      salesByCategory: salesByCategoryRows.map((item) => ({
        ...item,
        revenue: Number(item.revenue),
        quantity: Number(item.quantity),
      })),
      channelComparison: [
        { name: "POS (Walk-in)", orders: completedSales.posOrders, revenue: Number(completedSales.posRevenue) },
        { name: "Ecommerce", orders: completedSales.ecommerceOrders, revenue: Number(completedSales.ecommerceRevenue) },
      ],
      todayStats: {
        pendingOrders: todayStatusCounts.get("PENDING") ?? 0,
        cancelledOrders: todayStatusCounts.get("CANCELLED") ?? 0,
        completedOrders: todayCompletedCount,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
