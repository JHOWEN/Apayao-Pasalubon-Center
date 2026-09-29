import { PaymentStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { applyOrderInventoryMovement } from "@/features/inventory/lib/inventory";
import { expireWalletReservations } from "@/features/inventory/lib/reservation-expiry";
import { resolvePaymentProofUrl } from "@/lib/storage";
import { getRequestId, logError } from "@/lib/logger";
import { apiError } from "@/lib/api-response";
import { emitOrderCreatedEvent } from "@/lib/realtime";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  canCancelOrder,
  isOrderStatus,
  normalizePickupDateInput,
  OrderStatus,
  resolveInitialOrderStatus,
  resolveInitialPaymentStatus,
  ONLINE_PAYMENT_RESERVATION_TTL_MS,
  validateOrderPayload,
} from "@/lib/order";

class OrderStateConflictError extends Error {}

async function requireAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }

  const payload = verifyToken(token) as { sub?: string; role?: string } | null;

  if (!payload?.sub) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, role: true, emailVerified: true, phone: true, address: true, isBlocked: true },
  });

  if (!user) {
    return { error: NextResponse.json({ success: false, message: "User not found." }, { status: 404 }) };
  }

  return { payload, user };
}

function serializeOrder(order: {
  id: string;
  userId: string | null;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  pickupDate: Date | null;
  pickupTime: string | null;
  createdAt: Date;
  status: string;
  totalAmount: unknown;
  paymentMethod: string;
  paymentStatus: string;
  proofOfPaymentUrl: string | null;
  isWalkIn: boolean;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    price: unknown;
    subtotal: unknown;
    product: { imageUrl: string | null; name: string } | null;
    variant?: { sku?: string; color?: string | null; measurementValue?: number | null; measurementUnit?: string | null } | null;
  }>;
  user?: { email?: string | null; address?: string | null } | null;
}, reviewedSet: Set<string>) {
  return {
    id: order.id,
    userId: order.userId,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.user?.email,
    customerAddress: order.user?.address,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    createdAt: order.createdAt,
    status: order.status,
    totalAmount: Number(order.totalAmount),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    proofOfPaymentUrl: order.proofOfPaymentUrl,
    reservationExpiresAt:
      order.paymentMethod !== "CASH" && !order.proofOfPaymentUrl && order.status === "PENDING_PAYMENT"
        ? new Date(order.createdAt.getTime() + ONLINE_PAYMENT_RESERVATION_TTL_MS).toISOString()
        : null,
    isWalkIn: order.isWalkIn,
    items: order.items.map((item) => ({
      ...item,
      price: Number(item.price ?? 0),
      subtotal: Number(item.subtotal),
      isReviewed: Boolean(item.productId && reviewedSet.has(item.productId)),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const authCheck = await requireAuthenticatedUser();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceRateLimit(request, "user:orders:get", {
      group: "user",
      accountId: authCheck.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    await expireWalletReservations(new Date(), 10);
    const { payload } = authCheck;
    const reviewedProductIds = await prisma.productReview.findMany({
      where: { userId: payload.sub },
      select: { productId: true },
    });
    const reviewedSet = new Set(reviewedProductIds.map((review) => review.productId));

    const orders = await prisma.order.findMany({
      where: { userId: payload.sub },
      include: {
        items: { include: { product: true, variant: true } },
        user: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const serializedOrders = await Promise.all(
      orders.map(async (order) => ({
        ...serializeOrder(order as unknown as Parameters<typeof serializeOrder>[0], reviewedSet),
        proofOfPaymentUrl: await resolvePaymentProofUrl(order.proofOfPaymentUrl),
      }))
    );

    return NextResponse.json(serializedOrders);
  } catch (error) {
    logError("auth.orders.get_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 503, "ORDERS_UNAVAILABLE", "Unable to load orders right now.");
  }
}

export async function POST(request: Request) {
  let requestIdempotencyKey = "";

  try {
    const authCheck = await requireAuthenticatedUser();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceRateLimit(request, "user:orders:create", {
      group: "user",
      accountId: authCheck.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { payload, user } = authCheck;
    await expireWalletReservations(new Date(), 10);
    const parsedBody = await request.json();
    const validation = validateOrderPayload(parsedBody, { allowCancelled: false, allowWalkIn: false });

    if (!validation.success) {
      return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
    }

    const body = validation.payload;
    const items = body.items;

    if (body.userId && body.userId !== payload.sub) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    if (user.role === "CUSTOMER") {
      const isProfileComplete = Boolean(user.phone?.trim()) && Boolean(user.address?.trim());

      if (!user.emailVerified || !isProfileComplete) {
        return NextResponse.json(
          { success: false, message: "Please complete your phone number and address in your profile before placing an order." },
          { status: 403 }
        );
      }

      if (user.isBlocked) {
        return NextResponse.json(
          { success: false, message: "Your account has been blocked. Please contact the admin." },
          { status: 403 }
        );
      }
    }

    const orderNumber = body.orderNumber ?? `ORD-${Date.now()}`;
    requestIdempotencyKey = body.idempotencyKey?.trim() ?? "";

    if (requestIdempotencyKey) {
      const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey: requestIdempotencyKey },
        include: { items: true },
      });

      if (existingOrder) {
        if (existingOrder.userId !== payload.sub) {
          return NextResponse.json({ success: false, message: "This order request is not available." }, { status: 409 });
        }

        if (existingOrder.status === "CANCELLED") {
          return NextResponse.json(
            { success: false, message: "This reservation has expired or was cancelled. Review your cart and place a new order." },
            { status: 410 },
          );
        }

        return NextResponse.json({ success: true, order: existingOrder, idempotent: true }, { status: 200 });
      }
    }
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const isWalkIn = body.isWalkIn ?? false;
    const initialStatus = resolveInitialOrderStatus(isWalkIn, body.status, false);
    const paymentMethod = (body.paymentMethod ?? "CASH") as "CASH" | "GCASH" | "PAYMAYA";
    const proofOfPaymentUrl = body.proofOfPaymentUrl?.trim() || null;
    const paymentStatus: PaymentStatus = resolveInitialPaymentStatus(paymentMethod);

    const effectiveInitialStatus = paymentMethod === "CASH" ? initialStatus : "PENDING_PAYMENT";

    const productIds = [...new Set(items.map((item) => item.productId))];
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true, isActive: true, status: true },
    });
    const existingProductIds = new Set(existingProducts.map((product) => product.id));

    for (const item of items) {
      if (!existingProductIds.has(item.productId)) {
        return NextResponse.json({ success: false, message: `Product ${item.productId} no longer exists.` }, { status: 400 });
      }

      const product = existingProducts.find((entry) => entry.id === item.productId);
      if (product && (!product.isActive || product.status !== "PUBLISHED")) {
        return NextResponse.json({ success: false, message: `Product ${item.productId} is no longer available.` }, { status: 400 });
      }
    }

    const variantIds = [...new Set(items.filter((item) => item.variantId).map((item) => item.variantId!))];
    const existingVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true, stock: true },
    });
    const existingVariantMap = new Map(existingVariants.map((variant) => [variant.id, variant]));

    for (const item of items) {
      if (!item.variantId) continue;

      const variant = existingVariantMap.get(item.variantId);
      if (!variant) {
        return NextResponse.json({ success: false, message: `Variant ${item.variantId} no longer exists.` }, { status: 400 });
      }

      if (variant.productId !== item.productId) {
        return NextResponse.json({ success: false, message: `Variant ${item.variantId} does not belong to the selected product.` }, { status: 400 });
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          idempotencyKey: requestIdempotencyKey || null,
          userId: payload.sub,
          customerName: body.customerName ?? "Customer",
          customerPhone: body.customerPhone ?? "",
          pickupDate:
            typeof body.pickupDate === "string" && body.pickupDate.trim()
              ? normalizePickupDateInput(body.pickupDate)
              : null,
          pickupTime: body.pickupTime ?? null,
          totalAmount,
          paymentMethod,
          paymentStatus,
          proofOfPaymentUrl,
          status: effectiveInitialStatus,
          isWalkIn,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.price * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      await applyOrderInventoryMovement(
        tx,
        items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
        })),
        "STOCK_OUT",
        `Order ${createdOrder.orderNumber} placed - stock reserved`,
        user.name,
        {
          performedByType: "CUSTOMER",
          source: "ECOMMERCE",
          customerName: createdOrder.customerName,
          orderNumber: createdOrder.orderNumber,
          paymentMethod: paymentMethod,
          paymentStatus: paymentStatus,
          paymentReference: proofOfPaymentUrl,
          eventType: "RESERVATION_CREATED",
        },
      );

      return createdOrder;
    });

    emitOrderCreatedEvent({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      userId: payload.sub,
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error: unknown) {
    if (requestIdempotencyKey && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey: requestIdempotencyKey },
        include: { items: true },
      });

      if (existingOrder) {
        return NextResponse.json({ success: true, order: existingOrder, idempotent: true }, { status: 200 });
      }
    }

    const message = error instanceof Error ? error.message : "Unable to create order.";
    const status = message.includes("Not enough stock") ? 409 : 500;

    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const authCheck = await requireAuthenticatedUser();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceRateLimit(request, "user:orders:update", {
      group: "user",
      accountId: authCheck.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { payload, user } = authCheck;
    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };

    if (!id) {
      return NextResponse.json({ success: false, message: "Order id is required." }, { status: 400 });
    }

    if (!status || !isOrderStatus(status)) {
      return NextResponse.json({ success: false, message: "Invalid order status." }, { status: 400 });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existingOrder) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }

    if (existingOrder.userId !== payload.sub) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    if (existingOrder.status === "CANCELLED") {
      return NextResponse.json({ success: false, message: "Cancelled orders cannot be edited." }, { status: 400 });
    }

    if (status === "COMPLETED" && existingOrder.status !== "READY_FOR_PICKUP") {
      return NextResponse.json({ success: false, message: "An order can only be marked received after it is ready for pickup." }, { status: 400 });
    }

    if (!canCancelOrder(existingOrder.status) && status === "CANCELLED") {
      return NextResponse.json({ success: false, message: "Only pending orders can be canceled." }, { status: 400 });
    }

    const shouldRestoreStock = status === "CANCELLED";
    const nextPaymentStatus =
      status === "CANCELLED" && existingOrder.paymentMethod !== "CASH" && existingOrder.paymentStatus === "PENDING"
        ? PaymentStatus.CANCELLED
        : existingOrder.paymentMethod === "CASH" && status === "COMPLETED"
        ? "PAID"
        : existingOrder.paymentStatus;

    const order = await prisma.$transaction(async (tx) => {
      if (shouldRestoreStock) {
        const claim = await tx.order.updateMany({
          where: { id, userId: payload.sub, status: existingOrder.status, paymentStatus: existingOrder.paymentStatus },
          data: { status: "CANCELLED", paymentStatus: nextPaymentStatus },
        });
        if (claim.count !== 1) throw new OrderStateConflictError("Order status changed before cancellation completed.");
      }

      if (shouldRestoreStock) {
        const placementMovements = await tx.inventoryTransaction.findMany({
          where: {
            orderNumber: existingOrder.orderNumber,
            source: "ECOMMERCE",
            type: "STOCK_OUT",
          },
          select: { productId: true, variantId: true, quantity: true },
        });
        const alreadyRestored = await tx.inventoryTransaction.count({
          where: {
            orderNumber: existingOrder.orderNumber,
            source: "ECOMMERCE",
            type: "RETURN",
            remarks: { contains: "cancelled - stock returned" },
          },
        });

        if (placementMovements.length > 0 && alreadyRestored === 0) {
          await applyOrderInventoryMovement(
            tx,
            placementMovements.filter((movement) => movement.productId).map((movement) => ({
              productId: movement.productId as string,
              variantId: movement.variantId ?? undefined,
              quantity: movement.quantity,
            })),
            "RETURN",
            `Order ${existingOrder.orderNumber} cancelled - stock returned`,
            user.name,
            {
              performedByType: "CUSTOMER",
              source: "ECOMMERCE",
              customerName: existingOrder.customerName,
              orderNumber: existingOrder.orderNumber,
              paymentMethod: existingOrder.paymentMethod,
              paymentStatus: existingOrder.paymentStatus,
              paymentReference: existingOrder.paymentReference ?? existingOrder.proofOfPaymentUrl ?? null,
              eventType: "RESERVATION_RELEASED",
            },
          );
        }
      }

      if (shouldRestoreStock) return tx.order.findUniqueOrThrow({ where: { id } });

      return tx.order.update({ where: { id }, data: { status: status as OrderStatus, paymentStatus: nextPaymentStatus } });
    });

    return NextResponse.json({ success: true, order }, { status: 200 });
  } catch (error) {
    if (error instanceof OrderStateConflictError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: "Unable to update order status." }, { status: 500 });
  }
}
