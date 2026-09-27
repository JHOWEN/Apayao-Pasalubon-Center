"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronRight,
  ExternalLink,
  Moon,
  Sun,
} from "lucide-react";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { syncAdminPickupAlertCount } from "@/lib/admin-notifications";
import { getPickupDateKey } from "@/lib/order";

const fallbackAvatarSrc = process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png";
type ThemeMode = "light" | "dark" | "system";

function getRouteInfo(pathname: string) {
  if (pathname.startsWith("/pos")) return { category: "Sales Channels", title: "Point of Sale" };
  if (pathname.startsWith("/admin-orders")) return { category: "Sales Channels", title: "Orders" };
  if (pathname.startsWith("/products")) return { category: "Inventory", title: "Storefront Products" };
  if (pathname.startsWith("/categories")) return { category: "Inventory", title: "Categories" };
  if (pathname.startsWith("/inventory/transactions")) return { category: "Inventory", title: "Stock Transactions" };
  if (pathname.startsWith("/inventory")) return { category: "Inventory", title: "Inventory" };
  if (pathname.startsWith("/customers")) return { category: "Customer", title: "User Management" };
  if (pathname.startsWith("/analytics")) return { category: "System", title: "Analytics" };
  if (pathname.startsWith("/reports")) return { category: "System", title: "Reports" };
  if (pathname.startsWith("/admin-settings")) return { category: "System", title: "Settings" };
  if (pathname.startsWith("/dashboard")) return { category: "Dashboard", title: "Dashboard" };
  return { category: "Admin", title: "Console" };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const routeInfo = getRouteInfo(pathname);

  const [avatarSrc, setAvatarSrc] = useState(fallbackAvatarSrc);
  const [userRole, setUserRole] = useState<"ADMIN" | "STAFF" | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; orderNumber: string; customerName: string; pickupDate: string; status: string }>
  >([]);

  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const orderChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    async function loadProfileAvatar() {
      try {
        const response = await fetch("/api/auth/profile");
        if (!response.ok) {
          setAvatarSrc(fallbackAvatarSrc);
          return;
        }

        const data = await response.json();
        const nextAvatarSrc =
          typeof data?.user?.imageUrl === "string" && data.user.imageUrl.trim()
            ? data.user.imageUrl
            : fallbackAvatarSrc;
        setAvatarSrc(nextAvatarSrc);
        if (data?.user?.role === "ADMIN" || data?.user?.role === "STAFF") {
          setUserRole(data.user.role);
        }
      } catch {
        setAvatarSrc(fallbackAvatarSrc);
      }
    }

    const storedTheme = window.localStorage.getItem("apc-theme") as ThemeMode | null;
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      window.setTimeout(() => {
        setTheme(storedTheme);
      }, 0);
    }

    loadProfileAvatar();

    window.addEventListener("apc-user-updated", loadProfileAvatar);

    return () => {
      window.removeEventListener("apc-user-updated", loadProfileAvatar);
    };
  }, []);

  useEffect(() => {
    if (userRole !== "STAFF") return;

    const staffRestrictedPaths = ["/dashboard", "/admin-orders", "/categories", "/inventory", "/customers"];
    if (staffRestrictedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      router.replace("/pos");
    }
  }, [pathname, router, userRole]);

  useEffect(() => {
    const root = document.documentElement;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    window.localStorage.setItem("apc-theme", theme);
  }, [theme]);

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
  }, []);

  return (
    <div className="fixed inset-0 h-dvh overflow-hidden bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-dvh overflow-visible">
        {/* Desktop Collapsible Sidebar */}
        <AdminSidebar />

        {/* Main Application Area */}
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
          {/* Top Panel Header */}
          <header className="relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-xs transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900">
            {/* Header Left: Route breadcrumb and page title */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 rounded-xl px-2 py-1 text-slate-900 transition-all duration-200 dark:text-white">
                <div className="hidden sm:flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800/90 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
                    {routeInfo.category}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                </div>
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  {routeInfo.title}
                </h1>
              </div>
            </div>

            {/* Header Right: Store link, Notifications, Theme toggle, Profile menu */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Storefront preview shortcut */}
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white active:scale-[0.98]"
                title="Open customer storefront in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span>View Store</span>
              </Link>

              <div className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

              {/* Pickup Notifications Popover */}
              <div className="relative z-40" ref={notificationMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((value) => !value)}
                  className="relative flex h-9.5 w-9.5 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white active:scale-95"
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

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                className={`relative inline-flex h-8 w-14 items-center rounded-full border p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  theme === "dark"
                    ? "border-emerald-500/50 bg-emerald-500/15"
                    : "border-slate-200/90 bg-slate-100 hover:border-slate-300"
                }`}
              >
                <span
                  className={`flex h-6.5 w-6.5 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition-transform duration-200 ease-out dark:bg-slate-900 dark:text-amber-400 ${
                    theme === "dark" ? "translate-x-6" : "translate-x-0"
                  }`}
                >
                  {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                </span>
              </button>

              {/* Profile Icon */}
              <div className="relative">
                <button
                  type="button"
                  className="relative flex h-9.5 w-9.5 items-center justify-center rounded-full border border-transparent bg-transparent shadow-none transition-all duration-150 hover:border-transparent hover:bg-transparent hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
                  aria-label="Profile"
                  title="Profile"
                >
                  <div className="relative h-7.5 w-7.5 overflow-hidden rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 ring-1 ring-emerald-500/20">
                    <Image
                      src={avatarSrc}
                      alt="Admin profile"
                      fill
                      sizes="30px"
                      className="object-cover"
                    />
                  </div>

                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                </button>
              </div>
            </div>
          </header>

          {/* Main scrollable page content */}
          <main className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-100/70 p-6 text-slate-800 dark:bg-slate-950/40 dark:text-slate-100">
            <div key={pathname} className="admin-page-enter">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
