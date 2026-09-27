import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessAdminPortal, verifyToken } from "@/lib/auth";
import { getRequestId, logError } from "@/lib/logger";

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

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { name: true } });
  return { payload, user };
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) return authCheck.error;

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

    const canApproveForOnline = order.paymentStatus === "PAID" || order.paymentStatus === "PENDING";

    if (!canApproveForOnline) {
      return NextResponse.json({ success: false, message: "This order is not ready for approval yet." }, { status: 400 });
    }

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return NextResponse.json({ success: false, message: "This order is already approved." }, { status: 400 });
    }

    const updated = await prisma.order.updateMany({
      where: {
        id: order.id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        paymentStatus: { in: ["PENDING", "PAID"] },
      },
      data: { status: order.status === "PENDING_PAYMENT" ? "CONFIRMED" : order.status, paymentStatus: "PAID" },
    });

    if (updated.count === 0) {
      return NextResponse.json({ success: true, message: "Payment was already processed." }, { status: 200 });
    }

    return NextResponse.json({ success: true, message: "Payment approved." }, { status: 200 });
  } catch (error) {
    logError("admin.payment.approve_failed", error, { requestId: getRequestId(request) });
    return NextResponse.json({ success: false, message: "Unable to approve payment." }, { status: 500 });
  }
}
