"use client";

import Image from "@/components/safe-image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronRight,
  ExternalLink,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { syncAdminPickupAlertCount } from "@/lib/admin-notifications";
import { getPickupDateKey } from "@/lib/order";

const fallbackAvatarSrc = process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png";
type ThemeMode = "light" | "dark" | "system";

function getRouteInfo(pathname: string) {
  if (pathname.startsWith("/pos")) return { category: "Sales", title: "Point of Sale" };
  if (pathname.startsWith("/admin-orders")) return { category: "Sales", title: "Orders" };
  if (pathname.startsWith("/products")) return { category: "Catalog", title: "Products" };
  if (pathname.startsWith("/categories")) return { category: "Catalog", title: "Categories" };
  if (pathname.startsWith("/inventory/transactions")) return { category: "Stock", title: "Transactions" };
  if (pathname.startsWith("/inventory")) return { category: "Stock", title: "Inventory" };
  if (pathname.startsWith("/customers")) return { category: "Customers", title: "Accounts" };
  if (pathname.startsWith("/analytics")) return { category: "Insights", title: "Analytics" };
  if (pathname.startsWith("/reports")) return { category: "Insights", title: "Reports" };
  if (pathname.startsWith("/admin-settings")) return { category: "Workspace", title: "Settings" };
  if (pathname.startsWith("/dashboard")) return { category: "Dashboard", title: "Dashboard" };
  return { category: "Admin", title: "Console" };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const routeInfo = getRouteInfo(pathname);

  const [avatarSrc, setAvatarSrc] = useState(fallbackAvatarSrc);
  const [userRole, setUserRole] = useState<"ADMIN" | "STAFF" | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"checking" | "verified" | "unavailable">("checking");
  const [sessionRetryVersion, setSessionRetryVersion] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [isThemeInitialized, setIsThemeInitialized] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; orderNumber: string; customerName: string; pickupDate: string; status: string }>
  >([]);

  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const orderChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!isMobileNavOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen]);

  useEffect(() => {
    let isActive = true;
    let isCheckingSession = false;

    async function loadProfileAvatar() {
      if (isCheckingSession) return;
      isCheckingSession = true;

      try {
        let response = await fetch("/api/admin/profile", { cache: "no-store" });
        if (response.status === 401) {
          const refreshResponse = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
          if (refreshResponse.ok || refreshResponse.status === 409) {
            response = await fetch("/api/admin/profile", { cache: "no-store" });
          }
        }
        if (response.status === 401) {
          window.location.replace("/login?reason=session-expired");
          return;
        }
        if (response.status === 403) {
          window.location.replace("/login?reason=access-denied");
          return;
        }
        if (!response.ok) throw new Error("Unable to verify your admin session.");

        const data = await response.json();
        const role = data?.user?.role;
        if (!data?.success || (role !== "ADMIN" && role !== "STAFF")) {
          window.location.replace("/login?reason=access-denied");
          return;
        }

        const nextAvatarSrc =
          typeof data?.user?.imageUrl === "string" && data.user.imageUrl.trim()
            ? data.user.imageUrl
            : fallbackAvatarSrc;
        if (isActive) {
          setAvatarSrc(nextAvatarSrc);
          setUserRole(role);
          setSessionStatus("verified");
        }
      } catch {
        if (isActive) setSessionStatus("unavailable");
      } finally {
        isCheckingSession = false;
      }
    }

    const revalidateVisibleSession = () => {
      if (document.visibilityState !== "visible") return;
      setSessionStatus("checking");
      void loadProfileAvatar();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revalidateVisibleSession();
    };
    const handleSessionEnded = (event: StorageEvent) => {
      if (event.key === "apc-auth-session-ended" && event.newValue) {
        window.location.replace("/login?reason=session-expired");
      }
    };

    loadProfileAvatar();

    window.addEventListener("apc-user-updated", loadProfileAvatar);
    document.addEventListener("visibilitychange", revalidateVisibleSession);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleSessionEnded);

    return () => {
      isActive = false;
      window.removeEventListener("apc-user-updated", loadProfileAvatar);
      document.removeEventListener("visibilitychange", revalidateVisibleSession);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleSessionEnded);
    };
  }, [sessionRetryVersion]);

  useEffect(() => {
    if (sessionStatus !== "verified") return;

    let isRefreshing = false;
    const refreshSession = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        const response = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
        if (response.status === 401) {
          window.location.replace("/login?reason=session-expired");
        } else if (response.status === 409) {
          const profileResponse = await fetch("/api/admin/profile", { cache: "no-store" });
          if (profileResponse.status === 401) {
            window.location.replace("/login?reason=session-expired");
          }
        }
      } catch {
        // Keep the current session state; the next interval will retry.
      } finally {
        isRefreshing = false;
      }
    };
    const refreshInterval = window.setInterval(() => void refreshSession(), 4 * 60 * 1000);
    return () => window.clearInterval(refreshInterval);
  }, [sessionStatus]);

  useEffect(() => {
    const themeTimeout = window.setTimeout(() => {
      let storedTheme: string | null = null;
      try {
        storedTheme = window.localStorage.getItem("apc-theme");
      } catch {
        // Keep the system theme when browser storage is unavailable.
      }

      setTheme(storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
        ? storedTheme
        : "system");
      setIsThemeInitialized(true);
    }, 0);

    return () => window.clearTimeout(themeTimeout);
  }, []);

  useEffect(() => {
    if (userRole !== "STAFF") return;

    const staffRestrictedPaths = ["/dashboard", "/admin-orders", "/categories", "/inventory", "/customers"];
    if (staffRestrictedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      router.replace("/pos");
    }
  }, [pathname, router, userRole]);

  useEffect(() => {
    if (!isThemeInitialized) return;

    const root = document.documentElement;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    try {
      window.localStorage.setItem("apc-theme", theme);
    } catch {
      // Theme still applies when browser storage is unavailable.
    }
  }, [isThemeInitialized, theme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (sessionStatus !== "verified") return;

    async function loadPickupNotifications() {
      try {
        const response = await fetch("/api/admin/orders?status=ACTIVE&filterDate=NEXT_7_DAYS&limit=50");
        if (!response.ok) {
          setNotifications([]);
          return;
        }

        const data = await response.json();
        const orders = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const latestWindow = new Date(today);
        latestWindow.setDate(today.getDate() + 2);

        const upcoming = orders
              .filter((order: { status?: string; pickupDate?: string | null }) => {
                if (!order.pickupDate) {
                  return false;
                }

                if (order.status === "CANCELLED" || order.status === "COMPLETED") {
                  return false;
                }

                const pickupKey = getPickupDateKey(order.pickupDate);
                if (!Number.isFinite(pickupKey)) {
                  return false;
                }

                const todayKey = getPickupDateKey(today);
                const latestKey = getPickupDateKey(latestWindow);

                return pickupKey >= todayKey && pickupKey <= latestKey;
              })
              .map((order: { id: string; orderNumber: string; customerName: string; pickupDate: string; status: string }) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                pickupDate: order.pickupDate,
                status: order.status,
              }))
              .sort(
                (left: { pickupDate: string }, right: { pickupDate: string }) =>
                  new Date(left.pickupDate).getTime() - new Date(right.pickupDate).getTime(),
              )
              .slice(0, 5)

        setNotifications(upcoming);
        syncAdminPickupAlertCount(upcoming);
      } catch {
        setNotifications([]);
        syncAdminPickupAlertCount([]);
      }
    }

    const handleNewOrder = () => {
      void loadPickupNotifications();
    };

    const handleStorageRefresh = (event: StorageEvent) => {
      if (event.key === "apc-new-order-trigger") {
        void loadPickupNotifications();
      }
    };

    const handleSseMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as { type?: string };
        if (message?.type === "order-created" || message?.type === "order-updated" || message?.type === "inventory-updated") {
          window.dispatchEvent(new CustomEvent("apc-admin-live-event", { detail: message }));
          void loadPickupNotifications();
        }
      } catch {
        // Ignore invalid SSE payloads.
      }
    };

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("apc-order-events");
      channel.onmessage = (event) => {
        const message = event?.data as { type?: string } | undefined;
        if (message?.type === "apc-new-order") {
          void loadPickupNotifications();
        }
      };
      orderChannelRef.current = channel;
    }

    const eventSource = new EventSource("/api/admin/live");
    eventSource.addEventListener("order-created", handleSseMessage);
    eventSource.addEventListener("order-updated", handleSseMessage);
    eventSource.addEventListener("inventory-updated", handleSseMessage);

    void loadPickupNotifications();
    window.addEventListener("apc-new-order", handleNewOrder);
    window.addEventListener("storage", handleStorageRefresh);

    const refreshInterval = window.setInterval(() => {
      void loadPickupNotifications();
    }, 30000);

    return () => {
      window.removeEventListener("apc-new-order", handleNewOrder);
      window.removeEventListener("storage", handleStorageRefresh);
      window.clearInterval(refreshInterval);
      eventSource.close();
      if (orderChannelRef.current) {
        orderChannelRef.current.close();
        orderChannelRef.current = null;
      }
    };
  }, [sessionStatus]);

  if (sessionStatus !== "verified") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <section className="w-full max-w-sm text-center" aria-live="polite" role="status">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/25 border-t-emerald-500" />
          <h1 className="text-lg font-semibold">{sessionStatus === "checking" ? "Verifying your session" : "Can’t verify your session"}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {sessionStatus === "checking"
              ? "Protected dashboard content is hidden while we confirm your access."
              : "Check your connection and retry to continue to the dashboard."}
          </p>
          {sessionStatus === "unavailable" ? (
            <button
              type="button"
              onClick={() => setSessionRetryVersion((version) => version + 1)}
              className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Retry verification
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <div className="fixed inset-0 h-dvh overflow-hidden bg-[#f5f6f4] text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-dvh overflow-visible">
        {isMobileNavOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileNavOpen(false)}
            className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          />
        ) : null}
        <AdminSidebar isMobile={isMobileNavOpen} onCloseMobile={() => setIsMobileNavOpen(false)} />

        {/* Main Application Area */}
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
          {/* Top Panel Header */}
          <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-3 sm:px-5 lg:px-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open navigation"
                aria-expanded={isMobileNavOpen}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08b32] lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
              <div className="flex min-w-0 items-center gap-2.5 text-slate-900 dark:text-white">
                <div className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:flex dark:text-slate-500">
                  <span>{routeInfo.category}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                </div>
                <span className="truncate text-sm font-semibold sm:text-[15px]">
                  {routeInfo.title}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              {/* Storefront preview shortcut */}
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Open customer storefront in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span>View Store</span>
              </Link>

              <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

              {/* Pickup Notifications Popover */}
              <div className="relative z-40" ref={notificationMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((value) => !value)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08b32] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Pickup alerts"
                  title="Pickup alerts"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {notifications.length > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-in zoom-in-50">
                      {notifications.length}
                    </span>
                  ) : null}
                </button>

                {isNotificationsOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2.5 w-80 sm:w-96 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in-0 zoom-in-95 duration-150 origin-top-right ring-1 ring-black/5 dark:ring-white/5">
                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 px-0.5 dark:border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                          <Bell className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          Pickup Alerts
                        </span>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                        {notifications.length} upcoming
                      </span>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto admin-modal-scrollbar pr-0.5">
                      {notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              router.push("/admin-orders");
                            }}
                            className="group flex w-full items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left transition-all duration-150 hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-xs dark:border-slate-800/80 dark:bg-slate-800/40 dark:hover:border-emerald-800/60 dark:hover:bg-emerald-950/30"
                          >
                            <div className="mt-0.5 flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 ring-1 ring-emerald-500/20">
                              <Bell className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-900 truncate dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                                {notification.customerName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                Order #{notification.orderNumber}
                              </div>
                              <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                Pickup: {new Date(notification.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <Bell className="mx-auto h-5 w-5 text-slate-300 dark:text-slate-600 mb-1.5" />
                          No pending pickups for the next 2 days.
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          router.push("/admin-orders");
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                      >
                        <span>View all orders in admin</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08b32] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-2.5 sm:ml-1.5 sm:pl-3 dark:border-slate-800">
                <div className="hidden text-right md:block">
                  <p className="text-xs font-semibold leading-4 text-slate-800 dark:text-slate-100">
                    {userRole === "STAFF" ? "Staff workspace" : "Admin workspace"}
                  </p>
                  <p className="text-[10px] leading-4 text-slate-400 dark:text-slate-500">APC Inventory</p>
                </div>
                <div
                  role="img"
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
                  aria-label={userRole === "STAFF" ? "Staff account" : "Admin account"}
                  title={userRole === "STAFF" ? "Staff account" : "Admin account"}
                >
                  <div className="relative h-7 w-7 overflow-hidden rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Image
                      src={avatarSrc}
                      alt=""
                      fill
                      sizes="30px"
                      className="object-cover"
                    />
                  </div>

                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                </div>
              </div>
            </div>
          </header>

          {/* Main scrollable page content */}
          <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f5f6f4] p-4 text-slate-800 sm:p-5 lg:p-7 dark:bg-slate-950 dark:text-slate-100">
            <div key={pathname} className="admin-page-enter">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
