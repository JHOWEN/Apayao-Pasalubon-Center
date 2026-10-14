import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";

export type OrderHistoryActor = {
  userId?: string | null;
  name?: string | null;
  type: "CUSTOMER" | "ADMIN" | "STAFF" | "SYSTEM";
};

export async function recordOrderEvent(
  transaction: Prisma.TransactionClient,
  event: {
    orderId: string;
    eventType: string;
    previousStatus?: OrderStatus | null;
    newStatus?: OrderStatus | null;
    previousPaymentStatus?: PaymentStatus | null;
    newPaymentStatus?: PaymentStatus | null;
    actor: OrderHistoryActor;
    note?: string | null;
  },
) {
  await transaction.orderEvent.create({
    data: {
      orderId: event.orderId,
      eventType: event.eventType,
      previousStatus: event.previousStatus ?? null,
      newStatus: event.newStatus ?? null,
      previousPaymentStatus: event.previousPaymentStatus ?? null,
      newPaymentStatus: event.newPaymentStatus ?? null,
      actorUserId: event.actor.userId ?? null,
      actorName: event.actor.name ?? null,
      actorType: event.actor.type,
      note: event.note ?? null,
    },
  });
}

export function getOrderStatusEventType(status: OrderStatus) {
  if (status === "CANCELLED") return "ORDER_CANCELLED";
  if (status === "COMPLETED") return "ORDER_COMPLETED";
  return "ORDER_STATUS_CHANGED";
}

export function getOrderItemSnapshot(
  product: { name: string; sku: string } | undefined,
  variant?: { sku: string; attributes: string | null } | null,
) {
  if (!product) throw new Error("Order item product was not found while saving its snapshot.");

  return {
    productNameSnapshot: product.name,
    productSkuSnapshot: product.sku,
    variantSkuSnapshot: variant?.sku ?? null,
    variantAttributesSnapshot: variant?.attributes ?? null,
  };
}
