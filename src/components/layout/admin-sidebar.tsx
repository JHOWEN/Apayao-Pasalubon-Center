"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { clearAdminNotificationCount, getAdminNotificationCount } from "@/lib/admin-notifications";
import { isSidebarLinkActive } from "@/utils/sidebar-nav";

const dashboardLink = { href: "/dashboard", label: "Dashboard", icon: LayoutGrid };
const fallbackAvatarSrc = process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png";
const logoSrc = fallbackAvatarSrc;

const sections = [
  {
    title: "Sales Channels",
    links: [
      { href: "/pos", label: "POS Terminal", icon: ShoppingCart },
      { href: "/admin-orders", label: "Orders", icon: ReceiptText },
    ],
  },
  {
    title: "Inventory",
    links: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/categories", label: "Categories", icon: FolderOpen },
      { href: "/inventory", label: "Inventory", icon: Warehouse },
      { href: "/inventory/transactions", label: "Transactions", icon: ReceiptText },
    ],
  },
  {
    title: "Customer",
    links: [{ href: "/customers", label: "Customer Accounts", icon: Users }],
  },
  {
    title: "System",
    links: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: ShoppingBag },
      { href: "/admin-settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AdminSidebar({
  isMobile = false,
  onCloseMobile,
}: {
  isMobile?: boolean;
  onCloseMobile?: () => void;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [notificationCount, setNotificationCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<"ADMIN" | "STAFF" | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState(fallbackAvatarSrc);

  const visibleSections =
    userRole === "ADMIN"
      ? sections
      : sections
          .map((section) => ({
            ...section,
            links: section.links.filter((link) =>
              ["/pos", "/products", "/admin-settings"].includes(link.href)
            ),
          }))
          .filter((section) => section.links.length > 0);

  useEffect(() => {
    async function loadUserRole() {
      try {
        const response = await fetch("/api/auth/profile");
        if (!response.ok) return;
        const data = await response.json();

        const nextAvatarSrc =
          typeof data?.user?.imageUrl === "string" && data.user.imageUrl.trim()
            ? data.user.imageUrl
            : fallbackAvatarSrc;

        setAvatarSrc(nextAvatarSrc);
        setAdminEmail(typeof data?.user?.email === "string" ? data.user.email : "");

        if (data?.user?.role === "ADMIN" || data?.user?.role === "STAFF") {
          setUserRole(data.user.role);
        }
      } catch {
        // Keep navigation hidden until the authenticated role is known.
      }
    }

    void loadUserRole();

    const syncCount = () => setNotificationCount(getAdminNotificationCount());
    syncCount();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "apc-admin-notifications") {
        syncCount();
      }
    };

    const handleOrderCreated = () => {
      syncCount();
    };

    const handleCustomNotificationUpdate = () => {
      syncCount();
    };

    const handleSseEvent = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as { type?: string };
        if (message?.type === "order-created" || message?.type === "order-updated" || message?.type === "inventory-updated") {
          syncCount();
        }
      } catch {
        // Ignore invalid SSE payloads.
      }
    };

    const eventSource = new EventSource("/api/admin/live");
    eventSource.addEventListener("order-created", handleSseEvent);
    eventSource.addEventListener("order-updated", handleSseEvent);
    eventSource.addEventListener("inventory-updated", handleSseEvent);

    window.addEventListener("storage", handleStorage);
    window.addEventListener("apc-new-order", handleOrderCreated);
    window.addEventListener("apc-admin-notifications-updated", handleCustomNotificationUpdate);

    if (pathname === "/admin-orders") {
      clearAdminNotificationCount();
      window.setTimeout(() => {
        setNotificationCount(0);
      }, 0);
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("apc-new-order", handleOrderCreated);
      window.removeEventListener("apc-admin-notifications-updated", handleCustomNotificationUpdate);
      eventSource.close();
    };
  }, [pathname]);

  const handleLinkClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  const effectiveCollapsed = !isMobile && isCollapsed;

  return (
    <aside
      className={`shrink-0 border-r border-slate-200/80 bg-white text-slate-800 transition-all duration-300 ease-in-out dark:border-slate-800/90 dark:bg-slate-950 dark:text-slate-100 ${
        isMobile
          ? "flex h-full w-72 flex-col"
          : `hidden lg:flex lg:h-dvh lg:sticky lg:top-0 lg:flex-col ${
              effectiveCollapsed ? "lg:w-18" : "lg:w-71"
            }`
      }`}
    >
      <div className="flex h-full min-h-0 flex-col px-3.5 py-3">
        {/* Brand Header - Main View Hero */}
        <div
          className={`relative mb-2.5 flex items-center pb-3 border-b border-slate-200/90 dark:border-slate-800/80 ${
            effectiveCollapsed ? "flex-col justify-center gap-2.5" : "gap-3"
          }`}
        >
          {!effectiveCollapsed ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200/90 dark:ring-slate-700/80 bg-linear-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 p-0.5">
                  <Image
                    src={logoSrc}
                    alt="APC logo"
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                    Smart Inventory
                  </h1>
                  <p className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400 leading-tight">
                    Apayao Pasalubong Center
                  </p>
                </div>
              </div>

              {isMobile ? (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-all duration-150 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 active:scale-95"
                  aria-label="Close sidebar"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCollapsed((val) => !val)}
                  className="inline-flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50/80 text-slate-400 shadow-2xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 active:scale-95"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              <div
                className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 bg-linear-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 p-0.5"
                title="Smart Inventory - Apayao Pasalubong Center"
              >
                <Image
                  src={logoSrc}
                  alt="APC logo"
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsCollapsed((val) => !val)}
                className="inline-flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50/80 text-slate-400 shadow-2xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 active:scale-95"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Dashboard Link (Admin Only) */}
        {userRole === "ADMIN" && (
          <div className="mb-1.5">
            <Link
              href={dashboardLink.href}
              onClick={handleLinkClick}
              title={effectiveCollapsed ? dashboardLink.label : undefined}
              className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                pathname === dashboardLink.href
                  ? "bg-emerald-500/10 font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 dark:bg-emerald-500/15 shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-100"
              } ${effectiveCollapsed ? "justify-center px-1.5 py-1.5" : ""}`}
            >
              {pathname === dashboardLink.href && !effectiveCollapsed && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emerald-600 dark:bg-emerald-400" />
              )}
              <dashboardLink.icon
                className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                  pathname === dashboardLink.href
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                }`}
              />
              {!effectiveCollapsed && <span>{dashboardLink.label}</span>}
            </Link>
          </div>
        )}

        {/* Main Navigation Items */}
        <nav className="flex-1 min-h-0 space-y-2.5 overflow-y-auto admin-modal-scrollbar pr-0.5">
          {visibleSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              {!effectiveCollapsed && (
                <p className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400/90 dark:text-slate-500/90">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.links.map((link) => {
                  const Icon = link.icon;
                  const isActive = isSidebarLinkActive(pathname, link.href);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={handleLinkClick}
                      title={effectiveCollapsed ? link.label : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-emerald-500/10 font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 dark:bg-emerald-500/15 shadow-2xs"
                          : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-100"
                      } ${effectiveCollapsed ? "justify-center px-1.5 py-1.5" : ""}`}
                    >
                      {isActive && !effectiveCollapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emerald-600 dark:bg-emerald-400" />
                      )}

                      <Icon
                        className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                          isActive
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                        }`}
                      />

                      {!effectiveCollapsed && (
                        <span className="truncate whitespace-nowrap">{link.label}</span>
                      )}

                      {/* Order Count Badge */}
                      {link.href === "/admin-orders" && notificationCount > 0 && (
                        <span
                          className={`inline-flex items-center justify-center font-bold text-white shadow-xs ${
                            effectiveCollapsed
                              ? "absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] ring-2 ring-white dark:ring-slate-950"
                              : "ml-auto h-4.5 min-w-4.5 rounded-full bg-rose-500 px-1.5 text-[10.5px]"
                          }`}
                        >
                          {notificationCount > 9 ? "9+" : notificationCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile & Footer Section */}
        {!effectiveCollapsed ? (
          <div className="mt-2 border-t border-slate-200/80 pt-2 dark:border-slate-800">
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 shadow-2xs dark:border-slate-800/80 dark:bg-slate-900/50">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300 shadow-2xs">
                <Image
                  src={avatarSrc}
                  alt="Admin profile"
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-xs font-semibold text-slate-900 dark:text-white"
                  title={adminEmail || "Admin account"}
                >
                  {adminEmail || "Admin account"}
                </div>
                <div className="mt-0.5">
                  <span className="inline-flex items-center rounded-md bg-emerald-100/80 px-1.5 py-0.2 text-[9.5px] font-bold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                    {userRole === "ADMIN"
                      ? "Administrator"
                      : userRole === "STAFF"
                      ? "Staff Member"
                      : "User"}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="group mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-white py-1.5 px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-all duration-150 hover:border-rose-200 hover:bg-rose-50/80 hover:text-rose-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 active:scale-[0.98]"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-rose-600 dark:text-slate-500 dark:group-hover:text-rose-400" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div className="mt-2 border-t border-slate-200/80 pt-2 dark:border-slate-800">
            <div className="flex flex-col items-center gap-2">
              <div
                className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300 shadow-2xs"
                title={`${adminEmail || "User"} (${userRole === "ADMIN" ? "Administrator" : "Staff"})`}
              >
                <Image
                  src={avatarSrc}
                  alt="Admin profile"
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-600 shadow-2xs transition-all duration-150 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-900/70 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 active:scale-95"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
