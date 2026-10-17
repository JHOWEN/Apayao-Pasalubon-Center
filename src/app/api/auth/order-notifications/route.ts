import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserForToken } from "@/lib/auth";
import { parseJsonRequestBody } from "@/lib/api-validation";
import { apiError } from "@/lib/api-response";
import { getRequestId, logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const markNotificationsReadSchema = z.union([
  z.object({ ids: z.array(z.string().trim().min(1).max(128)).min(1).max(50) }).strict(),
  z.object({ markAll: z.literal(true) }).strict(),
]);

const customerVisibleOrderEventWhere = {
  newStatus: { not: null },
  OR: [
    { eventType: "ORDER_CREATED" },
    {
      eventType: { in: ["ORDER_STATUS_CHANGED", "ORDER_COMPLETED", "ORDER_CANCELLED", "RESERVATION_EXPIRED"] },
      actorType: { in: ["ADMIN", "STAFF", "SYSTEM"] },
    },
  ],
};

async function requireCustomer(request: Request, route: string) {
  const token = (await cookies()).get("token")?.value;
  const user = token ? await getUserForToken(token) : null;

  if (!user) {
    return {
      response: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }),
    };
  }

  if (user.isBlocked || user.role !== "CUSTOMER") {
    return {
      response: NextResponse.json({ success: false, message: "Customer account required." }, { status: 403 }),
    };
  }

  const rateLimitResponse = await enforceRateLimit(request, route, {
    group: "user",
    accountId: user.id,
  });
  if (rateLimitResponse) return { response: rateLimitResponse };

  return { userId: user.id };
}

export async function GET(request: Request) {
  try {
    const access = await requireCustomer(request, "user:order-notifications:get");
    if ("response" in access) return access.response;

    const where = {
      ...customerVisibleOrderEventWhere,
      order: { userId: access.userId },
    };
    const [events, unreadCount] = await Promise.all([
      prisma.orderEvent.findMany({
        where,
        select: {
          id: true,
          eventType: true,
          previousStatus: true,
          newStatus: true,
          note: true,
          createdAt: true,
          customerReadAt: true,
          order: { select: { id: true, orderNumber: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      }),
      prisma.orderEvent.count({
        where: { ...where, customerReadAt: null },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        notifications: events.map((event) => ({
          id: event.id,
          orderId: event.order.id,
          orderNumber: event.order.orderNumber,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          status: event.newStatus,
          note: event.note,
          createdAt: event.createdAt,
          readAt: event.customerReadAt,
        })),
        unreadCount,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    logError("customer.order_notifications.get_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 500, "ORDER_NOTIFICATIONS_FAILED", "Unable to load order notifications.");
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireCustomer(request, "user:order-notifications:read");
    if ("response" in access) return access.response;

    const parsed = await parseJsonRequestBody(
      request,
      markNotificationsReadSchema,
      "Choose the notifications to mark as read.",
    );
    if (!parsed.success) return parsed.response;

    const eventFilter = {
      ...customerVisibleOrderEventWhere,
      order: { userId: access.userId },
      customerReadAt: null,
    };
    const markAll = "markAll" in parsed.data && parsed.data.markAll;
    const result = await prisma.orderEvent.updateMany({
      where: {
        ...eventFilter,
        ...(markAll ? {} : { id: { in: "ids" in parsed.data ? parsed.data.ids : [] } }),
      },
      data: { customerReadAt: new Date() },
    });

    return NextResponse.json({ success: true, updatedCount: result.count });
  } catch (error) {
    logError("customer.order_notifications.read_failed", error, { requestId: getRequestId(request) });
    return apiError(request, 500, "ORDER_NOTIFICATIONS_UPDATE_FAILED", "Unable to update order notifications.");
  }
}
