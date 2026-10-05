import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import { applyOrderInventoryMovement } from "@/features/inventory/lib/inventory";
import { getRequestId, logError } from "@/lib/logger";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

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

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) return authCheck.error;
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:payments:decline", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

    if (!orderId) {
      return NextResponse.json({ success: false, message: "Order id is required." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }

    if (order.paymentMethod === "CASH") {
      return NextResponse.json({ success: false, message: "Cash orders do not require payment approval." }, { status: 400 });
    }

    const canDecline = order.paymentStatus === "PAID" || order.paymentStatus === "PENDING";

    if (!canDecline) {
      return NextResponse.json({ success: false, message: "This order cannot be declined at this stage." }, { status: 400 });
    }

    if (order.status === "CANCELLED") {
      return NextResponse.json({ success: false, message: "This order is already cancelled." }, { status: 400 });
    }

    const actor = await prisma.user.findUnique({ where: { id: authCheck.payload.sub }, select: { name: true, role: true } });

    const wasDeclined = await prisma.$transaction(async (tx) => {
      const source = order.isWalkIn ? "POS" : "ECOMMERCE";
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { not: "CANCELLED" },
          paymentStatus: { in: ["PENDING", "PAID"] },
        },
        data: { status: "CANCELLED", paymentStatus: "FAILED" },
      });

      if (updated.count === 0) {
        return false;
      }

      const stockOuts = await tx.inventoryTransaction.findMany({
        where: { orderNumber: order.orderNumber, source, type: "STOCK_OUT" },
        select: { productId: true, variantId: true, quantity: true },
      });
      const restoredCount = await tx.inventoryTransaction.count({
        where: { orderNumber: order.orderNumber, source, type: "RETURN", remarks: { contains: "cancelled - stock returned" } },
      });

      if (stockOuts.length > 0 && restoredCount === 0) {
        await applyOrderInventoryMovement(
          tx,
          stockOuts.filter((movement) => movement.productId).map((movement) => ({
            productId: movement.productId as string,
            variantId: movement.variantId || undefined,
            quantity: movement.quantity,
          })),
          "RETURN",
          `Order ${order.orderNumber} cancelled - stock returned`,
          actor?.name,
          {
            performedByType: actor?.role === "STAFF" ? "STAFF" : "ADMIN",
            source,
            customerName: order.customerName,
            orderNumber: order.orderNumber,
          },
        );
      }

      return true;
    });

    if (!wasDeclined) {
      return NextResponse.json({ success: true, message: "Payment was already processed." }, { status: 200 });
    }

    return NextResponse.json({ success: true, message: "Payment declined." }, { status: 200 });
  } catch (error) {
    logError("admin.payment.decline_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to decline payment." }, { status: 500 });
  }
}
