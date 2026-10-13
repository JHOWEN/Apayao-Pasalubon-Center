import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logger";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { customerUpdateSchema } from "@/features/admin/validators/admin";
import { parseJsonRequestBody } from "@/lib/api-validation";

async function requireAdminAccess() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }

  const payload = await getUserForToken(token);

  if (!payload?.sub || !canAccessAdminPortal(payload.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 }) };
  }

  return { payload };
}

export async function GET(request: Request) {
  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:customers:get", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 15));
    const search = searchParams.get("search")?.trim().slice(0, 120) ?? "";
    const filter = searchParams.get("filter");
    const where: Prisma.UserWhereInput = {
      role: "CUSTOMER",
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { address: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filter === "verified"
        ? { emailVerified: true, isBlocked: false }
        : filter === "blocked"
          ? { isBlocked: true }
          : filter === "withOrders"
            ? { orders: { some: { status: { not: "CANCELLED" } } } }
            : {}),
    };

    const [customers, totalCount, summaryRows] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          imageUrl: true,
          emailVerified: true,
          isBlocked: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
      prisma.$queryRaw<Array<{ total: number; verified: number; blocked: number; withOrders: number }>>`
        SELECT
          (SELECT COUNT(*)::int FROM "User" WHERE "role" = 'CUSTOMER') AS "total",
          (SELECT COUNT(*)::int FROM "User" WHERE "role" = 'CUSTOMER' AND "emailVerified" = true AND "isBlocked" = false) AS "verified",
          (SELECT COUNT(*)::int FROM "User" WHERE "role" = 'CUSTOMER' AND "isBlocked" = true) AS "blocked",
          (
            SELECT COUNT(DISTINCT orders."userId")::int
            FROM "Order" AS orders
            INNER JOIN "User" AS customers ON customers."id" = orders."userId"
            WHERE customers."role" = 'CUSTOMER' AND orders."status" <> 'CANCELLED'
          ) AS "withOrders"
      `,
    ]);

    const customerIds = customers.map((customer) => customer.id);
    const orderStats = customerIds.length > 0
      ? await prisma.order.groupBy({
          by: ["userId"],
          where: { userId: { in: customerIds }, status: { not: "CANCELLED" } },
          _count: { id: true },
          _sum: { totalAmount: true },
          _max: { createdAt: true },
        })
      : [];
    const latestOrderWhere = orderStats.flatMap((stats) =>
      stats.userId && stats._max.createdAt
        ? [{ userId: stats.userId, createdAt: stats._max.createdAt }]
        : [],
    );
    const latestOrders = latestOrderWhere.length > 0
      ? await prisma.order.findMany({
          where: { OR: latestOrderWhere },
          select: { userId: true, status: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : [];

    type CustomerOrderStats = {
      orders: number;
      completedOrders: number;
      totalSpent: number;
      lastOrderDate: Date | null;
      lastOrderStatus: string | null;
    };
    const statsByCustomer = new Map<string, CustomerOrderStats>();
    orderStats.forEach((stats) => {
      if (stats.userId) {
        statsByCustomer.set(stats.userId, {
          orders: stats._count.id,
          completedOrders: 0,
          totalSpent: Number(stats._sum.totalAmount ?? 0),
          lastOrderDate: stats._max.createdAt,
          lastOrderStatus: null,
        });
      }
    });
    latestOrders.forEach((order) => {
      if (!order.userId) return;
      const stats = statsByCustomer.get(order.userId);
      if (stats && !stats.lastOrderStatus) stats.lastOrderStatus = order.status;
    });

    if (customerIds.length > 0) {
      const completedOrderCounts = await prisma.order.groupBy({
        by: ["userId"],
        where: { userId: { in: customerIds }, status: "COMPLETED" },
        _count: { id: true },
      });
      completedOrderCounts.forEach((stats) => {
        if (stats.userId) {
          const current = statsByCustomer.get(stats.userId);
          if (current) current.completedOrders = stats._count.id;
        }
      });
    }

    const enrichedCustomers = customers.map((customer) => {
      const stats = statsByCustomer.get(customer.id) ?? {
        orders: 0,
        completedOrders: 0,
        totalSpent: 0,
        lastOrderDate: null,
        lastOrderStatus: null,
      };

      return {
        ...customer,
        orders: stats.orders,
        completedOrders: stats.completedOrders,
        totalSpent: Number(stats.totalSpent.toFixed(2)),
        lastOrderDate: stats.lastOrderDate,
        lastOrderStatus: stats.lastOrderStatus,
        hasOrders: stats.orders > 0,
      };
    });
    const summary = summaryRows[0] ?? { total: 0, verified: 0, blocked: 0, withOrders: 0 };

    return NextResponse.json({
      customers: enrichedCustomers,
      pagination: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
      summary: {
        total: Number(summary.total),
        verified: Number(summary.verified),
        blocked: Number(summary.blocked),
        withOrders: Number(summary.withOrders),
      },
    });
  } catch (error) {
    logError("admin.customers.get_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to load customers.") }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:customers:update", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const parsed = await parseJsonRequestBody(request, customerUpdateSchema, "Customer details are invalid.");
    if (!parsed.success) return parsed.response;
    const { id, name, email, phone, address, emailVerified, isBlocked } = parsed.data;

    const updateData = {
      ...(typeof name === "string" ? { name: name.trim() } : {}),
      ...(typeof email === "string" ? { email: email.trim() } : {}),
      ...(typeof phone === "string" ? { phone: phone.trim() || null } : {}),
      ...(typeof address === "string" ? { address: address.trim() || null } : {}),
      ...(typeof emailVerified === "boolean" ? { emailVerified } : {}),
      ...(typeof isBlocked === "boolean" ? { isBlocked } : {}),
    };

    const updatedCustomer = await prisma.$transaction(async (transaction) => {
      const currentCustomer = await transaction.user.findUnique({
        where: { id },
        select: { isBlocked: true },
      });
      const blockedStatusChanged =
        currentCustomer !== null &&
        typeof isBlocked === "boolean" &&
        currentCustomer.isBlocked !== isBlocked;
      const updated = await transaction.user.update({
        where: { id },
        data: {
          ...updateData,
          ...(blockedStatusChanged ? { sessionVersion: { increment: 1 } } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          imageUrl: true,
          emailVerified: true,
          isBlocked: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (blockedStatusChanged) {
        await transaction.authSession.deleteMany({ where: { userId: id } });
      }
      return updated;
    });

    return NextResponse.json({ success: true, customer: updatedCustomer });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update customer.") }, { status: 500 });
  }
}
