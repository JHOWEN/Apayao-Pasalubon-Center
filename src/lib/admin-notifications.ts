export const ADMIN_NOTIFICATION_STORAGE_KEY = "apc-admin-notifications";

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
  orders: Array<{ status?: string; pickupDate?: string | null }>
) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const latestWindow = new Date(today);
  latestWindow.setDate(today.getDate() + 2);

  return orders.filter((order) => {
    if (!order?.pickupDate) {
      return false;
    }

    if (order.status === "CANCELLED" || order.status === "COMPLETED") {
      return false;
    }

    const pickupDate = new Date(order.pickupDate);
    if (Number.isNaN(pickupDate.getTime())) {
      return false;
    }

    const pickupStart = new Date(today);
    pickupStart.setHours(0, 0, 0, 0);

    const pickupEnd = new Date(latestWindow);
    pickupEnd.setHours(23, 59, 59, 999);

    return pickupDate >= pickupStart && pickupDate <= pickupEnd;
  }).length;
}

export function syncAdminPickupAlertCount(orders: Array<{ status?: string; pickupDate?: string | null }>) {
  return setAdminNotificationCount(calculatePickupAlertCount(orders));
}

export function incrementAdminNotificationCount() {
  return setAdminNotificationCount(getAdminNotificationCount() + 1);
}

export function clearAdminNotificationCount() {
  return setAdminNotificationCount(0);
}

export function emitNewOrderAdminNotification() {
  if (typeof window === "undefined") {
    return;
  }

  incrementAdminNotificationCount();
  window.localStorage.setItem("apc-new-order-trigger", String(Date.now()));

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("apc-order-events");
    channel.postMessage({ type: "apc-new-order" });
    channel.close();
  }

  window.dispatchEvent(new Event("apc-new-order"));
}
