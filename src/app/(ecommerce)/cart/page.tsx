"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
} from "lucide-react";
import {
  getCartItems,
  getStoredUser,
  removeFromCart,
  saveStoredUser,
  updateCartQuantity,
  type CartItem,
} from "@/features/cart/lib/cart";
import { prefetchCheckoutData } from "@/features/cart/lib/checkout-data";

type CartUser = {
  name?: string;
  phone?: string;
  address?: string;
};

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [user, setUser] = useState<CartUser | null>(null);
  const [incompleteFields, setIncompleteFields] = useState<string[]>([]);

  async function refreshItems() {
    const nextItems = getCartItems();
    const savedUser = getStoredUser() as CartUser | null;

    setItems(nextItems);
    setUser(savedUser);

    try {
      const response = await fetch("/api/auth/profile");
      const data = await response.json();

      if (response.ok && data?.user) {
        const serverUser = data.user as CartUser;
        saveStoredUser(serverUser);
        setUser(serverUser);

        const missing: string[] = [];
        if (!serverUser.name || serverUser.name.trim() === "") missing.push("Full Name");
        if (!serverUser.phone || serverUser.phone.trim() === "") missing.push("Phone Number");
        if (!serverUser.address || serverUser.address.trim() === "") missing.push("Address");
        setIncompleteFields(missing);
        return;
      }
    } catch {
      // Fall back to the locally stored profile if the server is unavailable.
    }

    if (savedUser) {
      const missing: string[] = [];
      if (!savedUser.name || savedUser.name.trim() === "") missing.push("Full Name");
      if (!savedUser.phone || savedUser.phone.trim() === "") missing.push("Phone Number");
      if (!savedUser.address || savedUser.address.trim() === "") missing.push("Address");
      setIncompleteFields(missing);
    } else {
      setIncompleteFields([]);
    }
  }

  useEffect(() => {
    let active = true;

    const loadCartState = async () => {
      if (!active) return;
      await refreshItems();
    };

    void loadCartState();

    const handle = () => {
      void loadCartState();
    };
    window.addEventListener("storage", handle);
    window.addEventListener("apc-user-updated", handle);
    return () => {
      active = false;
      window.removeEventListener("storage", handle);
      window.removeEventListener("apc-user-updated", handle);
    };
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main className="min-h-screen bg-[#0a0d14] text-slate-100 pb-16">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Continue Shopping</span>
          </Link>
          <span className="text-xs font-semibold text-slate-400">
            {totalItems} item{totalItems === 1 ? "" : "s"} in cart
          </span>
        </div>

        {/* Page Header */}
        <div className="border-b border-white/10 pb-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
            Your Reservation
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Shopping Cart
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Review your selected local products before setting your pickup date.
          </p>
        </div>

        {items.length === 0 ? (
          /* Empty Cart State */
          <div className="rounded-3xl border border-white/10 bg-[#12141c] px-6 py-20 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400">
              <ShoppingBag className="h-8 w-8 text-[#ff8a1e]" />
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">Your cart is empty</h2>
            <p className="mx-auto mt-2 max-w-sm text-xs sm:text-sm text-slate-400 leading-relaxed">
              Explore authentic local treats, handicrafts, and souvenirs from Apayao to add to your order.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#ff8a1e] px-6 text-xs sm:text-sm font-bold text-slate-950 transition hover:bg-[#f97316] hover:shadow-[0_8px_24px_rgba(255,138,30,0.3)]"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          /* Active Cart 2-Column Layout */
          <div className="grid gap-8 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] items-start">
            
            {/* Left: Cart Items List */}
            <div className="space-y-4">
              {items.map((item) => (
                <article
                  key={`${item.productId}-${item.variantId ?? "base"}`}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-white/10 bg-[#12141c] p-4 sm:p-5 transition hover:border-white/20"
                >
                  {/* Thumbnail */}
                  <div className="relative h-22 w-22 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-xl bg-[#181b24] border border-white/5">
                    <Image
                      src={item.imageUrl || "/logo/apc-logo.png"}
                      alt={item.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug">
                        {item.name}
                      </h2>
                      <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        In stock
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-300">
                      ₱{item.price.toFixed(2)} each
                    </div>

                    {item.variantLabel && (
                      <div className="text-[11px] font-medium text-[#ffb36f]">
                        Option: {item.variantLabel}
                      </div>
                    )}

                    {item.variantSku && (
                      <div className="text-[10px] font-mono text-slate-400">
                        SKU: {item.variantSku}
                      </div>
                    )}

                    {item.variantAttributes && Object.keys(item.variantAttributes).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(item.variantAttributes).map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded-md border border-white/10 bg-[#181b24] px-2 py-0.5 text-[10px] text-slate-300"
                          >
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs font-bold text-white pt-1">
                      Subtotal: <span className="text-[#ff8a1e]">₱{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Quantity Stepper & Remove Button */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                    <div className="flex items-center rounded-xl border border-white/10 bg-[#181b24]">
                      <button
                        type="button"
                        onClick={() => {
                          updateCartQuantity(item.productId, item.quantity - 1, item.variantId);
                          window.dispatchEvent(new Event("storage"));
                        }}
                        className="flex h-8 w-8 items-center justify-center text-slate-300 transition hover:text-white"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-8 text-center text-xs font-bold text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          updateCartQuantity(item.productId, item.quantity + 1, item.variantId);
                          window.dispatchEvent(new Event("storage"));
                        }}
                        disabled={Number(item.quantity ?? 0) >= Number(item.stock ?? 9999)}
                        className="flex h-8 w-8 items-center justify-center text-slate-300 transition hover:text-white disabled:opacity-30"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        removeFromCart(item.productId, item.variantId);
                        window.dispatchEvent(new Event("storage"));
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition p-1"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sm:hidden">Remove</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {/* Right: Sticky Order Summary Sidebar */}
            <aside className="sticky top-24 rounded-3xl border border-white/10 bg-[#12141c] p-5 sm:p-6 space-y-5 shadow-xl">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
                Order Summary
              </div>

              <div className="space-y-3 border-b border-white/10 pb-5 text-sm">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Total Items</span>
                  <span className="font-semibold text-white">{totalItems}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Subtotal</span>
                  <span className="font-semibold text-white">₱{subtotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Total Card */}
              <div className="rounded-2xl border border-white/5 bg-[#181b24] p-4 text-center">
                <span className="text-xs font-semibold text-slate-400">Estimated Total</span>
                <div className="mt-1 text-3xl font-black tracking-tight text-white">
                  ₱{subtotal.toFixed(2)}
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <Store className="h-3.5 w-3.5 text-[#ff8a1e]" />
                  <span>Pickup at Apayao Pasalubong Center</span>
                </div>
              </div>

              {/* Incomplete Profile Alert */}
              {user && incompleteFields.length > 0 && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>Complete Your Profile</span>
                  </div>
                  <p className="text-[11px] text-amber-100/80 leading-relaxed">
                    Missing: <span className="font-semibold">{incompleteFields.join(", ")}</span>. Update your details for faster checkout.
                  </p>
                  <Link
                    href="/profile"
                    className="inline-block text-xs font-bold text-amber-300 hover:underline"
                  >
                    Edit Profile Details →
                  </Link>
                </div>
              )}

              {/* Checkout CTA Button */}
              <div className="space-y-2.5">
                <Link
                  href={user ? "/checkout" : "/register"}
                  onPointerEnter={user ? prefetchCheckoutData : undefined}
                  onFocus={user ? prefetchCheckoutData : undefined}
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-[#ff8a1e] px-6 text-sm font-bold text-slate-950 transition hover:bg-[#f97316] hover:shadow-[0_8px_24px_rgba(255,138,30,0.35)]"
                >
                  {user ? "Proceed to Checkout" : "Register to Order"}
                </Link>

                <Link
                  href="/"
                  className="flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  Add More Products
                </Link>
              </div>
            </aside>
          </div>
        )}

      </div>
    </main>
  );
}
