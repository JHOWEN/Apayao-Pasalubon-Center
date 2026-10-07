import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import { getRequestId, logError } from "@/lib/logger";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { recordOrderEvent } from "@/lib/order-history";
import { emitOrderUpdatedEvent } from "@/lib/realtime";

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

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { name: true, role: true } });
  return { payload, user };
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) return authCheck.error;
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:payments:approve", "admin");
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

    if (order.paymentStatus === "PAID") {
      return NextResponse.json({ success: true, message: "Payment was already approved." }, { status: 200 });
    }

    if (order.paymentStatus !== "PROOF_SUBMITTED") {
      return NextResponse.json({ success: false, message: "This order is not ready for approval yet." }, { status: 400 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json({ success: false, message: "Only pending orders can have payment approved." }, { status: 400 });
    }

    const nextStatus = "CONFIRMED";
    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          stateVersion: order.stateVersion,
        },
        data: {
          status: nextStatus,
          paymentStatus: "PAID",
          paidAt: order.paidAt ?? new Date(),
          reservationExpiresAt: null,
          stateVersion: { increment: 1 },
        },
      });

      if (claim.count !== 1) return false;

      await recordOrderEvent(tx, {
        orderId: order.id,
        eventType: "PAYMENT_APPROVED",
        previousStatus: order.status,
        newStatus: nextStatus,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: "PAID",
        actor: {
          userId: authCheck.payload.sub,
          name: authCheck.user?.name,
          type: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
        },
      });
      return true;
    });

    if (!updated) {
      return NextResponse.json({ success: true, message: "Payment was already processed." }, { status: 200 });
    }

    emitOrderUpdatedEvent({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: nextStatus,
      userId: order.userId,
    });

    return NextResponse.json({ success: true, message: "Payment approved." }, { status: 200 });
  } catch (error) {
    logError("admin.payment.approve_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to approve payment." }, { status: 500 });
  }
}
