export const ADMIN_NOTIFICATION_STORAGE_KEY = "apc-admin-notifications";
const ADMIN_NOTIFIED_ORDERS_KEY = "apc-admin-notified-orders";

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
