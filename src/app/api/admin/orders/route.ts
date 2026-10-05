import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import { applyOrderInventoryMovement, recordInventoryLifecycleEvent } from "@/features/inventory/lib/inventory";
import { canCancelOrder, isOrderStatus, normalizePickupDateInput, OrderStatus, resolveInitialOrderStatus } from "@/lib/order";
import { resolvePaymentProofUrl } from "@/lib/storage";
import { getRequestId, logError } from "@/lib/logger";
import { apiError, getUserFacingErrorMessage } from "@/lib/api-response";
import { emitOrderCreatedEvent, emitOrderUpdatedEvent } from "@/lib/realtime";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

class OrderStateConflictError extends Error {}

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

export async function GET(request: Request) {
  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:orders:get", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 15) || 15));
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status") ?? "ALL";
    const filterDate = searchParams.get("filterDate") ?? "ALL";
    const customPickupDate = searchParams.get("customPickupDate") ?? "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const pickupDate = filterDate === "TODAY"
      ? { gte: today, lt: tomorrow }
      : filterDate === "TOMORROW"
      ? { gte: tomorrow, lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000) }
      : filterDate === "NEXT_7_DAYS" || filterDate === "UPCOMING"
      ? { gte: today, lt: filterDate === "NEXT_7_DAYS" ? nextWeek : undefined }
      : filterDate === "CUSTOM" && customPickupDate
      ? { gte: new Date(`${customPickupDate}T00:00:00`), lt: new Date(`${customPickupDate}T23:59:59.999`) }
      : undefined;

    const requestedStatus = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"].includes(status)
      ? (status as OrderStatus)
      : undefined;
    const where: Prisma.OrderWhereInput = {
      ...(customerId ? { userId: customerId } : {}),
      ...(filterDate !== "NO_DATE" && pickupDate ? { pickupDate } : {}),
      ...(status === "ACTIVE"
        ? { status: { notIn: ["COMPLETED", "CANCELLED"] } }
        : status === "AWAITING_PAYMENT_APPROVAL"
        ? {
            status: { notIn: ["COMPLETED", "CONFIRMED", "CANCELLED"] },
            paymentMethod: { not: "CASH" },
            paymentStatus: { notIn: ["PAID", "FAILED"] },
          }
        : status !== "ALL"
        ? { status: requestedStatus }
        : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" as const } },
              { customerName: { contains: search, mode: "insensitive" as const } },
              { customerPhone: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const reviewedProductIds = customerId
      ? await prisma.productReview.findMany({
          where: { userId: customerId },
          select: { productId: true },
        })
      : [];
    const reviewedSet = new Set(reviewedProductIds.map((review) => review.productId));

    const [orders, totalCount, statusGroups, awaitingPaymentCount] = await Promise.all([
      prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
            variant: {
              select: {
                id: true,
                sku: true,
                attributes: true,
                price: true,
                cost: true,
              },
            },
          },
        },
        user: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where: customerId ? { userId: customerId } : undefined, _count: { id: true } }),
      prisma.order.count({
        where: {
          ...(customerId ? { userId: customerId } : {}),
          status: { notIn: ["COMPLETED", "CONFIRMED", "CANCELLED"] },
          paymentMethod: { not: "CASH" },
          paymentStatus: { notIn: ["PAID", "FAILED"] },
        },
      }),
    ]);

    return NextResponse.json({
      orders: await Promise.all(orders.map(async (order) => ({
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
        proofOfPaymentUrl: await resolvePaymentProofUrl(order.proofOfPaymentUrl),
        isWalkIn: order.isWalkIn,
        items: order.items.map((item) => ({
          ...item,
          price: Number(item.price),
          subtotal: Number(item.subtotal),
          isReviewed: Boolean(item.productId && reviewedSet.has(item.productId)),
          variant: item.variant
            ? {
                ...item.variant,
                price: Number(item.variant.price),
                cost: Number(item.variant.cost),
              }
            : null,
        })),
      }))),
      pagination: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
      statusCounts: {
        ALL: statusGroups.reduce((sum, group) => sum + group._count.id, 0),
        ACTIVE: statusGroups.filter((group) => !["COMPLETED", "CANCELLED"].includes(group.status)).reduce((sum, group) => sum + group._count.id, 0),
        AWAITING_PAYMENT_APPROVAL: awaitingPaymentCount,
        ...Object.fromEntries(statusGroups.map((group) => [group.status, group._count.id])),
      },
    });
  } catch (error) {
    logError("admin.orders.get_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 503, "ADMIN_ORDERS_UNAVAILABLE", "Unable to load orders right now.");
  }
}

