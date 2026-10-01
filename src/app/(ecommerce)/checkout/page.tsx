"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearCart, getCartItems, getStoredUser, saveRecentOrder, saveStoredUser } from "@/features/cart/lib/cart";
import { fetchWithTimeout, getResponseErrorMessage, getUserFacingErrorMessage } from "@/lib/client-fetch";
import { isPickupDateOnOrAfterToday, ONLINE_PAYMENT_RESERVATION_TTL_MS } from "@/lib/order";

type CheckoutUser = {
  id?: string;
  name?: string;
  phone?: string | null;
  address?: string | null;
  role?: string;
  emailVerified?: boolean;
  isBlocked?: boolean;
};

type CheckoutItem = {
  productId: string;
  variantId?: string;
  name: string;
  imageUrl?: string | null;
  variantSku?: string;
  variantLabel?: string;
  price: number;
  quantity: number;
  stock?: number;
};

type PaymentSettings = {
  gcashAccountName?: string | null;
  gcashAccountNumber?: string | null;
  gcashQrCodeUrl?: string | null;
  mayaAccountName?: string | null;
  mayaAccountNumber?: string | null;
  mayaQrCodeUrl?: string | null;
};

type ActiveReservation = {
  id: string;
  orderNumber: string;
  expiresAt: string;
};

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [user, setUser] = useState<CheckoutUser | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    pickupDate: "",
    pickupTime: "",
    paymentMethod: "CASH" as "CASH" | "GCASH" | "PAYMAYA",
  });
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const orderIdempotencyKeyRef = useRef<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofOfPaymentUrl, setProofOfPaymentUrl] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [activeReservation, setActiveReservation] = useState<ActiveReservation | null>(null);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [proofUploadState, setProofUploadState] = useState<{
    type: "idle" | "success" | "error" | "uploading";
    message: string;
  }>({ type: "idle", message: "" });
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({});
  const [incompleteFields, setIncompleteFields] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadCheckoutUser() {
      setItems(getCartItems());

      try {
        const settingsResponse = await fetchWithTimeout("/api/public/settings");
        const settingsData = await settingsResponse.json();
        if (settingsResponse.ok) setPaymentSettings(settingsData?.settings ?? {});
      } catch {
        // Wallet details are optional until configured by an admin.
      }

      try {
        const response = await fetchWithTimeout("/api/auth/profile");
        const data = await response.json();

        if (response.ok && data?.user) {
          const serverUser = data.user;
          if (!isMounted) return;

          saveStoredUser(serverUser);
          setUser(serverUser);
          setForm((current) => ({ ...current, name: serverUser.name ?? "", phone: serverUser.phone ?? "" }));

          if (serverUser.isBlocked) {
            setStatus("Your account has been blocked. Please contact the admin before placing an order.");
          }

          const missing: string[] = [];
          if (!serverUser.phone || serverUser.phone.trim() === "") missing.push("Phone Number");
          if (!serverUser.address || serverUser.address.trim() === "") missing.push("Address");

          setIncompleteFields(missing);
          return;
        }
      } catch {
        // Fall back to the locally stored profile if the server is unavailable.
      }

      const savedUser = getStoredUser();
      if (!isMounted) return;

      setUser(savedUser);

      if (!savedUser) {
        setStatus("Please register an account before placing an order.");
        router.replace("/register");
        return;
      }

      setForm((current) => ({ ...current, name: savedUser.name ?? "", phone: savedUser.phone ?? "" }));

      const missing: string[] = [];
      if (!savedUser.phone || savedUser.phone.trim() === "") missing.push("Phone Number");
      if (!savedUser.address || savedUser.address.trim() === "") missing.push("Address");

      setIncompleteFields(missing);
    }

    void loadCheckoutUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");

    if (activeReservation) {
      setStatus("This reservation is already placed. Upload your receipt below or continue from Order History.");
      return;
    }

    if (!items.length) {
      setStatus("Your cart is empty.");
      return;
    }

    if (!user?.id) {
      setStatus("Please register an account before placing an order.");
      router.push("/register");
      return;
    }

    if (incompleteFields.length > 0) {
      setStatus(`Please complete your profile before placing an order: ${incompleteFields.join(", ")}.`);
      return;
    }

    if (form.pickupDate && !isPickupDateOnOrAfterToday(form.pickupDate)) {
      setStatus("⚠️ Pickup date cannot be earlier than the order date. Same-day pickup is allowed.");
      return;
    }

    if (user?.role === "CUSTOMER" && !user?.emailVerified) {
      setStatus("Your account is still pending verification. Please complete your phone number and address in your profile before ordering.");
      return;
    }

    if (user?.role === "CUSTOMER" && user?.isBlocked) {
      setStatus("Your account has been blocked. Please contact the admin.");
      return;
    }

    const invalidItem = items.find((item) => Number(item.quantity ?? 0) > Number(item.stock ?? 0));

    if (invalidItem) {
      setStatus(`Not enough stock for ${invalidItem.name}. Please lower the quantity.`);
      return;
    }

    setIsSubmitting(true);

    if (!orderIdempotencyKeyRef.current) {
      const timing = typeof performance !== "undefined" ? performance.now().toString(36) : "0";
      orderIdempotencyKeyRef.current = `checkout-${Date.now()}-${timing}-${Math.random().toString(36).slice(2, 12)}`;
    }

    const payload = {
      idempotencyKey: orderIdempotencyKeyRef.current,
      userId: user?.id ?? null,
      customerName: form.name || user?.name || "Customer",
      customerPhone: form.phone || user?.phone || "",
      pickupDate: form.pickupDate || null,
      pickupTime: form.pickupTime || undefined,
      paymentMethod: form.paymentMethod,
      proofOfPaymentUrl: null,
      status: form.paymentMethod === "CASH" ? "PENDING" : "PENDING_PAYMENT",
      isWalkIn: false,
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),
    };

    try {
      const response = await fetchWithTimeout("/api/auth/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      setIsSubmitting(false);

      if (!response.ok) {
        if (response.status === 410) orderIdempotencyKeyRef.current = null;
        setStatus(getResponseErrorMessage(data, response.status, "We couldn't place your order right now. Please review your details and try again."));
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "apc-customer-notifications",
          String(Number(window.localStorage.getItem("apc-customer-notifications") ?? "0") + 1),
        );
        window.dispatchEvent(new Event("apc-customer-notifications-updated"));

        const { emitNewOrderAdminNotification } = await import("@/lib/admin-notifications");
        emitNewOrderAdminNotification();
      }

      saveRecentOrder(data.order);

      orderIdempotencyKeyRef.current = null;

      clearCart();
      if (form.paymentMethod !== "CASH") {
        const createdAt = new Date(data.order.createdAt).getTime();
        setActiveReservation({
          id: data.order.id,
          orderNumber: data.order.orderNumber,
          expiresAt: new Date(createdAt + ONLINE_PAYMENT_RESERVATION_TTL_MS).toISOString(),
        });
        setStatus("");
        return;
      }

      setStatus("Order placed successfully! Awaiting payment confirmation.");
      router.push("/orders");
    } catch (error) {
      setIsSubmitting(false);
      setStatus(getUserFacingErrorMessage(error, "We couldn't place your order right now. Please try again."));
    }
  }

  async function handleProofUpload(file: File | undefined) {
    if (!file) return;
    if (!activeReservation) {
      setProofUploadState({ type: "error", message: "Reserve the stock before paying or uploading proof." });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSizeBytes = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setProofOfPaymentUrl(null);
      setProofFileName(null);
      setProofUploadState({ type: "error", message: "Only JPG, PNG, or WebP images are allowed." });
      setStatus("");
      return;
    }

    if (file.size > maxSizeBytes) {
      setProofOfPaymentUrl(null);
      setProofFileName(null);
      setProofUploadState({ type: "error", message: "Receipt must be 5MB or smaller." });
      setStatus("");
      return;
    }

    setStatus("");
    setIsUploadingProof(true);
    setProofUploadState({ type: "uploading", message: "Uploading proof of payment..." });
    setProofFileName(file.name);

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("orderId", activeReservation.id);

    try {
      const response = await fetchWithTimeout("/api/auth/payment-proof", { method: "POST", body: uploadForm });
      const data = await response.json();
      if (!response.ok) {
        setProofOfPaymentUrl(null);
        setProofUploadState({
          type: "error",
          message: getResponseErrorMessage(data, response.status, "We couldn't upload that receipt. Please check the file and try again."),
        });
        return;
      }

      setProofOfPaymentUrl(data.url);
      setProofSubmitted(true);
      setProofUploadState({ type: "success", message: "Receipt uploaded successfully." });
    } catch {
      setProofOfPaymentUrl(null);
      setProofUploadState({ type: "error", message: "Unable to upload proof of payment. Please try again." });
    } finally {
      setIsUploadingProof(false);
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const selectedWallet = form.paymentMethod === "GCASH"
    ? { name: paymentSettings.gcashAccountName, number: paymentSettings.gcashAccountNumber, qrCodeUrl: paymentSettings.gcashQrCodeUrl }
    : { name: paymentSettings.mayaAccountName, number: paymentSettings.mayaAccountNumber, qrCodeUrl: paymentSettings.mayaQrCodeUrl };

  const formatPickupTimeLabel = (timeValue: string | null | undefined) => {
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

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,138,30,0.08))] p-5 md:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.42em] text-[#FF8A1E]">
              <span className="h-2 w-2 rounded-full bg-[#FF8A1E] shadow-[0_0_18px_rgba(255,138,30,0.95)]" />
              Final step
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">Complete your order</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#B8B8B8]">Add your pickup details and choose a payment method to place your reservation.</p>
          </div>

          <Link href="/cart" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#141414] px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:border-[#FF8A1E]/70 hover:text-[#FF8A1E]">
            ← Back to cart
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          <div>
            {incompleteFields.length > 0 && (
              <div className="mb-6 rounded-3xl border border-[#FFC857]/30 bg-[#261D0A] p-5">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 text-2xl">⚠️</div>
                  <div className="flex-1">
                    <h3 className="mb-2 text-base font-semibold text-[#FFC857]">Complete your profile</h3>
                    <p className="mb-3 text-sm text-[#F2D98A]">
                      Please update the following information on your profile for a smooth pickup experience:
                    </p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {incompleteFields.map((field) => (
                        <span key={field} className="inline-block rounded-full border border-[#FFC857]/30 bg-[#2B220A] px-3 py-1 text-xs font-semibold text-[#FFE39F]">
                          • {field}
                        </span>
                      ))}
                    </div>
                    <Link
                      href="/profile"
                      className="inline-flex items-center gap-2 rounded-full bg-[#FF8A1E] px-4 py-2 text-sm font-semibold text-[#111111] transition hover:brightness-110"
                    >
                      Complete profile
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-[#151515] p-4 sm:p-6">
              <div className="mb-6 border-b border-white/6 pb-6">
                <h2 className="mb-2 text-lg font-semibold text-white">Pickup information</h2>
                <p className="mb-4 text-sm text-[#B8B8B8]">Pickup your order at Apayao Pasalubong Center.</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#D5D5D5]">Full Name</label>
                    <input
                      required
                      value={form.name}
                      disabled={Boolean(activeReservation)}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-[#FF8A1E]/60 focus:ring-1 focus:ring-[#FF8A1E]/40"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#D5D5D5]">Phone Number</label>
                    <input
                      required
                      value={form.phone}
                      disabled={Boolean(activeReservation)}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-[#FF8A1E]/60 focus:ring-1 focus:ring-[#FF8A1E]/40"
                      placeholder="Your phone number"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#D5D5D5]">Pickup Date (optional)</label>
                    <input
                      type="date"
                      value={form.pickupDate}
                      disabled={Boolean(activeReservation)}
                      onChange={(e) => setForm({ ...form, pickupDate: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-[#FF8A1E]/60 focus:ring-1 focus:ring-[#FF8A1E]/40 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    {form.pickupDate && !isPickupDateOnOrAfterToday(form.pickupDate) && (
                      <div className="mt-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                        Pickup date cannot be earlier than the order date. Same-day pickup is allowed.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#D5D5D5]">Pickup Time (optional)</label>
                    <select
                      value={form.pickupTime}
                      disabled={Boolean(activeReservation)}
                      onChange={(e) => setForm({ ...form, pickupTime: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-[#FF8A1E]/60 focus:ring-1 focus:ring-[#FF8A1E]/40"
                    >
                      <option value="">No specific time</option>
                      {Array.from({ length: 15 }, (_, index) => 9 + index).flatMap((hour) => {
                        const times = ["00", "30"];
                        return times.map((minute) => {
                          const value = `${String(hour).padStart(2, "0")}:${minute}`;
                          return <option key={value} value={value}>{formatPickupTimeLabel(value)}</option>;
                        });
                      })}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">Payment method</h2>
                <div className="space-y-3">
                  {(["CASH", "GCASH", "PAYMAYA"] as const).map((method) => (
                    <label
                      key={method}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition ${form.paymentMethod === method ? "border-[#FF8A1E]/70 bg-[#2C1B0B] text-white" : "border-white/10 bg-[#1A1A1A] text-[#E2E2E2] hover:border-white/20"}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method}
                          checked={form.paymentMethod === method}
                          disabled={Boolean(activeReservation)}
                          onChange={() => setForm((current) => ({ ...current, paymentMethod: method }))}
                          className="h-4 w-4 border-white/20 bg-transparent text-[#FF8A1E] focus:ring-[#FF8A1E]"
                        />
                        <span className="text-sm font-semibold">{method === "CASH" ? "Cash on pickup" : method === "GCASH" ? "GCash" : "PayMaya"}</span>
                      </div>
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#B8B8B8]">
                        {method === "CASH" ? "Manual" : "Online"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {status && (
                <div className={`mb-6 rounded-2xl px-4 py-3 text-sm font-medium ${
                  status.includes("successfully")
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300"
                }`}>
                  {status}
                </div>
              )}

              {form.paymentMethod !== "CASH" && !activeReservation && (
                <div className="mb-6 rounded-2xl border border-[#FF8A1E]/30 bg-[#24170B] p-4 text-sm text-[#F2D98A]">
                  Confirm your order to reserve the stock first. Wallet payment details and receipt upload will appear after the reservation is secured.
                </div>
              )}

              {form.paymentMethod !== "CASH" && activeReservation && (
                <div className="mb-6 rounded-2xl border border-[#FF8A1E]/30 bg-[#24170B] p-4">
                  <h3 className="text-sm font-semibold text-white">Reservation secured: {activeReservation.orderNumber}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#F2D98A]">
                    Stock is held until {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activeReservation.expiresAt))}. Pay and upload your receipt before then. If you already paid but cannot upload, contact the store with this order number before the deadline.
                  </p>
                  {proofSubmitted ? (
                    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-200">
                      Receipt submitted for admin review. You can track the order from Order History.
                      <Link href="/orders" className="ml-2 underline underline-offset-2">View order</Link>
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs leading-5 text-[#D5D5D5]">Pay through {form.paymentMethod === "GCASH" ? "GCash" : "Maya"}, then upload your receipt screenshot for admin review.</p>
                  <ol className="mt-3 space-y-1.5 border-y border-white/10 py-3 text-xs leading-5 text-[#F2D98A]">
                    <li><span className="mr-2 font-semibold text-[#FFB36F]">01</span>Open the {form.paymentMethod === "GCASH" ? "GCash" : "Maya"} app and scan the QR code or use the account number.</li>
                    <li><span className="mr-2 font-semibold text-[#FFB36F]">02</span>Send the exact order total shown in the order summary.</li>
                    <li><span className="mr-2 font-semibold text-[#FFB36F]">03</span>Save a screenshot of the successful transaction and upload it below.</li>
                  </ol>

                  <div className="mt-3 rounded-xl border border-white/10 bg-[#17110B] p-3 text-sm text-[#F2D98A]">
                    <div className="font-semibold">{form.paymentMethod === "GCASH" ? "GCash" : "Maya"}</div>
                    <div className="mt-1">{selectedWallet.name || "Wallet account not configured"}</div>
                    <div className="mt-1 font-semibold tracking-wide">{selectedWallet.number || "Ask the store for the account number"}</div>
                    {selectedWallet.qrCodeUrl ? <Image src={selectedWallet.qrCodeUrl} alt={`${form.paymentMethod} payment QR code`} width={220} height={220} className="mt-3 rounded-lg bg-white p-2" unoptimized /> : null}
                  </div>

                  <div className="mt-3 rounded-xl border border-dashed border-[#FF8A1E]/50 bg-[#17110B] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#FFB36F]">Receipt upload</div>
                        <div className="mt-1 text-xs text-[#D5D5D5]">Accepted: JPG, PNG, or WebP • Max 5MB</div>
                      </div>

                      {proofOfPaymentUrl && (
                        <label className="shrink-0 cursor-pointer rounded-full border border-white/10 bg-[#202020] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:border-[#FF8A1E]/60 hover:text-[#FFB36F]">
                          Replace
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleProofUpload(event.target.files?.[0])} className="sr-only" />
                        </label>
                      )}
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#FF8A1E]/50 bg-[#1F140C] px-4 py-3 text-sm font-semibold text-[#FFB36F] transition hover:border-[#FF8A1E] hover:bg-[#2A1C11]">
                      <span>{isUploadingProof ? "Uploading..." : proofOfPaymentUrl ? "Choose another receipt" : "Choose receipt screenshot"}</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleProofUpload(event.target.files?.[0])} className="sr-only" />
                    </label>

                    {isUploadingProof && (
                      <div className="mt-3" role="status" aria-live="polite">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#3A2414]">
                          <div className="receipt-upload-progress h-full w-1/3 rounded-full bg-[#FF8A1E]" />
                        </div>
                        <p className="mt-1.5 text-[11px] text-[#D5D5D5]">Uploading securely. Keep this page open.</p>
                      </div>
                    )}

                    {proofFileName && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-xs text-[#E8E8E8]">
                        <span className="font-semibold text-white">Selected file:</span> {proofFileName}
                      </div>
                    )}

                    {proofUploadState.message && (
                      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
                        proofUploadState.type === "success"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : proofUploadState.type === "error"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            : "border-[#FF8A1E]/30 bg-[#2A1C11] text-[#FFB36F]"
                      }`}>
                        {proofUploadState.message}
                      </div>
                    )}
                  </div>

                  {proofOfPaymentUrl ? (
                    <div className="mt-3">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#FFB36F]">Receipt preview</div>
                      <Image src={proofOfPaymentUrl} alt="Uploaded proof of payment" width={480} height={640} className="max-h-56 rounded-lg border border-white/10 object-contain" unoptimized />
                    </div>
                  ) : null}
                </div>
              )}

              <button
                disabled={Boolean(user?.isBlocked) || isSubmitting || isUploadingProof || Boolean(activeReservation)}
                className="w-full rounded-xl bg-[#FF8A1E] px-6 py-3.5 text-sm font-semibold text-slate-950 transition duration-200 hover:bg-[#F97316] disabled:opacity-60"
              >
                {activeReservation ? "Reservation secured" : isUploadingProof ? "Uploading proof..." : isSubmitting ? "Reserving stock..." : form.paymentMethod === "CASH" ? "Place order" : "Reserve & continue to payment"}
              </button>
            </form>
          </div>

          <aside className="h-fit rounded-2xl border border-white/10 bg-[#151515] p-5 xl:sticky xl:top-6">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.38em] text-[#FF8A1E]">Order summary</div>

            <div className="mb-6 max-h-72 space-y-3 overflow-y-auto border-b border-white/6 pb-6">
              {items.map((item) => (
                <div key={`${item.productId}-${item.variantId ?? item.variantLabel ?? "default"}`} className="flex items-start justify-between gap-4 text-sm">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#161616]">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} width={56} height={56} className="h-full w-full object-cover" unoptimized />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="wrap-break-word font-semibold text-white">{item.name}</div>
                      {item.variantLabel ? <div className="mt-1 wrap-break-word text-xs font-semibold text-[#FFB36F]">Option: {item.variantLabel}</div> : null}
                      {item.variantSku ? <div className="mt-1 wrap-break-word text-xs text-[#B8B8B8]">SKU: {item.variantSku}</div> : null}
                      <div className="mt-1 text-xs text-[#B8B8B8]">× {item.quantity}</div>
                    </div>
                  </div>
                  <div className="text-right font-bold text-white">
                    ₱{(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-6 text-center">
              <div className="mb-1 text-xs font-medium text-[#B8B8B8]">Total amount</div>
              <div className="text-4xl font-semibold tracking-[-0.04em] text-white">₱{subtotal.toFixed(2)}</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-[#1A1A1A] p-3 text-xs font-semibold text-[#D5D5D5]">
                Free pickup at APC store
              </div>
            </div>

            <Link
              href="/cart"
              className="block w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3.5 text-center text-sm font-semibold text-white transition duration-200 hover:border-[#FF8A1E]/60 hover:text-[#FF8A1E]"
            >
              Back to cart
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
