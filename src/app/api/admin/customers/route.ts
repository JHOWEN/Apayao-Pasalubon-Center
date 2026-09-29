import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logger";
import { canAccessAdminPortal, verifyToken } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/api-response";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

async function requireAdminAccess() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }

  const payload = verifyToken(token) as { sub?: string; role?: string } | null;

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

    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
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

    const customerIds = customers.map((customer) => customer.id);

    const orders = customerIds.length > 0
      ? await prisma.order.findMany({
          where: { userId: { in: customerIds }, status: { not: "CANCELLED" } },
          select: {
            userId: true,
            createdAt: true,
            status: true,
            totalAmount: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const orderStats = new Map<string, { orders: number; completedOrders: number; totalSpent: number; lastOrderDate: Date | null; lastOrderStatus: string | null }>();

    orders.forEach((order) => {
      const current = orderStats.get(order.userId ?? "") || {
        orders: 0,
        completedOrders: 0,
        totalSpent: 0,
        lastOrderDate: null,
        lastOrderStatus: null,
      };

      current.orders += 1;
      current.totalSpent += Number(order.totalAmount ?? 0);
      if (order.status === "COMPLETED") {
        current.completedOrders += 1;
      }
      if (!current.lastOrderDate || (order.createdAt && order.createdAt > current.lastOrderDate)) {
        current.lastOrderDate = order.createdAt;
        current.lastOrderStatus = order.status;
      }

      orderStats.set(order.userId ?? "", current);
    });

    const enrichedCustomers = customers.map((customer) => {
      const stats = orderStats.get(customer.id) || {
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

    return NextResponse.json(enrichedCustomers);
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

    const body = await request.json();
    const { id, name, email, phone, address, emailVerified, isBlocked } = body as {
      id?: string;
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      emailVerified?: boolean;
      isBlocked?: boolean;
    };

    if (!id) {
      return NextResponse.json({ success: false, message: "Customer id is required." }, { status: 400 });
    }

    const updateData = {
      ...(typeof name === "string" ? { name: name.trim() } : {}),
      ...(typeof email === "string" ? { email: email.trim() } : {}),
      ...(typeof phone === "string" ? { phone: phone.trim() || null } : {}),
      ...(typeof address === "string" ? { address: address.trim() || null } : {}),
      ...(typeof emailVerified === "boolean" ? { emailVerified } : {}),
      ...(typeof isBlocked === "boolean" ? { isBlocked } : {}),
    };

    const updatedCustomer = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, customer: updatedCustomer });
  } catch (error) {
    return NextResponse.json({ success: false, message: getUserFacingErrorMessage(error, "Unable to update customer.") }, { status: 500 });
  }
}