type OrderItemInput = {
  productId?: string;
  variantId?: string;
  quantity?: number;
  price?: number;
  sku?: string;
  unitLabel?: string;
};

type OrderItemForMutation = OrderItemInput & {
  productId: string;
  quantity: number;
  price: number;
};

type OrderPayload = {
  items?: OrderItemInput[];
  orderNumber?: string;
  userId?: string;
  customerName?: string;
  customerPhone?: string;
  pickupDate?: string;
  pickupTime?: string;
  paymentMethod?: string;
  isWalkIn?: boolean;
  status?: string;
};

export async function POST(request: Request) {
  let requestBody: OrderPayload | null = null;

  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:orders:create", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    requestBody = (await request.json()) as OrderPayload;
    const body = requestBody;
    const items = (body.items ?? []).filter(
      (item): item is OrderItemForMutation => Boolean(item.productId)
    );

    if (!items.length) {
      return NextResponse.json(
        { success: false, message: "Order items are required." },
        { status: 400 }
      );
    }

    if (body.userId) {
      const customer = await prisma.user.findUnique({
        where: { id: body.userId },
        select: { role: true, emailVerified: true, phone: true, address: true, isBlocked: true },
      });

      if (customer?.role === "CUSTOMER") {
        const isProfileComplete = Boolean(customer.phone?.trim()) && Boolean(customer.address?.trim());

        if (!customer.emailVerified || !isProfileComplete) {
          return NextResponse.json(
            { success: false, message: "Please complete your phone number and address in your profile before placing an order." },
            { status: 403 }
          );
        }

        if (customer.isBlocked) {
          return NextResponse.json(
            { success: false, message: "Your account has been blocked. Please contact the admin." },
            { status: 403 }
          );
        }
      }
    }

    const orderNumber = body.orderNumber ?? `ORD-${Date.now()}`;
    const totalAmount = items.reduce(
      (sum: number, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0),
      0
    );
    const isWalkIn = body.isWalkIn === true;
    const initialStatus = resolveInitialOrderStatus(isWalkIn, body.status, true);
    const paymentMethod = (body.paymentMethod ?? "CASH").toUpperCase() as "CASH" | "GCASH" | "PAYMAYA";
    const effectiveStatus = isWalkIn ? "COMPLETED" : initialStatus;
    const effectivePaymentStatus = isWalkIn ? "PAID" : "PENDING";

    const productIds = [...new Set(items.map((item) => item.productId))];
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true, isActive: true, hasVariants: true },
    });
    const existingProductIds = new Set(existingProducts.map((product) => product.id));

    for (const item of items) {
      if (!existingProductIds.has(item.productId)) {
        return NextResponse.json({ success: false, message: `Product ${item.productId} no longer exists.` }, { status: 400 });
      }

      const product = existingProducts.find((entry) => entry.id === item.productId);
      if (product && !product.isActive) {
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
          userId: body.userId ?? null,
          customerName: body.customerName ?? "Walk-in Customer",
          customerPhone: body.customerPhone ?? "",
          pickupDate:
            typeof body.pickupDate === "string" && body.pickupDate.trim()
              ? normalizePickupDateInput(body.pickupDate)
              : null,
          pickupTime: typeof body.pickupTime === "string" ? body.pickupTime.trim() || null : null,
          totalAmount,
          paymentMethod,
          paymentStatus: effectivePaymentStatus,
          status: effectiveStatus,
          isWalkIn,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: Number(item.quantity ?? 1),
              price: Number(item.price ?? 0),
              subtotal: Number(item.price ?? 0) * Number(item.quantity ?? 1),
            })),
          },
        },
        include: { items: true },
      });

      if (isWalkIn) {
        await applyOrderInventoryMovement(
          tx,
          createdOrder.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || undefined,
            quantity: item.quantity,
          })),
          "STOCK_OUT",
          `Walk-in sale ${createdOrder.orderNumber} completed`,
          authCheck.user?.name,
          {
            performedByType: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
            source: "POS",
            customerName: createdOrder.customerName,
            orderNumber: createdOrder.orderNumber,
            paymentMethod: paymentMethod,
            paymentStatus: effectivePaymentStatus,
            paymentReference: createdOrder.paymentReference ?? null,
            eventType: "POS_SALE",
          },
        );
      }

      return createdOrder;
    });

    emitOrderCreatedEvent({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      customerName: order.customerName,
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error: unknown) {
    logError("admin.orders.post_failed", error, {
      requestId: getRequestId(request),
      itemCount: Array.isArray(requestBody?.items) ? requestBody.items.length : 0,
      isWalkIn: requestBody?.isWalkIn,
      paymentMethod: requestBody?.paymentMethod,
      userId: requestBody?.userId ?? null,
    });

    const message = getUserFacingErrorMessage(error, "Unable to create order.");

    const status = String(error).includes("Not enough stock") || String(error).includes("not enough stock") ? 409 : 500;

    return NextResponse.json(
      { success: false, message },
      { status }
    );
  }
}

