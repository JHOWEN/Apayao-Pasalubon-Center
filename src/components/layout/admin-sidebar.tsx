"use client";

import Image from "@/components/safe-image";
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
import { isSidebarLinkActive, normalizeSidebarPathname } from "@/utils/sidebar-nav";

const dashboardLink = { href: "/dashboard", label: "Dashboard", icon: LayoutGrid };
const fallbackAvatarSrc = process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png";
const logoSrc = fallbackAvatarSrc;

const sections = [
  {
    title: "Sales",
    links: [
      { href: "/pos", label: "POS Terminal", icon: ShoppingCart },
      { href: "/admin-orders", label: "Orders", icon: ReceiptText },
    ],
  },
  {
    title: "Catalog & Stock",
    links: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/categories", label: "Categories", icon: FolderOpen },
      { href: "/inventory", label: "Inventory", icon: Warehouse },
      { href: "/inventory/transactions", label: "Transactions", icon: ReceiptText },
    ],
  },
  {
    title: "Insights",
    links: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: ShoppingBag },
    ],
  },
  {
    title: "Management",
    links: [
      { href: "/customers", label: "Customer Accounts", icon: Users },
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
  const normalizedPathname = normalizeSidebarPathname(pathname);
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

    const handleLiveEvent = (event: Event) => {
      const message = (event as CustomEvent<{ type?: string }>).detail;
      if (message?.type === "order-created" || message?.type === "order-updated" || message?.type === "inventory-updated") {
        syncCount();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("apc-new-order", handleOrderCreated);
    window.addEventListener("apc-admin-notifications-updated", handleCustomNotificationUpdate);
    window.addEventListener("apc-admin-live-event", handleLiveEvent);

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
      window.removeEventListener("apc-admin-live-event", handleLiveEvent);
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
      data-admin-sidebar-collapsed={effectiveCollapsed}
      className={`relative min-w-0 shrink-0 border-r border-white/8 bg-[#14231f] text-slate-200 transition-[width] duration-200 ease-out ${
        isMobile
          ? "fixed inset-y-0 left-0 z-[60] flex h-dvh w-[min(19rem,88vw)] flex-col shadow-2xl shadow-slate-950/25 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-72 lg:shadow-none"
          : `hidden h-dvh flex-col lg:sticky lg:top-0 lg:flex ${
              effectiveCollapsed ? "lg:w-[4.5rem]" : "lg:w-72"
            }`
      }`}
    >
      <div className={`flex h-full min-h-0 flex-col py-2.5 ${effectiveCollapsed ? "px-2" : "px-3"}`}>
        {/* Brand */}
        <div
          className={`relative mb-2 flex min-h-11 items-center border-b border-white/10 pb-3 ${
            effectiveCollapsed ? "flex-col justify-center gap-2.5" : "gap-3"
          }`}
        >
          {!effectiveCollapsed ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-white/20">
                  <Image
                    src={logoSrc}
                    alt="APC logo"
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight text-white leading-tight">
                    Smart Inventory
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 leading-tight">
                    Apayao Pasalubong Center
                  </p>
                </div>
              </div>

              {isMobile ? (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close sidebar"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCollapsed((val) => !val)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-white/20"
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
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
          <div className="mb-1">
            <Link
              href={dashboardLink.href}
              onClick={handleLinkClick}
              title={effectiveCollapsed ? dashboardLink.label : undefined}
              aria-label={dashboardLink.label}
              aria-current={normalizedPathname === dashboardLink.href ? "page" : undefined}
              className={`group relative flex min-h-[2.125rem] items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors ${
                normalizedPathname === dashboardLink.href
                  ? "bg-white/10 font-semibold text-white ring-1 ring-inset ring-white/10"
                  : "text-slate-400 hover:bg-white/6 hover:text-slate-100"
              } ${effectiveCollapsed ? "justify-center px-1.5 py-1.5" : ""}`}
            >
              {normalizedPathname === dashboardLink.href && !effectiveCollapsed && (
                <span className="absolute -left-3 top-2 bottom-2 w-0.5 rounded-r-full bg-[#f08b32]" />
              )}
              <dashboardLink.icon
                className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                  normalizedPathname === dashboardLink.href
                    ? "text-[#f3a45f]"
                    : "text-slate-500 group-hover:text-slate-200"
                }`}
              />
              {!effectiveCollapsed && <span>{dashboardLink.label}</span>}
            </Link>
          </div>
        )}

        {/* Main Navigation Items */}
        <nav aria-label="Admin navigation" className="admin-sidebar-nav flex-1 min-h-0 space-y-2.5 overflow-y-auto pr-0.5">
          {visibleSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              {!effectiveCollapsed && (
                <p className="px-3 pb-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
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
                      title={link.label}
                      aria-label={link.label}
                      className={`group relative flex min-h-[2.125rem] items-center gap-3 rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        isActive
                          ? "bg-white/10 font-semibold text-white ring-1 ring-inset ring-white/10"
                          : "text-slate-400 hover:bg-white/6 hover:text-slate-100"
                      } ${effectiveCollapsed ? "justify-center px-1.5 py-1.5" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {isActive && !effectiveCollapsed && (
                        <span className="absolute -left-3 top-2 bottom-2 w-0.5 rounded-r-full bg-[#f08b32]" />
                      )}

                      <Icon
                        className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                          isActive
                            ? "text-[#f3a45f]"
                            : "text-slate-500 group-hover:text-slate-200"
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
                              : "ml-auto h-5 min-w-5 rounded-full bg-rose-500 px-1.5 text-[10px]"
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
          <div className="mt-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-emerald-100 ring-1 ring-white/10">
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
                  className="truncate text-xs font-medium text-slate-200"
                  title={adminEmail || "Admin account"}
                >
                  {adminEmail || "Admin account"}
                </div>
                <div className="mt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
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
              aria-label="Sign out"
              className="group mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5 transition-colors" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div className="mt-2 border-t border-white/10 pt-3">
            <div className="flex flex-col items-center gap-2">
              <div
                className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-emerald-100 ring-1 ring-white/10"
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
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
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
