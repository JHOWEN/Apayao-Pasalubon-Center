export const ADMIN_NOTIFICATION_STORAGE_KEY = "apc-admin-notifications";
export const DISMISSED_PICKUP_ALERTS_STORAGE_KEY = "apc-admin-dismissed-pickup-alerts";
export const OPEN_PICKUP_ORDER_STORAGE_KEY = "apc-admin-open-pickup-order";
export const OPEN_PICKUP_ORDER_EVENT = "apc-admin-open-pickup-order";
const ADMIN_NOTIFIED_ORDERS_KEY = "apc-admin-notified-orders";

export function getDismissedPickupAlertIds() {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(DISMISSED_PICKUP_ALERTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(stored)
      ? [...new Set(stored.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [];
  } catch {
    return [];
  }
}

export function dismissPickupAlert(orderId: string) {
  if (typeof window === "undefined" || !orderId) return;

  try {
    const dismissedIds = new Set(getDismissedPickupAlertIds());
    dismissedIds.add(orderId);
    window.localStorage.setItem(DISMISSED_PICKUP_ALERTS_STORAGE_KEY, JSON.stringify([...dismissedIds]));
  } catch {
    // The alert still disappears for the current page when storage is unavailable.
  }
}

export function getAdminNotificationCount() {
  if (typeof window === "undefined") {
    return 0;
  }

  const storedValue = Number(window.localStorage.getItem(ADMIN_NOTIFICATION_STORAGE_KEY) ?? "0");
  return Number.isFinite(storedValue) && storedValue >= 0 ? storedValue : 0;
}

export function setAdminNotificationCount(value: number) {
  const nextValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_NOTIFICATION_STORAGE_KEY, String(nextValue));
    window.dispatchEvent(new CustomEvent("apc-admin-notifications-updated", { detail: nextValue }));
  }

  return nextValue;
}

export function calculatePickupAlertCount(
  orders: Array<{ status?: string; pickupDate?: string | null }>,
) {
  if (!Array.isArray(orders) || orders.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const latestWindow = new Date(today);
  latestWindow.setDate(today.getDate() + 2);

  return orders.filter((order) => {
    if (!order?.pickupDate || order.status === "CANCELLED" || order.status === "COMPLETED") return false;

    const pickupDate = new Date(order.pickupDate);
    if (Number.isNaN(pickupDate.getTime())) return false;

    const pickupStart = new Date(today);
    pickupStart.setHours(0, 0, 0, 0);

    const pickupEnd = new Date(latestWindow);
    pickupEnd.setHours(23, 59, 59, 999);

    return pickupDate >= pickupStart && pickupDate <= pickupEnd;
  }).length;
}

export function incrementAdminNotificationCount() {
  return setAdminNotificationCount(getAdminNotificationCount() + 1);
}

export function clearAdminNotificationCount() {
  return setAdminNotificationCount(0);
}

export function notifyAdminOfNewOrder(orderId: string) {
  if (typeof window === "undefined" || !orderId) return;

  let notifiedOrderIds: string[] = [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(ADMIN_NOTIFIED_ORDERS_KEY) ?? "[]");
    if (Array.isArray(stored)) notifiedOrderIds = stored.filter((id): id is string => typeof id === "string");
  } catch {
    // Continue with an empty history if browser storage contains invalid data.
  }

  if (notifiedOrderIds.includes(orderId)) return;

  window.localStorage.setItem(ADMIN_NOTIFIED_ORDERS_KEY, JSON.stringify([...notifiedOrderIds, orderId].slice(-100)));
  incrementAdminNotificationCount();
}
