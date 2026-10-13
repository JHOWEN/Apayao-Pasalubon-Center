import { orderCreateSchema, type OrderItemInput } from "@/features/orders/validators/orders";

export const orderStatuses = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
] as const;

export const ONLINE_PAYMENT_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

export type OrderStatus = (typeof orderStatuses)[number];

export const orderStatusProgression = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COMPLETED",
] as const;

export type OrderProgressionStatus = (typeof orderStatusProgression)[number];

export const orderStatusSteps = [
  { key: "PENDING", label: "Pending" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export type { OrderItemInput };

export type OrderPayload = {
  userId?: string | null;
  items?: OrderItemInput[];
  orderNumber?: string;
  idempotencyKey?: string;
  customerName?: string;
  customerPhone?: string;
  pickupDate?: string;
  pickupTime?: string;
  paymentMethod?: string;
  isWalkIn?: boolean;
};

export type ValidatedOrderItem = {
  productId: string;
  variantId?: string;
  quantity: number;
  price?: number;
  sku?: string;
  unitLabel?: string;
};

export type ValidatedOrderPayload = Omit<OrderPayload, "items" | "paymentMethod"> & {
  items: ValidatedOrderItem[];
  paymentMethod?: "CASH" | "GCASH" | "PAYMAYA";
};

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === "string" && orderStatuses.includes(value as OrderStatus);

export const getNextOrderStatus = (status: OrderStatus): OrderStatus | null => {
  const index = orderStatusProgression.indexOf(status as OrderProgressionStatus);
  return index === -1 || index === orderStatusProgression.length - 1
    ? null
    : orderStatusProgression[index + 1];
};

const allowedOrderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionOrderStatus = (current: OrderStatus, next: OrderStatus) =>
  current === next || allowedOrderTransitions[current].includes(next);

export const canCancelOrder = (status: OrderStatus) => status === "PENDING";

export const getPickupDateKey = (value: string | Date | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return new Date().setHours(0, 0, 0, 0);
  }

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return NaN;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
};

export const normalizePickupDateInput = (value: string | Date | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return new Date();
  }

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return new Date(trimmed);
};

export const isPickupDateAheadOfToday = (pickupDateValue: string | Date | null | undefined) => {
  const pickupKey = getPickupDateKey(pickupDateValue);
  const currentKey = getPickupDateKey(new Date());

  return Number.isFinite(pickupKey) && Number.isFinite(currentKey) && pickupKey > currentKey;
};

export const isPickupDateOnOrAfterToday = (pickupDateValue: string | Date | null | undefined) => {
  const pickupKey = getPickupDateKey(pickupDateValue);
  const currentKey = getPickupDateKey(new Date());

  return Number.isFinite(pickupKey) && Number.isFinite(currentKey) && pickupKey >= currentKey;
};

import { PaymentStatus } from "@prisma/client";

export const resolveInitialPaymentStatus = (paymentMethod?: string | null): PaymentStatus => {
  const normalizedMethod = typeof paymentMethod === "string" ? paymentMethod.trim().toUpperCase() : "";

  if (normalizedMethod === "CASH") {
    return PaymentStatus.PENDING;
  }

  return PaymentStatus.PENDING;
};

export const getEffectivePaymentStatus = ({
  paymentMethod,
  paymentStatus,
  status,
}: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  status?: string | null;
}): PaymentStatus => {
  const normalizedMethod = typeof paymentMethod === "string" ? paymentMethod.trim().toUpperCase() : "";

  if (paymentStatus === "FAILED") {
    return PaymentStatus.FAILED;
  }

  if (paymentStatus === "PAID") {
    return PaymentStatus.PAID;
  }

  if (status === "CANCELLED" || paymentStatus === "CANCELLED") {
    return PaymentStatus.CANCELLED;
  }

  if (normalizedMethod === "CASH") {
    return status === "COMPLETED" || paymentStatus === "PAID" ? PaymentStatus.PAID : PaymentStatus.PENDING;
  }

  if (paymentStatus === "PROOF_SUBMITTED") {
    return PaymentStatus.PROOF_SUBMITTED;
  }

  return PaymentStatus.PENDING;
};

export const resolveInitialOrderStatus = (
  isWalkIn: boolean
): OrderStatus => {
  return isWalkIn ? "COMPLETED" : "PENDING";
};

export const validateOrderPayload = (
  payload: unknown,
  options?: {
    allowWalkIn?: boolean;
  }
): { success: true; payload: ValidatedOrderPayload } | { success: false; message: string } => {
  const result = orderCreateSchema.safeParse(payload);
  if (!result.success) {
    return { success: false, message: result.error.issues[0]?.message ?? "Invalid order payload." };
  }

  const body = result.data;
  const items: ValidatedOrderItem[] = body.items.map((item) => ({
    productId: item.productId,
    ...(typeof item.variantId === "string" ? { variantId: item.variantId } : {}),
    quantity: item.quantity,
    ...(typeof item.price === "number" ? { price: item.price } : {}),
    ...(typeof item.sku === "string" ? { sku: item.sku } : {}),
    ...(typeof item.unitLabel === "string" ? { unitLabel: item.unitLabel } : {}),
  }));
  const pickupDate = body.pickupDate?.trim() || undefined;
  const pickupTime = body.pickupTime?.trim() || undefined;

  if (pickupTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(pickupTime)) {
    return { success: false, message: "Invalid pickup time." };
  }

  if (pickupDate) {
    const date = new Date(pickupDate);
    if (Number.isNaN(date.getTime())) {
      return { success: false, message: "Invalid pickup date." };
    }

    if (!isPickupDateOnOrAfterToday(date)) {
      return { success: false, message: "Pickup date cannot be earlier than the order date. Same-day pickup is allowed." };
    }
  }

  const validated: ValidatedOrderPayload = {
    userId: body.userId ?? null,
    items,
    orderNumber: body.orderNumber,
    idempotencyKey: body.idempotencyKey,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    pickupDate,
    pickupTime,
    paymentMethod: body.paymentMethod,
    isWalkIn: Boolean(body.isWalkIn) && options?.allowWalkIn === true,
  };

  return { success: true, payload: validated };
};

export const getOrderActionLabel = (currentStatus: OrderStatus) => {
  switch (currentStatus) {
    case "PENDING":
      return "Confirm order";
    case "CONFIRMED":
      return "Preparing";
    case "PREPARING":
      return "Ready for pickup";
    case "READY_FOR_PICKUP":
      return "Completed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Update";
  }
};
