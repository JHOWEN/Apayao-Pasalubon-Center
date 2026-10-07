"use client";

import Image from "@/components/safe-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  RotateCcw,
  ShoppingBag,
  Star,
} from "lucide-react";
import { getCartItems, getStoredUser, saveCartItems } from "@/features/cart/lib/cart";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";
import { fetchWithTimeout, getResponseErrorMessage, getUserFacingErrorMessage } from "@/lib/client-fetch";
import { getEffectivePaymentStatus } from "@/lib/order";
import {
  compressUploadImage,
  PAYMENT_PROOF_IMAGE_COMPRESSION,
} from "@/utils/compress-upload-image";

const fallbackProductImage = "/logo/apc-logo.png";

type OrderItemSummary = {
  id?: string;
  productId?: string;
  variantId?: string | null;
  quantity?: number;
  price?: number;
  subtotal?: number;
  isReviewed?: boolean;
  productNameSnapshot?: string;
  productSkuSnapshot?: string;
  variantSkuSnapshot?: string | null;
  variantAttributesSnapshot?: string | null;
  product?: {
    imageUrl?: string | null;
    name?: string;
  };
  variant?: {
    sku?: string;
    attributes?: string | Record<string, string> | null;
    color?: string | null;
    measurementValue?: number | null;
    measurementUnit?: string | null;
  } | null;
};

type OrderSummary = {
  id: string;
  status: string;
  orderNumber: string;
  createdAt: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  paymentMethod: string;
  paymentStatus?: string;
  proofOfPaymentUrl?: string | null;
  reservationExpiresAt?: string | null;
  totalAmount: number | string;
  items: OrderItemSummary[];
};

