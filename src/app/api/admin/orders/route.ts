import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessAdminPortal, getUserForToken } from "@/lib/auth";
import {
  applyOrderInventoryMovement,
  InventoryConflictError,
  InventoryItemUnavailableError,
  InsufficientStockError,
  recordInventoryLifecycleEvent,
} from "@/features/inventory/lib/inventory";
import { canTransitionOrderStatus, isOrderStatus, normalizePickupDateInput, OrderStatus, resolveInitialOrderStatus } from "@/lib/order";
import { resolvePaymentProofUrl } from "@/lib/storage";
import { getRequestId, logError } from "@/lib/logger";
import { apiError, getUserFacingErrorMessage } from "@/lib/api-response";
import { emitOrderCreatedEvent, emitOrderUpdatedEvent } from "@/lib/realtime";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";
import { getOrderItemSnapshot, getOrderStatusEventType, recordOrderEvent } from "@/lib/order-history";

class OrderStateConflictError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPrismaErrorCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

function haveSameOrderItems(
  existingItems: Array<{ productId: string; variantId: string | null; quantity: number; price: unknown }>,
  incomingItems: OrderItemForMutation[],
) {
  const normalize = (items: Array<{ productId: string; variantId?: string | null; quantity: number; price: unknown }>) =>
    items
      .map((item) => [item.productId, item.variantId ?? "", item.quantity, Math.round(Number(item.price) * 100) / 100])
      .sort((a, b) => a.map(String).join("\u0000").localeCompare(b.map(String).join("\u0000")));

  return JSON.stringify(normalize(existingItems)) === JSON.stringify(normalize(incomingItems));
}

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
    const historyFor = searchParams.get("historyFor")?.trim();
    if (historyFor) {
      const orderExists = await prisma.order.findUnique({
        where: { id: historyFor },
        select: { id: true },
      });
      if (!orderExists) {
        return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
      }

      const events = await prisma.orderEvent.findMany({
        where: { orderId: historyFor },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          eventType: true,
          previousStatus: true,
          newStatus: true,
          previousPaymentStatus: true,
          newPaymentStatus: true,
          actorName: true,
          actorType: true,
          note: true,
          createdAt: true,
        },
      });
      return NextResponse.json({ success: true, events });
    }

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

    const requestedStatus = ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"].includes(status)
      ? (status as OrderStatus)
      : undefined;
    const where: Prisma.OrderWhereInput = {
      ...(customerId ? { userId: customerId } : {}),
      ...(filterDate !== "NO_DATE" && pickupDate ? { pickupDate } : {}),
      ...(status === "ACTIVE"
        ? { status: { notIn: ["COMPLETED", "CANCELLED"] } }
        : status === "AWAITING_PAYMENT_APPROVAL"
        ? {
            status: "PENDING",
            paymentMethod: { not: "CASH" },
            paymentStatus: "PROOF_SUBMITTED",
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
          status: "PENDING",
          paymentMethod: { not: "CASH" },
          paymentStatus: "PROOF_SUBMITTED",
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
        paidAt: order.paidAt,
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
  idempotencyKey?: string;
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
  let requestItems: OrderItemForMutation[] = [];
  let requestOrderNumber: string | null = null;
  let requestIdempotencyKey: string | null = null;
  let requestIsWalkIn: boolean | null = null;
  let requestPaymentMethod: "CASH" | "GCASH" | "PAYMAYA" | null = null;

  try {
    const authCheck = await requireAdminAccess();
    if ("error" in authCheck) {
      return authCheck.error;
    }
    const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:orders:create", "admin");
    if (rateLimitResponse) return rateLimitResponse;

    const parsedBody: unknown = await request.json();
    if (!isRecord(parsedBody)) {
      return apiError(request, 400, "INVALID_CHECKOUT", "Checkout details must be provided as a valid object.");
    }
    requestBody = parsedBody as OrderPayload;
    const body = requestBody;
    const rawItems = body.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return apiError(request, 400, "INVALID_CHECKOUT", "Add at least one product before checkout.");
    }
    if (rawItems.length > 500) {
      return apiError(request, 400, "TOO_MANY_ITEMS", "This checkout contains too many different items. Split it into smaller sales.");
    }

    const items: OrderItemForMutation[] = [];
    for (const rawItem of rawItems as unknown[]) {
      if (!isRecord(rawItem)) {
        return apiError(request, 400, "INVALID_CHECKOUT_ITEM", "One of the checkout items is invalid. Refresh the cart and try again.");
      }
      const productId = typeof rawItem.productId === "string" ? rawItem.productId.trim() : "";
      const variantId = typeof rawItem.variantId === "string" ? rawItem.variantId.trim() : undefined;
      const quantity = rawItem.quantity;
      const price = rawItem.price;
      if (!productId || (rawItem.variantId != null && (!variantId || variantId.length > 128))) {
        return apiError(request, 400, "INVALID_CHECKOUT_ITEM", "One of the checkout items has an invalid product selection. Refresh the cart and try again.");
      }
      if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000) {
        return apiError(request, 400, "INVALID_QUANTITY", "Each product quantity must be a whole number from 1 to 10,000.");
      }
      if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 99_999_999.99) {
        return apiError(request, 400, "INVALID_PRICE", "One of the checkout prices is invalid. Refresh the cart and try again.");
      }
      items.push({
        productId,
        ...(variantId ? { variantId } : {}),
        quantity,
        price,
        ...(typeof rawItem.sku === "string" ? { sku: rawItem.sku } : {}),
        ...(typeof rawItem.unitLabel === "string" ? { unitLabel: rawItem.unitLabel } : {}),
      });
    }
    requestItems = items;

    if (body.orderNumber !== undefined && (typeof body.orderNumber !== "string" || !body.orderNumber.trim() || body.orderNumber.length > 100)) {
      return apiError(request, 400, "INVALID_ORDER_NUMBER", "The checkout number is invalid. Try submitting the sale again.");
    }
    if (body.idempotencyKey !== undefined && (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim() || body.idempotencyKey.length > 128)) {
      return apiError(request, 400, "INVALID_CHECKOUT_KEY", "The checkout request is invalid. Refresh the POS page and try again.");
    }

    if (body.paymentMethod !== undefined && typeof body.paymentMethod !== "string") {
      return apiError(request, 400, "INVALID_PAYMENT_METHOD", "Choose a supported payment method before checkout.");
    }
    const paymentMethodValue = (body.paymentMethod ?? "CASH").toUpperCase();
    const validPaymentMethods: string[] = ["CASH", "GCASH", "PAYMAYA"];
    if (!validPaymentMethods.includes(paymentMethodValue)) {
      return apiError(request, 400, "INVALID_PAYMENT_METHOD", "Choose a supported payment method before checkout.");
    }
    const paymentMethod = paymentMethodValue as "CASH" | "GCASH" | "PAYMAYA";
    requestPaymentMethod = paymentMethod;

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

    const orderNumber = body.orderNumber?.trim() ?? `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const idempotencyKey = body.idempotencyKey?.trim() ?? null;
    requestOrderNumber = orderNumber;
    requestIdempotencyKey = idempotencyKey;
    const totalAmount = items.reduce(
      (sum: number, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0),
      0
    );
    if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 99_999_999.99) {
      return apiError(request, 400, "INVALID_TOTAL", "The checkout total is outside the supported amount. Review the cart and try again.");
    }
    const isWalkIn = body.isWalkIn === true;
    requestIsWalkIn = isWalkIn;
    const initialStatus = resolveInitialOrderStatus(isWalkIn);
    const effectiveStatus = isWalkIn ? "COMPLETED" : initialStatus;
    const effectivePaymentStatus = isWalkIn ? "PAID" : "PENDING";

    if (idempotencyKey) {
      const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existingOrder) {
        if (
          existingOrder.isWalkIn !== isWalkIn ||
          existingOrder.orderNumber !== orderNumber ||
          existingOrder.paymentMethod !== paymentMethod ||
          !haveSameOrderItems(existingOrder.items, items)
        ) {
          return apiError(request, 409, "CHECKOUT_KEY_REUSED", "This checkout request was already used for a different sale. Refresh the cart before trying again.");
        }
        return NextResponse.json({ success: true, order: existingOrder, idempotent: true }, { status: 200 });
      }
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, stock: true, isActive: true, hasVariants: true },
    });
    const existingProductIds = new Set(existingProducts.map((product) => product.id));
    const existingProductMap = new Map(existingProducts.map((product) => [product.id, product]));

    for (const item of items) {
      if (!existingProductIds.has(item.productId)) {
        return apiError(request, 409, "ITEM_UNAVAILABLE", `Product ${item.productId} no longer exists. Refresh the POS catalog and try again.`);
      }

      const product = existingProductMap.get(item.productId);
      if (product && !product.isActive) {
        return apiError(request, 409, "ITEM_UNAVAILABLE", `${product.name} is no longer available for sale. Refresh the POS catalog and try again.`);
      }

    }

    const variantIds = [...new Set(items.filter((item) => item.variantId).map((item) => item.variantId!))];
    const existingVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true, sku: true, attributes: true, stock: true },
    });
    const existingVariantMap = new Map(existingVariants.map((variant) => [variant.id, variant]));

    for (const item of items) {
      if (!item.variantId) continue;

      const variant = existingVariantMap.get(item.variantId);
      if (!variant) {
        return apiError(request, 409, "ITEM_UNAVAILABLE", `A selected product option is no longer available. Refresh the POS catalog and try again.`);
      }

      if (variant.productId !== item.productId) {
        return apiError(request, 400, "INVALID_PRODUCT_OPTION", "A selected product option does not match its product. Refresh the POS catalog and try again.");
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          idempotencyKey,
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
          paidAt: effectivePaymentStatus === "PAID" ? new Date() : null,
          isWalkIn,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              ...getOrderItemSnapshot(
                existingProductMap.get(item.productId),
                item.variantId ? existingVariantMap.get(item.variantId) : null,
              ),
              quantity: Number(item.quantity ?? 1),
              price: Number(item.price ?? 0),
              subtotal: Number(item.price ?? 0) * Number(item.quantity ?? 1),
            })),
          },
        },
        include: { items: true },
      });

      await recordOrderEvent(tx, {
        orderId: createdOrder.id,
        eventType: "ORDER_CREATED",
        newStatus: createdOrder.status,
        newPaymentStatus: createdOrder.paymentStatus,
        actor: {
          userId: authCheck.payload.sub,
          name: authCheck.user?.name,
          type: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
        },
        note: isWalkIn ? "Walk-in sale created and completed." : null,
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
            actorUserId: authCheck.payload.sub,
            orderId: createdOrder.id,
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
    }, { maxWait: 10_000, timeout: 30_000 });

    try {
      emitOrderCreatedEvent({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        customerName: order.customerName,
      });
    } catch (eventError) {
      logError("admin.orders.realtime_publish_failed", eventError, { requestId: getRequestId(request), orderId: order.id });
    }

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error: unknown) {
    logError("admin.orders.post_failed", error, {
      requestId: getRequestId(request),
      itemCount: Array.isArray(requestBody?.items) ? requestBody.items.length : 0,
      isWalkIn: requestBody?.isWalkIn,
      paymentMethod: requestBody?.paymentMethod,
      userId: requestBody?.userId ?? null,
    });

    const requestId = getRequestId(request);
    const prismaCode = getPrismaErrorCode(error);

    if (error instanceof SyntaxError) {
      return apiError(request, 400, "INVALID_JSON", "Checkout details could not be read. Refresh the POS page and try again.");
    }
    if (error instanceof InsufficientStockError) {
      return apiError(request, 409, "INSUFFICIENT_STOCK", error.message);
    }
    if (error instanceof InventoryItemUnavailableError) {
      return apiError(request, 409, "ITEM_UNAVAILABLE", error.message);
    }
    if (error instanceof InventoryConflictError || error instanceof OrderStateConflictError || prismaCode === "P2034") {
      return apiError(request, 409, "INVENTORY_CONFLICT", "Stock changed while checkout was processing. No sale was recorded. Refresh the cart and try again.");
    }
    if (prismaCode === "P2028") {
      return apiError(request, 503, "CHECKOUT_TIMEOUT", "Checkout took too long and was rolled back. No sale was recorded. Retry the checkout; the request is safe to repeat.");
    }
    if (prismaCode === "P2003") {
      return apiError(request, 409, "ITEM_UNAVAILABLE", "A selected product changed while checkout was processing. Refresh the POS catalog and try again.");
    }
    if (["P2024", "P1001", "P1002"].includes(prismaCode ?? "")) {
      return apiError(request, 503, "CHECKOUT_DATABASE_BUSY", "The checkout service is busy or temporarily unreachable. No sale was recorded. Please retry in a moment.");
    }

    if (prismaCode === "P2002" && requestIdempotencyKey) {
      try {
        const existingOrder = await prisma.order.findUnique({
          where: { idempotencyKey: requestIdempotencyKey },
          include: { items: true },
        });
        if (
          existingOrder &&
          existingOrder.isWalkIn === requestIsWalkIn &&
          existingOrder.orderNumber === requestOrderNumber &&
          existingOrder.paymentMethod === requestPaymentMethod &&
          haveSameOrderItems(existingOrder.items, requestItems)
        ) {
          return NextResponse.json({ success: true, order: existingOrder, idempotent: true }, { status: 200 });
        }
      } catch (lookupError) {
        logError("admin.orders.idempotency_lookup_failed", lookupError, { requestId });
      }
      return apiError(request, 409, "ORDER_NUMBER_CONFLICT", "That order number is already in use. Refresh the POS page and submit the sale again.");
    }

    return apiError(request, 500, "CHECKOUT_FAILED", "Checkout could not be confirmed. Check the order list before retrying.");
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

    if (!canTransitionOrderStatus(existingOrder.status, status as OrderStatus)) {
      return NextResponse.json(
        { success: false, message: `Order cannot move from ${existingOrder.status} to ${status}.` },
        { status: 409 },
      );
    }

    if (status === "COMPLETED" && !existingOrder.isWalkIn && existingOrder.status !== "READY_FOR_PICKUP") {
      return NextResponse.json(
        { success: false, message: "An ecommerce order can only be completed after it is ready for pickup." },
        { status: 400 }
      );
    }

    const isOnlinePayment = existingOrder.paymentMethod === "GCASH" || existingOrder.paymentMethod === "PAYMAYA";
    if (
      isOnlinePayment &&
      existingOrder.paymentStatus !== "PAID" &&
      status !== existingOrder.status &&
      status !== "CANCELLED"
    ) {
      return NextResponse.json(
        { success: false, message: "Approve the online payment before moving this order forward." },
        { status: 400 }
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      const movementSource = existingOrder.isWalkIn ? "POS" : "ECOMMERCE";
      const nextPaymentStatus =
        status === "CANCELLED" && ["PENDING", "PROOF_SUBMITTED"].includes(existingOrder.paymentStatus)
          ? "CANCELLED"
          : status === "COMPLETED" && existingOrder.paymentMethod === "CASH"
          ? "PAID"
          : existingOrder.paymentStatus;
      if (status === "CANCELLED") {
        const claim = await tx.order.updateMany({
          where: {
            id,
            status: existingOrder.status,
            paymentStatus: existingOrder.paymentStatus,
            stateVersion: existingOrder.stateVersion,
          },
          data: {
            status: "CANCELLED",
            paymentStatus: nextPaymentStatus,
            reservationExpiresAt: null,
            stateVersion: { increment: 1 },
          },
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
            actorUserId: authCheck.payload.sub,
            orderId: existingOrder.id,
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
            actorUserId: authCheck.payload.sub,
            orderId: existingOrder.id,
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
            actorUserId: authCheck.payload.sub,
            orderId: existingOrder.id,
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

      if (status !== "CANCELLED") {
        const claim = await tx.order.updateMany({
          where: {
            id,
            status: existingOrder.status,
            paymentStatus: existingOrder.paymentStatus,
            stateVersion: existingOrder.stateVersion,
          },
          data: {
            status: status as OrderStatus,
            paymentStatus: nextPaymentStatus,
            ...(status === "COMPLETED" ? { reservationExpiresAt: null } : {}),
            stateVersion: { increment: 1 },
            ...(nextPaymentStatus === "PAID" && !existingOrder.paidAt ? { paidAt: new Date() } : {}),
          },
        });
        if (claim.count !== 1) throw new OrderStateConflictError("Order status changed before the update completed.");
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id } });

      if (updatedOrder.status !== existingOrder.status || updatedOrder.paymentStatus !== existingOrder.paymentStatus) {
        await recordOrderEvent(tx, {
          orderId: updatedOrder.id,
          eventType: getOrderStatusEventType(updatedOrder.status),
          previousStatus: existingOrder.status,
          newStatus: updatedOrder.status,
          previousPaymentStatus: existingOrder.paymentStatus,
          newPaymentStatus: updatedOrder.paymentStatus,
          actor: {
            userId: authCheck.payload.sub,
            name: authCheck.user?.name,
            type: authCheck.user?.role === "STAFF" ? "STAFF" : "ADMIN",
          },
        });
      }

      return updatedOrder;
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
