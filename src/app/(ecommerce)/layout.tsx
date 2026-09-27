"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearStoredUser, getCartCount, getStoredUser, saveStoredUser } from "@/features/cart/lib/cart";
import { AlertTriangle, Bell, LogOut, Menu, Search, ShoppingCart, User, X } from "lucide-react";

type EcommerceUser = {
  name?: string;
  email?: string | null;
  imageUrl?: string | null;
  role?: string;
};

type OrderStatusNotification = {
  id: string;
  orderNumber: string;
  status: string;
};

const orderStatusLabels: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function EcommerceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);
  const [user, setUser] = useState<EcommerceUser | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartToss, setCartToss] = useState(false);
  const [cartStockWarning, setCartStockWarning] = useState<string | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [orderNotifications, setOrderNotifications] = useState<OrderStatusNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"home" | "shop" | "categories" | "contact" | "orders">("home");

  useEffect(() => {
    async function loadCurrentUser() {
      const storedUser = getStoredUser() as EcommerceUser | null;
      setUser(storedUser);

      try {
        const response = await fetch("/api/auth/profile");
        const data = await response.json();

        if (!response.ok || !data?.user) {
          clearStoredUser();
          setUser(null);
          return;
        }

        if (data.user.role === "ADMIN") {
          clearStoredUser();
          setUser(null);
          return;
        }

        const nextUser = {
          ...(storedUser ?? {}),
          ...data.user,
        } as EcommerceUser;

        setUser(nextUser);
        saveStoredUser(nextUser);
      } catch {
        clearStoredUser();
        setUser(null);
      }
    }

    const updateCount = () => {
      setCartCount(getCartCount());
    };

    const refreshProfile = () => {
      void loadCurrentUser();
    };

    const triggerCartToss = () => {
      setCartToss(true);
      window.setTimeout(() => setCartToss(false), 700);
    };

    let stockWarningTimeout: number | undefined;
    const showStockWarning = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setCartStockWarning(message ?? "The requested quantity exceeds available stock.");
      if (stockWarningTimeout !== undefined) window.clearTimeout(stockWarningTimeout);
      stockWarningTimeout = window.setTimeout(() => setCartStockWarning(null), 4500);
    };

    updateCount();
    void loadCurrentUser();
    window.addEventListener("storage", updateCount);
    window.addEventListener("apc-user-updated", refreshProfile);
    window.addEventListener("apc-cart-toss", triggerCartToss);
    window.addEventListener("apc-cart-stock-warning", showStockWarning);
    return () => {
      window.removeEventListener("storage", updateCount);
      window.removeEventListener("apc-user-updated", refreshProfile);
      window.removeEventListener("apc-cart-toss", triggerCartToss);
      window.removeEventListener("apc-cart-stock-warning", showStockWarning);
      if (stockWarningTimeout !== undefined) window.clearTimeout(stockWarningTimeout);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const notificationsKey = "apc-customer-order-status-notifications";

    const readNotifications = (): OrderStatusNotification[] => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(notificationsKey) ?? "[]");
        return Array.isArray(stored) ? stored : [];
      } catch {
        return [];
      }
    };

    const saveNotifications = (next: OrderStatusNotification[]) => {
      window.localStorage.setItem(notificationsKey, JSON.stringify(next));
      setOrderNotifications(next);
      setNotificationCount(next.length);
    };

    const loadOrderStatuses = async () => {
      const storedNotifications = readNotifications();
      setOrderNotifications(storedNotifications);
      setNotificationCount(storedNotifications.length);

      try {
        const response = await fetch("/api/auth/orders", { cache: "no-store" });
        if (!response.ok) return;
        const orders = await response.json();
        if (!Array.isArray(orders)) return;

        const activeOrders = (orders as Array<{ id: string; orderNumber: string; status: string }>)
          .filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELLED")
          .map((order) => {
            return {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
            };
          });

        saveNotifications(activeOrders);
      } catch {
        // Keep the existing notifications when status polling is unavailable.
      }
    };

    void loadOrderStatuses();
    const intervalId = window.setInterval(() => void loadOrderStatuses(), 10000);

    return () => window.clearInterval(intervalId);
  }, [user]);

  function renderNotificationButton(isMobileDrawer = false) {
    return (
      <div className={isMobileDrawer ? "relative w-full" : "relative"}>
        <button
          type="button"
          aria-label="View order status notifications"
          aria-expanded={isNotificationsOpen}
          onClick={() => setIsNotificationsOpen((open) => !open)}
          className={`relative flex items-center rounded-xl border border-white/10 bg-transparent text-white shadow-xs transition-all duration-150 hover:border-white/20 hover:bg-transparent hover:text-amber-200 active:scale-95 ${
            isMobileDrawer ? "h-10 w-full justify-start gap-2 px-3" : "h-9.5 w-9.5 justify-center"
          }`}
        >
          <Bell className="h-4 w-4" />
          {isMobileDrawer && <span className="flex-1 text-left text-xs font-semibold">Order status updates</span>}
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-slate-950 shadow-md ring-2 ring-[#070b14] animate-in zoom-in-50">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        {isNotificationsOpen && (
          <div className={`absolute right-0 top-full z-50 mt-2.5 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-[#0b101c]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95 duration-150 origin-top-right ${isMobileDrawer ? "w-full" : "w-80 sm:w-88"}`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Bell className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-white">Order updates</span>
              </div>
              {orderNotifications.length > 0 && (
                <Link
                  href="/orders"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[#ffb36f] transition-colors hover:bg-white/5 hover:text-[#ff8a1e]"
                >
                  View orders
                </Link>
              )}
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pt-3 pr-0.5">
              {orderNotifications.length > 0 ? (
                orderNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="group rounded-xl border border-white/5 bg-white/3 p-3 text-xs text-slate-300 transition-all hover:border-white/15 hover:bg-white/6"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Order #{notification.orderNumber}
                      </span>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/20">
                        {orderStatusLabels[notification.status] ?? notification.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  <Bell className="mx-auto h-5 w-5 text-slate-600 mb-1.5" />
                  No order status updates yet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout API errors and continue with local sign-out.
    }

    clearStoredUser();
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    setIsNotificationsOpen(false);
    window.dispatchEvent(new Event("apc-user-updated"));
    router.push("/");
  }

  const links = [
    { href: "/", label: "Home", section: "home" },
    { href: "/#catalog", label: "Shop", section: "shop" },
    { href: "/#contact-us", label: "Contact Us", section: "contact" },
    { href: "/orders", label: "My Orders", section: "orders" },
  ] as const;

  function runSearch(query: string) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    router.push(`/?search=${encodeURIComponent(trimmedQuery)}#catalog`);
    setNavSearch("");
    setSearchOpen(false);
    setMobileMenuOpen(false);
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch(navSearch);
  }

  function handleSearchBlur(event: React.FocusEvent<HTMLFormElement>) {
    const nextFocusedElement = event.relatedTarget as Node | null;

    if (!nextFocusedElement || !event.currentTarget.contains(nextFocusedElement)) {
      setSearchOpen(false);
    }
  }

  function handleNavClick(href: string, section: (typeof links)[number]["section"]) {
    setActiveSection(section);
    router.push(href);
  }

  useEffect(() => {
    const updateActiveSection = () => {
      if (pathname === "/orders") {
        setActiveSection("orders");
        return;
      }

      if (pathname.startsWith("/products")) {
        setActiveSection("shop");
        return;
      }

      if (pathname !== "/") {
        setActiveSection("home");
        return;
      }

      switch (window.location.hash) {
        case "#catalog":
          setActiveSection("shop");
          break;
        case "#categories":
          setActiveSection("categories");
          break;
        case "#contact-us":
          setActiveSection("contact");
          break;
        default:
          setActiveSection("home");
      }
    };

    updateActiveSection();
    window.addEventListener("hashchange", updateActiveSection);
    return () => {
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/") {
      return;
    }

    const sectionIds = ["catalog", "contact-us"];
    const updateFromScroll = () => {
      if (window.scrollY < 120) {
        setActiveSection("home");
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0];

        if (visibleSection?.target.id === "catalog") {
          setActiveSection("shop");
        } else if (visibleSection?.target.id === "contact-us") {
          setActiveSection("contact");
        }
      },
      { rootMargin: "-18% 0px -58%", threshold: [0, 0.25, 0.6] },
    );

    sectionIds.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) observer.observe(section);
    });

    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateFromScroll);
    };
  }, [pathname]);

  return (
    <div className="storefront-shell min-h-screen bg-slate-50">
      <style>{`
        @keyframes cartToss {
          0% { transform: translateY(0) scale(1) rotate(0deg); }
          25% { transform: translateY(-4px) scale(1.05) rotate(-3deg); }
          50% { transform: translateY(0) scale(1.08) rotate(2deg); }
          75% { transform: translateY(-2px) scale(1.02) rotate(-1deg); }
          100% { transform: translateY(0) scale(1) rotate(0deg); }
        }
      `}</style>
      <header className="storefront-header sticky top-0 z-40 border-b border-white/8 bg-[#070b14]/85 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)] transition-colors duration-300">
        <div className="mx-auto w-full max-w-7xl px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            
            {/* Brand Logo & Title */}
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="group flex min-w-0 items-center gap-2 sm:gap-3 transition-transform duration-150 active:scale-[0.99]">
                <div className="relative flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-linear-to-br from-white/15 via-white/5 to-transparent p-1 shadow-md shadow-black/20 ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105">
                  <Image
                    src={process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png"}
                    alt="Apayao Pasalubong Center logo"
                    fill
                    sizes="(max-width: 640px) 36px, 44px"
                    className="object-contain p-1"
                    unoptimized
                  />
                </div>
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="line-clamp-2 text-xs sm:truncate sm:text-base font-extrabold tracking-tight text-white transition-colors group-hover:text-amber-200">
                    Apayao Pasalubong Center
                  </span>
                  <span className="block truncate text-[8px] font-semibold leading-tight tracking-wider text-slate-400 uppercase sm:text-[10.5px]">
                    OTOP Hub Philippines
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Center Pill Navigation */}
            <nav className="storefront-nav hidden items-center justify-center gap-1 rounded-full border border-white/8 bg-white/3 p-1 shadow-inner backdrop-blur-md lg:flex" aria-label="Main navigation">
              {links.map((link) => {
                const isActive = activeSection === link.section;

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={(event) => {
                      event.preventDefault();
                      handleNavClick(link.href, link.section);
                    }}
                    className={`relative inline-flex items-center px-4 py-1.5 text-xs font-bold tracking-wide transition-[color,background-color,transform] duration-200 rounded-full select-none hover:translate-x-1 ${
                      isActive
                        ? "text-white"
                        : "text-slate-300 hover:text-white hover:bg-white/6"
                    }`}
                  >
                    <span className="relative z-10">{link.label}</span>
                    {isActive ? (
                      <span className="absolute inset-0 rounded-full border border-amber-500/40 bg-linear-to-r from-orange-500/25 via-amber-500/20 to-orange-500/25 shadow-[0_0_15px_rgba(255,138,30,0.3)]" />
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop Right Action Controls */}
            <div className="hidden items-center gap-2.5 sm:gap-3 lg:flex">
              {/* Product Search */}
              {searchOpen ? (
                <form
                  onSubmit={handleSearchSubmit}
                  onBlur={handleSearchBlur}
                  className="relative flex w-56 items-center rounded-full border border-white/10 bg-white/5 pl-3 pr-1 py-1 text-xs text-white shadow-xs ring-0"
                >
                  <input
                    autoFocus
                    value={navSearch}
                    onChange={(event) => setNavSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setSearchOpen(false);
                      }
                    }}
                    type="search"
                    placeholder="Search products..."
                    className="w-full border-0 bg-transparent pr-1 text-xs font-medium text-white outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="submit"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-linear-to-r from-[#ff8a1e] to-orange-500 text-slate-950 shadow-xs transition-transform hover:scale-105 active:scale-95"
                    aria-label="Submit product search"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="flex h-9.5 w-9.5 items-center justify-center rounded-xl border border-white/10 bg-transparent text-white transition-all duration-150 hover:border-amber-400/40 hover:bg-transparent hover:text-amber-200 active:scale-95"
                  aria-label="Open product search"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}

              {/* Shopping Cart Button */}
              <Link
                href="/cart"
                aria-label="View cart"
                className={`relative flex h-9.5 w-9.5 items-center justify-center rounded-xl border border-white/10 bg-transparent text-white shadow-xs transition-all duration-150 hover:border-amber-400/40 hover:bg-transparent hover:text-amber-200 active:scale-95 ${
                  cartToss ? "animate-[cartToss_0.7s_ease-in-out]" : ""
                }`}
              >
                <ShoppingCart className="h-4 w-4" />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-linear-to-r from-orange-500 to-amber-500 px-1 text-[10px] font-black text-slate-950 shadow-md ring-2 ring-[#070b14] animate-in zoom-in-50">
                    {cartCount}
                  </span>
                )}
              </Link>

              {/* Pickup Notifications Popover */}
              {user ? renderNotificationButton() : null}

              {/* User Profile / Auth Controls */}
              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProfileMenuOpen((open) => !open)}
                    className="relative flex h-9.5 w-9.5 items-center justify-center rounded-full border border-white/10 bg-slate-800/90 p-0 text-white transition-transform duration-150 hover:scale-105 hover:bg-slate-700 active:scale-95"
                    aria-label="User profile menu"
                    aria-expanded={profileMenuOpen}
                  >
                    {user?.imageUrl ? (
                      <Image
                        src={user.imageUrl}
                        alt="Profile"
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#070b14]">
                      <span className="h-1 w-1 rounded-full bg-white" />
                    </span>
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 top-full mt-2.5 z-50 w-60 rounded-2xl border border-white/15 bg-[#0b101c]/95 p-2 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95 duration-150 origin-top-right">
                      <div className="px-3 py-2 border-b border-white/10">
                        <div className="text-xs font-bold text-white truncate">
                          {user.name || "Customer Account"}
                        </div>
                        {user.email && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {user.email}
                          </div>
                        )}
                        <div className="mt-1 inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                          Customer
                        </div>
                      </div>

                      <div className="mt-1 space-y-1">
                        <Link
                          href="/profile"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <User className="h-4 w-4 text-slate-400" />
                          <span>Profile & Settings</span>
                        </Link>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 bg-white/6 px-4 text-xs font-bold text-slate-200 backdrop-blur-sm transition-all duration-150 hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex h-9 items-center justify-center rounded-full bg-linear-to-r from-[#ff8a1e] to-orange-500 px-4 text-xs font-bold text-slate-950 shadow-[0_4px_16px_rgba(255,138,30,0.3)] transition-all duration-150 hover:shadow-[0_6px_22px_rgba(255,138,30,0.45)] hover:scale-[1.02] active:scale-95"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile View Controls */}
            <div className="relative ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:hidden">
              <Link
                href="/cart"
                aria-label="View cart"
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-transparent text-white shadow-xs transition-all duration-150 hover:bg-transparent active:scale-95 sm:h-9.5 sm:w-9.5 sm:rounded-xl ${
                  cartToss ? "animate-[cartToss_0.7s_ease-in-out]" : ""
                }`}
              >
                <ShoppingCart className="h-4 w-4" />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-linear-to-r from-orange-500 to-amber-500 px-1 text-[10px] font-black text-slate-950 shadow-md ring-2 ring-[#070b14]">
                    {cartCount}
                  </span>
                )}
              </Link>

              {user && <div className="hidden sm:block">{renderNotificationButton()}</div>}

              {user && (
                <Link
                  href="/profile"
                  aria-label="View your profile"
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-800 text-white transition hover:border-[#ff8a1e]/60 active:scale-95 sm:h-9 sm:w-9"
                >
                  {user.imageUrl ? (
                    <Image
                      src={user.imageUrl}
                      alt=""
                      width={36}
                      height={36}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </Link>
              )}

              {/* Mobile Menu Hamburger / Close Toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="storefront-mobile-menu"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-transparent text-white transition-all duration-150 hover:bg-transparent active:scale-95 sm:h-9.5 sm:w-9.5 sm:rounded-xl"
              >
                {mobileMenuOpen ? (
                  <X className="h-4.5 w-4.5 text-amber-400" />
                ) : (
                  <Menu className="h-4.5 w-4.5" />
                )}
              </button>
            </div>

          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div id="storefront-mobile-menu" className="relative z-50 mt-3 overflow-hidden rounded-3xl border border-white/15 bg-[#0b101c]/98 p-4 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] ring-1 ring-white/10 animate-in fade-in-0 slide-in-from-top-3 duration-200 lg:hidden">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-white/20 focus-within:bg-white/8">
                <input
                  value={navSearch}
                  onChange={(event) => setNavSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runSearch(navSearch);
                    }
                  }}
                  type="search"
                  placeholder="Search products..."
                  className="w-full border-0 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-r from-[#ff8a1e] to-orange-500 text-slate-950 font-bold shadow-xs active:scale-90 transition-transform"
                  aria-label="Search products"
                >
                  <Search className="h-4 w-4" />
                </button>
              </form>

              {user && <div className="mt-3 sm:hidden">{renderNotificationButton(true)}</div>}

              <nav aria-label="Mobile navigation" className="mt-3 space-y-1">
                {links.map((link) => {
                  const isActive = activeSection === link.section;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={(event) => {
                        event.preventDefault();
                        setMobileMenuOpen(false);
                        handleNavClick(link.href, link.section);
                      }}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all ${
                        isActive
                          ? "bg-linear-to-r from-orange-500/20 to-amber-500/10 text-[#ffb36f] border border-amber-500/30"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span>{link.label}</span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(255,138,30,0.8)]" />
                      )}
                    </Link>
                  );
                })}
              </nav>

              {user ? (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <Link
                    href="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-10 items-center justify-center rounded-xl bg-linear-to-r from-[#ff8a1e] to-orange-500 text-xs font-bold text-slate-950 shadow-md shadow-orange-500/20 transition-transform active:scale-95"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {children}
      {cartStockWarning && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed inset-x-4 bottom-4 z-100 mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-amber-400/30 bg-[#12141c] p-4 text-sm text-amber-100 shadow-xl sm:bottom-6"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="min-w-0 flex-1">{cartStockWarning}</p>
          <button
            type="button"
            onClick={() => setCartStockWarning(null)}
            aria-label="Dismiss stock warning"
            className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