export async function PUT(request: Request) {
  let requestBody: { id?: string; status?: string } | null = null;

  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:orders:update", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    requestBody = await request.json();
    const body = requestBody;
    const { id, status } = body as { id?: string; status?: string };

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Order id is required." },
        { status: 400 }
      );
    }

    if (!status || !isOrderStatus(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid order status." },
        { status: 400 }
      );
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    if (existingOrder.status === "CANCELLED" || existingOrder.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, message: "Completed or cancelled orders cannot be edited." },
        { status: 400 }
      );
    }

    if (status === "COMPLETED" && !existingOrder.isWalkIn && existingOrder.status !== "READY_FOR_PICKUP") {
      return NextResponse.json(
        { success: false, message: "An ecommerce order can only be completed after it is ready for pickup." },
        { status: 400 }
      );
    }

    const isOnlinePayment = existingOrder.paymentMethod === "GCASH" || existingOrder.paymentMethod === "PAYMAYA";
    const approvalStatuses = ["PREPARING", "READY_FOR_PICKUP", "COMPLETED"];
    if (isOnlinePayment && existingOrder.paymentStatus !== "PAID" && approvalStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: "Approve the payment first before moving this order forward." },
        { status: 400 }
      );
    }
    if (isOnlinePayment && existingOrder.paymentStatus !== "PAID" && status !== "PENDING_PAYMENT" && status !== "CANCELLED") {
      return NextResponse.json(
        { success: false, message: "Approve or reject the online payment before changing the order status." },
        { status: 400 }
      );
    }
    if (!canCancelOrder(existingOrder.status) && status === "CANCELLED") {
      return NextResponse.json(
        { success: false, message: "Only pending orders can be canceled." },
        { status: 400 }
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      const movementSource = existingOrder.isWalkIn ? "POS" : "ECOMMERCE";
      const nextPaymentStatus =
        status === "CANCELLED" && existingOrder.paymentMethod !== "CASH" && existingOrder.paymentStatus === "PENDING"
          ? "CANCELLED"
          : status === "COMPLETED" && existingOrder.paymentMethod === "CASH"
          ? "PAID"
          : existingOrder.paymentStatus;
      if (status === "CANCELLED") {
        const claim = await tx.order.updateMany({
          where: { id, status: existingOrder.status, paymentStatus: existingOrder.paymentStatus },
          data: { status: "CANCELLED", paymentStatus: nextPaymentStatus },
        });
        if (claim.count !== 1) throw new OrderStateConflictError("Order status changed before cancellation completed.");
      }
      const existingStockOuts = await tx.inventoryTransaction.findMany({
        where: {
          orderNumber: existingOrder.orderNumber,
          source: movementSource,
          type: "STOCK_OUT",
        },
        select: { productId: true, variantId: true, quantity: true },
      });
      const hasStockRestoration = await tx.inventoryTransaction.count({
        where: {
          orderNumber: existingOrder.orderNumber,
          source: movementSource,
          type: "RETURN",
          remarks: { contains: "cancelled - stock returned" },
        },
      });
      const shouldDeductStock = status === "COMPLETED" && existingStockOuts.length === 0;
      const shouldRestoreStock = status === "CANCELLED" && existingStockOuts.length > 0 && hasStockRestoration === 0;

      if (shouldDeductStock) {
        await applyOrderInventoryMovement(
          tx,
          existingOrder.items.map((item) => ({ productId: item.productId, variantId: item.variantId || undefined, quantity: item.quantity })),
          "STOCK_OUT",
          `Order ${existingOrder.orderNumber} completed`,
          authCheck.user?.name,
          {
            performedByType: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
            source: "ECOMMERCE",
            customerName: existingOrder.customerName,
            orderNumber: existingOrder.orderNumber,
            paymentMethod: existingOrder.paymentMethod,
            paymentStatus: nextPaymentStatus,
            paymentReference: existingOrder.paymentReference ?? existingOrder.proofOfPaymentUrl ?? null,
          },
        );
      }

      if (status === "COMPLETED" && movementSource === "ECOMMERCE" && existingStockOuts.length > 0) {
        await recordInventoryLifecycleEvent(
          tx,
          existingStockOuts.filter((movement) => movement.productId).map((movement) => ({
            productId: movement.productId as string,
            variantId: movement.variantId || undefined,
            quantity: movement.quantity,
          })),
          "RESERVATION_FULFILLED",
          `Order ${existingOrder.orderNumber} completed - reservation completed; no additional stock deduction`,
          authCheck.user?.name,
          {
            performedByType: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
            source: "ECOMMERCE",
            customerName: existingOrder.customerName,
            orderNumber: existingOrder.orderNumber,
            paymentMethod: existingOrder.paymentMethod,
            paymentStatus: nextPaymentStatus,
            paymentReference: existingOrder.paymentReference ?? existingOrder.proofOfPaymentUrl ?? null,
          },
        );
      }

      if (shouldRestoreStock) {
        await applyOrderInventoryMovement(
          tx,
          existingStockOuts.filter((movement) => movement.productId).map((movement) => ({
            productId: movement.productId as string,
            variantId: movement.variantId || undefined,
            quantity: movement.quantity,
          })),
            "RETURN",
          `Order ${existingOrder.orderNumber} cancelled - stock returned`,
          authCheck.user?.name,
          {
            performedByType: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
            source: movementSource,
            customerName: existingOrder.customerName,
            orderNumber: existingOrder.orderNumber,
            paymentMethod: existingOrder.paymentMethod,
            paymentStatus: existingOrder.paymentStatus,
            paymentReference: existingOrder.paymentReference ?? existingOrder.proofOfPaymentUrl ?? null,
            eventType: "RESERVATION_RELEASED",
          },
        );
      }

      if (status === "CANCELLED") return tx.order.findUniqueOrThrow({ where: { id } });

      return tx.order.update({ where: { id }, data: { status: status as OrderStatus, paymentStatus: nextPaymentStatus } });
    });

    emitOrderUpdatedEvent({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: status as string,
      userId: existingOrder.userId,
    });

    return NextResponse.json({ success: true, order }, { status: 200 });
  } catch (error) {
    logError("admin.orders.put_failed", error, {
      requestId: getRequestId(request),
      orderId: requestBody?.id ?? null,
      status: requestBody?.status ?? null,
    });

    if (error instanceof OrderStateConflictError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { success: false, message: getUserFacingErrorMessage(error, "Unable to update order status.") },
      { status: 500 }
    );
  }
}