const formatDisplayDate = (value?: string | null) => {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatPickupTimeLabel = (timeValue?: string | null) => {
  if (!timeValue) return "";

  const [hourString, minuteString] = timeValue.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString ?? 0);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return timeValue;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const isPickupDateAheadOfOrderDate = (pickupDateValue?: string | null, createdAtValue?: string) => {
  if (!pickupDateValue || !createdAtValue) {
    return false;
  }

  const pickupDate = new Date(pickupDateValue);
  const orderDate = new Date(createdAtValue);

  if (Number.isNaN(pickupDate.getTime()) || Number.isNaN(orderDate.getTime())) {
    return false;
  }

  const pickupDay = new Date(Date.UTC(
    pickupDate.getUTCFullYear(),
    pickupDate.getUTCMonth(),
    pickupDate.getUTCDate(),
  )).getTime();

  const orderDay = new Date(Date.UTC(
    orderDate.getUTCFullYear(),
    orderDate.getUTCMonth(),
    orderDate.getUTCDate(),
  )).getTime();

  return pickupDay > orderDay;
};

function getVariantLabel(variant: {
  sku?: string;
  attributes?: string | Record<string, string> | null;
  color?: string | null;
  measurementValue?: number | null;
  measurementUnit?: string | null;
} | undefined | null) {
  if (!variant) return "";
  const attributeValues = typeof variant.attributes === "string"
    ? (() => {
        try {
          const parsed = JSON.parse(variant.attributes);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.values(parsed).filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
            : [];
        } catch {
          return [];
        }
      })()
    : variant.attributes && typeof variant.attributes === "object"
    ? Object.values(variant.attributes).filter((value): value is string => Boolean(value))
    : [];
  const details = attributeValues.length ? attributeValues : [
    variant.color,
    variant.measurementValue ? `${variant.measurementValue}${variant.measurementUnit ?? ""}` : null,
  ].filter(Boolean);
  return details.length ? `${details.join(" • ")} (${variant.sku ?? "SKU"})` : variant.sku ?? "Variant";
}

function getOrderItemVariantLabel(item: OrderItemSummary | undefined) {
  if (!item) return "";
  return getVariantLabel({
    ...item.variant,
    sku: item.variantSkuSnapshot ?? item.variant?.sku,
    attributes: item.variantAttributesSnapshot ?? item.variant?.attributes,
  });
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [uploadingProofOrderId, setUploadingProofOrderId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  async function fetchOrders() {
    try {
      setIsLoading(true);
      const currentUser = getStoredUser() as { id?: string } | null;

      if (!currentUser?.id) {
        setOrders([]);
        setMessage("");
        return;
      }

      const response = await fetchWithTimeout(`/api/auth/orders`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getResponseErrorMessage(data, response.status, "We couldn't load your orders. Please try again."));
      }

      const userOrders = Array.isArray(data) ? (data as OrderSummary[]) : [];
      setOrders(userOrders);
      setMessage("");
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
      setMessage(getUserFacingErrorMessage(error, "We couldn't load your orders. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    setMessage("");
    try {
      const response = await fetchWithTimeout("/api/auth/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: "CANCELLED" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(getResponseErrorMessage(data, response.status, "We couldn't cancel that order. Please try again."));
        return;
      }

      setMessage("✓ Order cancelled successfully.");
      await fetchOrders();
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, "We couldn't cancel that order. Please try again."));
    }
  }

  async function handleMarkAsReceived(orderId: string) {
    setMessage("");
    try {
      const response = await fetchWithTimeout("/api/auth/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: "COMPLETED" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(getResponseErrorMessage(data, response.status, "We couldn't update that order yet. Please try again."));
        return;
      }

      setMessage("✓ Order marked as received.");
      await fetchOrders();
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, "We couldn't update that order yet. Please try again."));
    }
  }

  async function handleProofUpload(orderId: string, file: File | undefined) {
    if (!file) return;
    setMessage("");
    setUploadingProofOrderId(orderId);

    const formData = new FormData();
    formData.append("file", await compressUploadImage(file, PAYMENT_PROOF_IMAGE_COMPRESSION));
    formData.append("orderId", orderId);

    try {
      const response = await fetchWithTimeout("/api/auth/payment-proof", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setMessage(getResponseErrorMessage(data, response.status, "We couldn't upload that receipt. Please try again."));
        return;
      }

      setMessage("Receipt submitted for payment review.");
      await fetchOrders();
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, "We couldn't upload that receipt. Please try again."));
    } finally {
      setUploadingProofOrderId(null);
    }
  }

  function handleBuyAgain(order: OrderSummary) {
    const repeatItems = order.items.filter((item) => item.productId).map((item) => {
      const variantLabel = getOrderItemVariantLabel(item);

      return {
        productId: item.productId as string,
        name: item.productNameSnapshot || item.product?.name || "Product",
        price: Number(item.price ?? item.subtotal ?? 0),
        imageUrl: getPrimaryImageUrl(item.product?.imageUrl) ?? fallbackProductImage,
        stock: 9999,
        quantity: Math.max(1, Number(item.quantity ?? 1)),
        variantId: item.variantId ?? undefined,
        variantSku: item.variantSkuSnapshot ?? item.variant?.sku,
        variantLabel: variantLabel || undefined,
      };
    });

    if (!repeatItems.length) {
      return;
    }

    const nextCart = getCartItems();
    repeatItems.forEach((repeatItem) => {
      const existing = nextCart.find(
        (item) => item.productId === repeatItem.productId && item.variantId === repeatItem.variantId,
      );

      if (existing) {
        existing.quantity += repeatItem.quantity;
        existing.price = repeatItem.price;
        existing.imageUrl = repeatItem.imageUrl;
        existing.stock = repeatItem.stock;
        existing.variantSku = repeatItem.variantSku;
        existing.variantLabel = repeatItem.variantLabel;
      } else {
        nextCart.push(repeatItem);
      }
    });

    saveCartItems(nextCart);
    window.dispatchEvent(new Event("storage"));
    router.push("/cart");
  }

  useEffect(() => {
    async function loadOrders() {
      await fetchOrders();
    }

    void loadOrders();

    const handleReviewUpdate = () => {
      void fetchOrders();
    };

    window.addEventListener("apc-order-review-updated", handleReviewUpdate);

    return () => {
      window.removeEventListener("apc-order-review-updated", handleReviewUpdate);
    };
  }, []);

  const orderStatusSteps = [
    { key: "PENDING", label: "Pending" },
    { key: "CONFIRMED", label: "Confirmed" },
    { key: "PREPARING", label: "Preparing" },
    { key: "READY_FOR_PICKUP", label: "Ready for Pickup" },
    { key: "COMPLETED", label: "Completed" },
    { key: "CANCELLED", label: "Cancelled" },
  ];
  const trackingStatusSteps = orderStatusSteps.filter((step) => step.key !== "CANCELLED");

  const statusTabs = ["ALL", ...orderStatusSteps.map((step) => step.key)];

  const sortedOrders = [...orders].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const filteredOrders =
    selectedStatus === "ALL"
      ? sortedOrders
      : sortedOrders.filter((order) => order.status === selectedStatus);

  const statusColors: Record<string, { badge: string; text: string }> = {
    PENDING: { badge: "border-amber-400/30 bg-amber-500/10 text-amber-300", text: "text-amber-400" },
    CONFIRMED: { badge: "border-blue-400/30 bg-blue-500/10 text-blue-300", text: "text-blue-400" },
    PREPARING: { badge: "border-purple-400/30 bg-purple-500/10 text-purple-300", text: "text-purple-400" },
    READY_FOR_PICKUP: { badge: "border-[#ff8a1e]/40 bg-[#ff8a1e]/15 text-[#ffb36f]", text: "text-[#ff8a1e]" },
    COMPLETED: { badge: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300", text: "text-emerald-400" },
    CANCELLED: { badge: "border-rose-400/30 bg-rose-500/10 text-rose-300", text: "text-rose-400" },
  };

  return (
    <main className="storefront-page-orders min-h-screen bg-[#0a0d14] text-slate-100 pb-16">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <span>← Back to Store Catalog</span>
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>{orders.length} total orders</span>
          </div>
        </div>

        {/* Page Header */}
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
              Customer Account
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Order History & Tracking
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Track store pickup reservations and review previous purchases.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-white/10 bg-[#12141c] px-3 py-1.5 text-xs font-semibold text-slate-300">
              {orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length} active reservations
            </span>
          </div>
        </div>

        {/* Status Message Alert */}
        {message && (
          <div
            className={`rounded-2xl border p-4 text-xs font-semibold ${
              message.includes("successfully")
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                : "border-rose-400/30 bg-rose-500/15 text-rose-200"
            }`}
          >
            {message}
          </div>
        )}

        {/* Status Filter Tabs (Horizontal Scroll on Mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-white/10">
          {statusTabs.map((status) => {
            const active = selectedStatus === status;
            const normalizedStatus = status;
            const statusLabel =
              status === "ALL"
                ? "All Orders"
                : orderStatusSteps.find((step) => step.key === normalizedStatus)?.label ?? normalizedStatus;

            return (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(status)}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-[#ff8a1e] text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {statusLabel}
              </button>
            );
          })}
        </div>

        {/* Orders List / Loading / Empty */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-3xl border border-white/10 bg-[#12141c] p-6 animate-pulse space-y-4">
                <div className="h-5 w-40 rounded bg-white/10" />
                <div className="h-20 w-full rounded-2xl bg-[#181b24]" />
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#12141c] px-6 py-20 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400">
              <ShoppingBag className="h-8 w-8 text-[#ff8a1e]" />
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">No orders found</h2>
            <p className="mx-auto mt-2 max-w-sm text-xs sm:text-sm text-slate-400 leading-relaxed">
              {selectedStatus === "ALL"
                ? "You haven't placed any orders yet. Browse our local collection and reserve items for pickup!"
                : `You don't have any orders with status "${selectedStatus}".`}
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#ff8a1e] px-6 text-xs sm:text-sm font-bold text-slate-950 transition hover:bg-[#f97316]"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const normalizedStatus = order.status;
              const colors = statusColors[normalizedStatus] || statusColors.PENDING;
              const paymentStatusLabel = getEffectivePaymentStatus({
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
                status: order.status,
              });
              const isPickupDateAhead = isPickupDateAheadOfOrderDate(order.pickupDate, order.createdAt);
              const isTrackingOpen = trackingOrderId === order.id;

              return (
                <article
                  key={order.id}
                  className="rounded-3xl border border-white/10 bg-[#12141c] p-5 sm:p-6 space-y-5 transition hover:border-white/20 shadow-lg"
                >
                  {/* Order Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400">Order</span>
                      <span className="font-mono text-base font-extrabold text-white">
                        {order.orderNumber}
                      </span>
                      <span
                        data-order-status={normalizedStatus}
                        className={`storefront-order-status rounded-full border px-3 py-1 text-[11px] font-bold ${colors.badge}`}
                      >
                        {orderStatusSteps.find((s) => s.key === normalizedStatus)?.label ?? normalizedStatus}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400">
                      Placed on: <span className="font-semibold text-white">{formatDisplayDate(order.createdAt)}</span>
                    </div>
                  </div>

                  {/* Order Content (2-Column Desktop Grid) */}
                  <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-center">
                    
                    {/* Items Preview */}
                    <div className="flex items-center gap-4">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#181b24] border border-white/5">
                        <Image
                          src={getPrimaryImageUrl(order.items[0]?.product?.imageUrl) || fallbackProductImage}
                          alt={order.items[0]?.productNameSnapshot || order.items[0]?.product?.name || "Product item"}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-bold text-white text-sm sm:text-base truncate">
                          {order.items[0]?.productNameSnapshot || order.items[0]?.product?.name || "Reserved Product"}
                        </div>

                        {getOrderItemVariantLabel(order.items[0]) && (
                          <div className="text-xs text-slate-400">
                            {getOrderItemVariantLabel(order.items[0])}
                          </div>
                        )}
                        {order.items[0]?.productSkuSnapshot ? (
                          <div className="text-[11px] text-slate-500">
                            SKU: {order.items[0].productSkuSnapshot}
                          </div>
                        ) : null}

                        <div className="text-xs text-slate-400">
                          Qty: {order.items.reduce((sum, it) => sum + Number(it.quantity ?? 1), 0)} items
                          {order.items.length > 1 && (
                            <span className="ml-1.5 text-[11px] text-[#ffb36f]">
                              (+{order.items.length - 1} other item{order.items.length - 1 > 1 ? "s" : ""})
                            </span>
                          )}
                        </div>

                        {/* Leave a review button if order is COMPLETED */}
                        {order.status === "COMPLETED" && order.items[0]?.productId && !order.items[0].isReviewed && (
                          <div className="pt-1">
                            <Link
                              href={`/products/${order.items[0].productId}#write-review`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                            >
                              <Star className="h-3 w-3 fill-amber-400" />
                              <span>Leave a Review</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Order Metadata Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5 text-xs">
                      <div className="rounded-2xl border border-white/5 bg-[#181b24] p-3 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pickup Date</span>
                        <div className="font-semibold text-white truncate">
                          {order.pickupDate ? formatDisplayDate(order.pickupDate) : "Not scheduled"}
                        </div>
                        {order.pickupDate && order.pickupTime && (
                          <div className="space-y-0.5">
                            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Time</div>
                            <div className="text-[10px] font-medium text-[#ffb36f]">{formatPickupTimeLabel(order.pickupTime)}</div>
                          </div>
                        )}
                        {order.pickupDate && !isPickupDateAhead && (
                          <span className="inline-block text-[10px] text-amber-300 font-medium">Past date</span>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-[#181b24] p-3 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment</span>
                        <div className="font-semibold text-white truncate">
                          {order.paymentMethod === "CASH"
                            ? "Cash on Pickup"
                            : order.paymentMethod === "GCASH"
                            ? "GCash"
                            : order.paymentMethod === "PAYMAYA"
                            ? "Maya"
                            : order.paymentMethod}
                        </div>
                        {order.paymentStatus && (
                          <span className="inline-block text-[10px] text-[#ffb36f] font-bold uppercase">
                            {paymentStatusLabel === "PROOF_SUBMITTED" ? "AWAITING REVIEW" : paymentStatusLabel}
                          </span>
                        )}
                      </div>

                      <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/5 bg-[#181b24] p-3 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</span>
                        <div className="text-base font-extrabold text-[#ff8a1e]">
                          ₱{Number(order.totalAmount).toFixed(2)}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/5">
                    {order.status === "PENDING" && order.paymentMethod !== "CASH" && (
                      <div className="w-full rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-100">
                        {order.proofOfPaymentUrl
                          ? "Receipt submitted. Your reservation remains held during admin review."
                          : `Upload your wallet receipt before ${order.reservationExpiresAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.reservationExpiresAt)) : "the reservation expires"}. If you already paid but the upload fails, contact the store and provide order ${order.orderNumber}.`}
                        {!order.proofOfPaymentUrl && (
                          <label className="mt-2 inline-flex cursor-pointer items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 font-semibold text-amber-100 transition hover:bg-amber-400/20">
                            {uploadingProofOrderId === order.id ? "Uploading receipt..." : "Upload receipt"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={uploadingProofOrderId === order.id}
                              onChange={(event) => {
                                void handleProofUpload(order.id, event.target.files?.[0]);
                                event.target.value = "";
                              }}
                              className="sr-only"
                            />
                          </label>
                        )}
                        {uploadingProofOrderId === order.id && (
                          <div className="mt-2" role="status" aria-live="polite">
                            <div className="h-1.5 overflow-hidden rounded-full bg-amber-950/50">
                              <div className="receipt-upload-progress h-full w-1/3 rounded-full bg-amber-300" />
                            </div>
                            <p className="mt-1.5 text-[11px] text-amber-100/80">Uploading securely. Keep this page open.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {order.status === "READY_FOR_PICKUP" && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsReceived(order.id)}
                        className="rounded-xl bg-[#ff8a1e] px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
                      >
                        Mark as Received
                      </button>
                    )}

                    {order.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.id)}
                        className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                      >
                        Cancel Reservation
                      </button>
                    )}

                    {order.status !== "CANCELLED" && (
                      <button
                        type="button"
                        onClick={() => setTrackingOrderId(isTrackingOpen ? null : order.id)}
                        className="rounded-xl border border-white/10 bg-[#181b24] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                      >
                        {isTrackingOpen ? "Hide Tracking" : "Track Order"}
                      </button>
                    )}

                    {order.status === "COMPLETED" && (
                      <button
                        type="button"
                        onClick={() => handleBuyAgain(order)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181b24] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Buy Again</span>
                      </button>
                    )}
                  </div>

                  {/* Tracking Timeline Stepper (When Toggled) */}
                  {isTrackingOpen && (
                    <div className="rounded-2xl border border-white/10 bg-[#181b24] p-5 sm:p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-white">Order Progress</h4>
                          <p className="text-xs text-slate-400">Track the status of your reservation from confirmation to pickup.</p>
                        </div>
                        <span
                          data-order-status={order.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS"}
                          className="storefront-tracking-summary rounded-md border px-2.5 py-1 text-[11px] font-bold"
                        >
                          {order.status === "COMPLETED" ? "Completed" : "In Progress"}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>Progress</span>
                          <span>
                            {Math.round(
                              (((trackingStatusSteps.findIndex((item) => item.key === order.status) + 1) /
                                trackingStatusSteps.length) *
                                100) || 0,
                            )}
                            %
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#ff8a1e] transition-all duration-500"
                            style={{
                              width: `${
                                (((trackingStatusSteps.findIndex((item) => item.key === order.status) + 1) /
                                  trackingStatusSteps.length) *
                                  100) || 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Steps List */}
                      <div className="grid gap-3 sm:grid-cols-5 pt-2">
                        {trackingStatusSteps.map((step, stepIndex) => {
                          const currentStepIndex = trackingStatusSteps.findIndex((item) => item.key === order.status);
                          const isCompleted = currentStepIndex >= stepIndex;
                          const isCurrent = currentStepIndex === stepIndex;

                          return (
                            <div
                              key={step.key}
                              className={`flex flex-col items-center text-center p-3 rounded-xl border transition ${
                                isCurrent
                                  ? "border-[#ff8a1e] bg-[#ff8a1e]/10"
                                  : isCompleted
                                  ? "border-emerald-400/30 bg-emerald-500/5 text-emerald-200"
                                  : "storefront-order-step-upcoming border-white/5 bg-[#12141c] text-slate-500"
                              }`}
                            >
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold mb-2 ${
                                  isCompleted
                                    ? "bg-[#ff8a1e] text-slate-950 shadow-sm"
                                    : "bg-white/10 text-slate-400"
                                }`}
                              >
                                {isCompleted ? "✓" : stepIndex + 1}
                              </div>
                              <div className="text-xs font-bold text-white">{step.label}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {stepIndex === 0
                                  ? formatDisplayDate(order.createdAt)
                                  : isCurrent
                                  ? "Current step"
                                  : isCompleted
                                  ? "Done"
                                  : "Upcoming"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}
