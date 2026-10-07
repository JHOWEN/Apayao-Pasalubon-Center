import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { emitOrderUpdatedEvent } from "@/lib/realtime";
import { applyOrderInventoryMovement } from "./inventory";
import { recordOrderEvent } from "@/lib/order-history";

export async function expireWalletReservations(now = new Date(), limit = 50) {
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentStatus: "PENDING",
      paymentMethod: { in: ["GCASH", "PAYMAYA"] },
      proofOfPaymentUrl: null,
      reservationExpiresAt: { lte: now },
    },
    select: { id: true, userId: true, orderNumber: true, stateVersion: true },
    orderBy: { reservationExpiresAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });

  let expiredCount = 0;
  let failedCount = 0;

  for (const candidate of candidates) {
    try {
      const expired = await prisma.$transaction(async (tx) => {
        const reservation = await tx.inventoryTransaction.findFirst({
          where: {
            orderNumber: candidate.orderNumber,
            source: "ECOMMERCE",
            eventType: "RESERVATION_CREATED",
          },
          select: { id: true },
        });
        if (!reservation) return false;

        const claim = await tx.order.updateMany({
          where: {
            id: candidate.id,
            status: "PENDING",
            paymentStatus: "PENDING",
            paymentMethod: { in: ["GCASH", "PAYMAYA"] },
            proofOfPaymentUrl: null,
            reservationExpiresAt: { lte: now },
            stateVersion: candidate.stateVersion,
          },
          data: {
            status: "CANCELLED",
            paymentStatus: "CANCELLED",
            reservationExpiresAt: null,
            stateVersion: { increment: 1 },
          },
        });

        if (claim.count !== 1) return false;

        await recordOrderEvent(tx, {
          orderId: candidate.id,
          eventType: "RESERVATION_EXPIRED",
          previousStatus: "PENDING",
          newStatus: "CANCELLED",
          previousPaymentStatus: "PENDING",
          newPaymentStatus: "CANCELLED",
          actor: { type: "SYSTEM", name: "Reservation expiry" },
          note: "Online payment reservation expired before proof was submitted.",
        });

        const stockOuts = await tx.inventoryTransaction.findMany({
          where: {
            orderNumber: candidate.orderNumber,
            source: "ECOMMERCE",
            type: "STOCK_OUT",
          },
          select: { productId: true, variantId: true, quantity: true },
        });
        const wasRestored = await tx.inventoryTransaction.count({
          where: {
            orderNumber: candidate.orderNumber,
            source: "ECOMMERCE",
            type: "RETURN",
            remarks: { contains: "cancelled - stock returned" },
          },
        });

        if (stockOuts.length && !wasRestored) {
          await applyOrderInventoryMovement(
            tx,
            stockOuts.filter((movement) => movement.productId).map((movement) => ({
              productId: movement.productId as string,
              variantId: movement.variantId ?? undefined,
              quantity: movement.quantity,
            })),
            "RETURN",
            `Order ${candidate.orderNumber} expired - stock returned`,
            "Reservation expiry",
            {
              orderId: candidate.id,
              performedByType: "SYSTEM",
              source: "ECOMMERCE",
              orderNumber: candidate.orderNumber,
              eventType: "RESERVATION_RELEASED",
            },
          );
        }

        return true;
      });

      if (expired) {
        expiredCount += 1;
        emitOrderUpdatedEvent({
          orderId: candidate.id,
          orderNumber: candidate.orderNumber,
          status: "CANCELLED",
          userId: candidate.userId,
        });
      }
    } catch (error) {
      failedCount += 1;
      logError("orders.reservation_expiry_failed", error, { orderId: candidate.id });
    }
  }

  return { expiredCount, failedCount };
}
