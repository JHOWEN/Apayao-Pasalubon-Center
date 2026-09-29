"use client";

import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AdminToast } from "@/components/admin/admin-toast";
import styles from "./admin-orders.module.css";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleX,
  Eye,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import { orderStatuses } from "@/lib/order";
import {
  ADMIN_MODAL_ACTION_ROW_CLASS,
  ADMIN_MODAL_HEADER_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  subtotal: number;
  product?: {
    name?: string;
  };
  variant?: {
    sku?: string;
    attributes?: string | Record<string, string> | null;
    color?: string | null;
    measurementValue?: number | null;
    measurementUnit?: string | null;
  } | null;
}

interface OrderData {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  createdAt: string;
  status: string;
  totalAmount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  proofOfPaymentUrl?: string | null;
  isWalkIn?: boolean;
  items: OrderItem[];
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [filterDate, setFilterDate] = useState("ALL");
  const [customPickupDate, setCustomPickupDate] = useState("");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [paymentProofViewerUrl, setPaymentProofViewerUrl] = useState<string | null>(null);
  const [jumpInput, setJumpInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [, setIsUpdatingStatus] = useState(false);
  const [manageModal, setManageModal] = useState<{
    orderId: string;
    orderNumber: string;
    paymentStatus: string;
    paymentMethod: string;
    status: string;
    isWalkIn: boolean;
  } | null>(null);
  const [statusUpdateFeedback, setStatusUpdateFeedback] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [, setIsProcessingPaymentAction] = useState(false);

  function getVariantLabel(
    variant:
      | {
          sku?: string;
          attributes?: string | Record<string, string> | null;
          color?: string | null;
          measurementValue?: number | null;
          measurementUnit?: string | null;
        }
      | undefined
      | null
  ) {
    if (!variant) return "";
    const attributeDetails =
      typeof variant.attributes === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(variant.attributes);
              return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? Object.values(parsed).filter(
                    (value): value is string => typeof value === "string" && Boolean(value.trim())
                  )
                : [];
            } catch {
              return [];
            }
          })()
        : variant.attributes && typeof variant.attributes === "object"
        ? Object.values(variant.attributes).filter((value): value is string => Boolean(value))
        : [];
    const details =
      attributeDetails.length > 0
        ? attributeDetails
        : [variant.color, variant.measurementValue ? `${variant.measurementValue}${variant.measurementUnit ?? ""}` : null].filter(
            Boolean
          );
    return details.length ? `${details.join(" • ")} (${variant.sku ?? "SKU"})` : variant.sku ?? "Variant";
  }

  function getStatusLabel(status: string) {
    const labels: Record<string, string> = {
      PENDING_PAYMENT: "Payment Review",
      PENDING: "Pending",
      CONFIRMED: "Confirmed",
      PREPARING: "Preparing",
      READY_FOR_PICKUP: "Ready for Pickup",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    };
    return labels[status] ?? status;
  }

  function getPaymentLabel(paymentStatus?: string, paymentMethod?: string, orderStatus?: string) {
    if (paymentMethod === "CASH") {
      if (paymentStatus === "PAID" || orderStatus === "COMPLETED") {
        return "Paid";
      }

      if (paymentStatus === "FAILED") {
        return "Declined";
      }

      return "Pending";
    }

    if (paymentStatus === "CANCELLED" || (orderStatus === "CANCELLED" && paymentStatus !== "PAID")) {
      return "Cancelled";
    }

    return paymentStatus === "PAID" ? "Paid" : paymentStatus === "FAILED" ? "Declined" : "Awaiting Review";
  }

  function formatPickupTimeLabel(timeValue?: string | null) {
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
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character] ?? character);
  }

  function printFilteredPickupSheet() {
    const pickupOrders = filteredOrders
      .filter((order) => !order.isWalkIn && !["COMPLETED", "CANCELLED"].includes(order.status))
      .sort((left, right) => new Date(left.pickupDate ?? 0).getTime() - new Date(right.pickupDate ?? 0).getTime());

    const printWindow = window.open("", "tomorrow-pickups", "width=900,height=900");
    if (!printWindow) return;

    const orderMarkup = pickupOrders
      .map(
        (order) => `
      <article class="order">
        <div class="order-header"><div><strong>${escapeHtml(order.orderNumber)}</strong><div>${escapeHtml(
          order.customerName
        )}</div></div><div class="pickup">Pickup: ${
          order.pickupDate ? new Date(order.pickupDate).toLocaleString() : "No date"
        }</div></div>
        <div class="customer"><strong>Phone:</strong> ${escapeHtml(
          order.customerPhone || "No phone"
        )} &nbsp; <strong>Email:</strong> ${escapeHtml(order.customerEmail || "No email")}<br><strong>Address:</strong> ${escapeHtml(
          order.customerAddress || "No address"
        )}</div>
        <table><thead><tr><th>Product</th><th>Variant</th><th>Qty</th></tr></thead><tbody>${order.items
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.product?.name ?? "Product")}</td><td>${escapeHtml(
                item.variant ? getVariantLabel(item.variant) : "-"
              )}</td><td>${item.quantity}</td></tr>`
          )
          .join("")}</tbody></table>
        <div class="total"><span>${escapeHtml(getPaymentLabel(order.paymentStatus))} · ${escapeHtml(
          order.paymentMethod ?? "CASH"
        )}</span><strong>₱${Number(order.totalAmount).toFixed(2)}</strong></div>
      </article>`
      )
      .join("");

    const filterLabel = filterDate === "ALL" ? "Filtered Pickup Schedule" : `${filterDate.replaceAll("_", " ")} Pickup Schedule`;
    printWindow.document.write(`<!doctype html><html><head><title>${filterLabel}</title><style>
      *{box-sizing:border-box}body{margin:0;padding:28px;color:#17251f;font:13px Arial,sans-serif}h1{margin:0;font-size:24px}h2{margin:4px 0 0;font-size:13px;font-weight:400;color:#64748b}.meta{margin:18px 0;padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0}.order{margin:0 0 18px;padding:16px;border:1px solid #cbd5e1;break-inside:avoid}.order-header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;font-size:14px}.order-header strong{font-size:16px}.pickup{font-weight:700;color:#047857;text-align:right}.customer{padding:10px 0;line-height:1.6;color:#475569}.customer strong{color:#334155}table{width:100%;border-collapse:collapse}th,td{padding:7px 6px;border-top:1px solid #e2e8f0;text-align:left}th{font-size:10px;text-transform:uppercase;color:#64748b}th:last-child,td:last-child{text-align:center;width:60px}.total{display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:2px solid #334155}.empty{text-align:center;padding:40px;border:1px dashed #94a3b8;color:#64748b}@media print{body{padding:16px}}
    </style></head><body><h1>${filterLabel}</h1><h2>Apayao Pasalubong Center</h2><div class="meta"><strong>${pickupOrders.length} pickup order(s)</strong> · Printed ${new Date().toLocaleString()}</div>${
      orderMarkup || '<div class="empty">No orders match the current filters.</div>'
    }</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 300);
  }

  function printFilteredOrderLabels() {
    const labelOrders = filteredOrders
      .filter((order) => !order.isWalkIn && !["COMPLETED", "CANCELLED"].includes(order.status))
      .sort((left, right) => new Date(left.pickupDate ?? 0).getTime() - new Date(right.pickupDate ?? 0).getTime());
    const printWindow = window.open("", "filtered-order-labels", "width=700,height=900");
    if (!printWindow) return;

    const labelsMarkup = labelOrders
      .map(
        (order) => `
      <article class="label">
        <div class="brand">Apayao Pasalubong Center</div>
        <div class="label-title">PICKUP ORDER</div>
        <div class="order-number">${escapeHtml(order.orderNumber)}</div>
        <div class="customer-name">${escapeHtml(order.customerName)}</div>
        <div class="details"><div><strong>Phone</strong><span>${escapeHtml(
          order.customerPhone || "No phone"
        )}</span></div><div><strong>Pickup</strong><span>${
          order.pickupDate ? new Date(order.pickupDate).toLocaleString() : "No date"
        }</span></div><div class="address"><strong>Address</strong><span>${escapeHtml(
          order.customerAddress || "No address"
        )}</span></div></div>
        <div class="items">${order.items
          .map(
            (item) =>
              `<div class="item"><span>${escapeHtml(item.product?.name ?? "Product")}${
                item.variant ? `<small>${escapeHtml(getVariantLabel(item.variant))}</small>` : ""
              }</span><strong>Qty ${item.quantity}</strong></div>`
          )
          .join("")}</div>
        <div class="footer"><span>${escapeHtml(order.paymentMethod ?? "CASH")} · ${escapeHtml(
          getPaymentLabel(order.paymentStatus)
        )}</span><strong>₱${Number(order.totalAmount).toFixed(2)}</strong></div>
      </article>`
      )
      .join("");

    printWindow.document.write(`<!doctype html><html><head><title>Filtered pickup labels</title><style>
      *{box-sizing:border-box}@page{size:letter portrait;margin:.35in}body{margin:0;background:#e5e7eb;color:#17251f;font:12px Arial,sans-serif}.label{width:7.8in;height:4.95in;margin:0 auto;padding:.22in;background:#fff;border:2px solid #064e3b;break-inside:avoid}.label:nth-child(even){break-after:page}.brand{color:#064e3b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.label-title{margin-top:12px;color:#64748b;font-size:9px;font-weight:700;letter-spacing:.18em}.order-number{margin-top:4px;font-size:24px;font-weight:800;letter-spacing:.04em}.customer-name{margin-top:4px;font-size:18px;font-weight:700;overflow-wrap:anywhere}.details{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:12px;padding:9px 0;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}.details div{display:grid;gap:3px}.details .address{grid-column:1 / -1}.details strong{color:#64748b;font-size:8px;letter-spacing:.1em;text-transform:uppercase}.details span{overflow-wrap:anywhere}.items{margin-top:10px;border-top:1px solid #334155}.item{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e2e8f0}.item span{min-width:0;overflow-wrap:anywhere}.item strong{flex-shrink:0}.item small{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:400}.footer{display:flex;justify-content:space-between;gap:10px;margin-top:10px;padding-top:8px;border-top:2px solid #064e3b;color:#065f46}.footer strong{font-size:15px}@media print{body{background:#fff}.label{margin:0;border-width:1px}}
    </style></head><body>${labelsMarkup || '<div class="label">No orders match the current filters.</div>'}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 300);
  }

  const loadOrders = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        search,
        status: filterStatus,
        filterDate,
        customPickupDate,
      });
      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Unable to load orders.");
      }

      const data = await response.json();
      const responseOrders = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
      const normalizedOrders = responseOrders.map((order: Partial<OrderData>) => ({
            ...order,
            id: order.id ?? "",
            orderNumber: order.orderNumber ?? "",
            customerName: order.customerName ?? "Unknown customer",
            customerPhone: order.customerPhone ?? "",
            customerEmail: order.customerEmail ?? "",
            customerAddress: order.customerAddress ?? "",
            pickupDate: order.pickupDate ?? null,
            createdAt: order.createdAt ?? new Date().toISOString(),
            status: order.status ?? "PENDING",
            totalAmount: Number(order.totalAmount ?? 0),
            paymentMethod: order.paymentMethod ?? "CASH",
            paymentStatus: order.paymentStatus ?? undefined,
            proofOfPaymentUrl: order.proofOfPaymentUrl ?? null,
            items: Array.isArray(order.items) ? order.items : [],
          }));
      setOrders(normalizedOrders as OrderData[]);
        setTotalOrderCount(Number(data?.pagination?.totalCount ?? normalizedOrders.length));
        setStatusCounts(data?.statusCounts && typeof data.statusCounts === "object" ? data.statusCounts : {});
    } catch {
      if (showLoading) {
        setOrders([]);
          setTotalOrderCount(0);
          setStatusCounts({});
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [currentPage, customPickupDate, filterDate, filterStatus, pageSize, search]);

  async function handleStatusChange(orderId: string, nextStatus: string) {
    setIsUpdatingStatus(true);

    const targetOrder = orders.find((order) => order.id === orderId);
    if (targetOrder?.status === "CANCELLED") {
      setIsUpdatingStatus(false);
      return false;
    }

    const response = await fetch("/api/admin/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: nextStatus }),
    });

    if (!response.ok) {
      setIsUpdatingStatus(false);
      const data = await response.json().catch(() => ({}));
      setStatusUpdateFeedback({
        title: "Status not updated",
        message: data.message ?? "Unable to update order status.",
        type: "error",
      });
      return false;
    }

    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status: nextStatus } : order)));
    setIsUpdatingStatus(false);
    return true;
  }

  function openManageModal(orderId: string) {
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      return;
    }

    setManageModal({
      orderId,
      orderNumber: targetOrder.orderNumber,
      paymentStatus: targetOrder.paymentStatus ?? "PENDING",
      paymentMethod: targetOrder.paymentMethod ?? "CASH",
      status: targetOrder.status,
      isWalkIn: Boolean(targetOrder.isWalkIn),
    });
  }

  async function handlePaymentApproval(orderId: string) {
    setIsProcessingPaymentAction(true);

    const response = await fetch("/api/admin/payments/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });

    if (!response.ok) {
      setIsProcessingPaymentAction(false);
      const data = await response.json();
      setStatusUpdateFeedback({
        title: "Payment approval failed",
        message: data.message ?? "Unable to approve payment.",
        type: "error",
      });
      return;
    }

    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, paymentStatus: "PAID", status: "CONFIRMED" } : order
      )
    );
    setManageModal(null);
    setIsProcessingPaymentAction(false);
    setStatusUpdateFeedback({
      title: "Payment approved",
      message: "Payment confirmed for order. Stock has been reserved.",
      type: "success",
    });
  }

  async function handlePaymentDecline(orderId: string) {
    setIsProcessingPaymentAction(true);

    const response = await fetch("/api/admin/payments/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });

    if (!response.ok) {
      setIsProcessingPaymentAction(false);
      const data = await response.json();
      setStatusUpdateFeedback({
        title: "Payment decline failed",
        message: data.message ?? "Unable to decline payment.",
        type: "error",
      });
      return;
    }

    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, paymentStatus: "FAILED", status: "CANCELLED" } : order
      )
    );
    setManageModal(null);
    setIsProcessingPaymentAction(false);
    setStatusUpdateFeedback({
      title: "Payment declined",
      message: "Order was cancelled and stock was released.",
      type: "success",
    });
  }

  function isPaymentReviewEligible(order: OrderData) {
    if (order.paymentMethod === "CASH") {
      return false;
    }

    if (order.status === "COMPLETED" || order.status === "CONFIRMED" || order.status === "CANCELLED") {
      return false;
    }

    if (!order.paymentStatus || order.paymentStatus === "PAID" || order.paymentStatus === "FAILED") {
      return false;
    }

    return true;
  }

  function isStatusBlockedByPayment(
    paymentMethod: string | undefined,
    paymentStatus: string,
    targetStatus: string
  ) {
    if (targetStatus === "CANCELLED" || paymentStatus === "PAID") return false;
    if (paymentMethod === "CASH") return false;
    return targetStatus !== "PENDING_PAYMENT";
  }

  function renderOrderStepper(status: string) {
    if (status === "CANCELLED") {
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 font-semibold">
            <CircleX className="h-4 w-4 text-rose-600 shrink-0" />
            <span>This order has been cancelled and voided.</span>
          </div>
        </div>
      );
    }

    const steps = [
      { key: "PENDING", label: "Pending" },
      { key: "CONFIRMED", label: "Confirmed" },
      { key: "PREPARING", label: "Preparing" },
      { key: "READY_FOR_PICKUP", label: "Ready" },
      { key: "COMPLETED", label: "Completed" },
    ];

    const statusSeq = ["PENDING_PAYMENT", "PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED"];
    const currentIdx = statusSeq.indexOf(status);

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Fulfillment Status
        </span>
        <div className="flex items-center justify-between">
          {steps.map((step, idx, arr) => {
            const stepIdx = statusSeq.indexOf(step.key);
            const isDone = currentIdx >= stepIdx && currentIdx !== -1;
            const isCurrent = status === step.key || (status === "PENDING_PAYMENT" && step.key === "PENDING");

            return (
              <div key={step.key} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                      isDone
                        ? "bg-emerald-600 text-white shadow-xs"
                        : isCurrent
                        ? "border-2 border-emerald-600 bg-white text-emerald-700 dark:bg-slate-900 dark:text-emerald-400"
                        : "border border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900"
                    }`}
                  >
                    {isDone ? <Check className="h-2.5 w-2.5 stroke-3" /> : idx + 1}
                  </div>
                  <span
                    className={`mt-1 text-[9px] ${
                      isCurrent
                        ? "font-bold text-slate-900 dark:text-white"
                        : isDone
                        ? "font-medium text-emerald-700 dark:text-emerald-400"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < arr.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-1 ${
                      currentIdx > stepIdx ? "bg-emerald-600" : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  useEffect(() => {
    let isMounted = true;

    const runLoad = async () => {
      await loadOrders(true);
      if (!isMounted) return;
    };

    void runLoad();

    const intervalId = window.setInterval(() => {
      void loadOrders();
    }, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [loadOrders]);

  const detailOrder = orders.find((order) => order.id === detailOrderId) ?? null;

  useEffect(() => {
    const hasOpenModal = Boolean(statusUpdateFeedback || manageModal || detailOrder || paymentProofViewerUrl);

    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = hasOpenModal ? "hidden" : previousOverflow;

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [manageModal, statusUpdateFeedback, detailOrder, paymentProofViewerUrl]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (value: string) => {
    setFilterStatus(value);
    setCurrentPage(1);
  };

  const handleFilterDateChange = (value: string) => {
    setFilterDate(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setFilterStatus("ALL");
    setFilterDate("ALL");
    setCustomPickupDate("");
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalOrderCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedOrders = {
    items: orders,
    startIndex: Math.min((safeCurrentPage - 1) * pageSize, totalOrderCount),
    endIndex: Math.min(safeCurrentPage * pageSize, totalOrderCount),
  };
  const filteredOrders = orders;

  const visibleRangeStart = totalOrderCount === 0 ? 0 : paginatedOrders.startIndex + 1;
  const visibleRangeEnd = paginatedOrders.endIndex;

  function getPageNumbers() {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (safeCurrentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (safeCurrentPage >= totalPages - 3) {
      pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, "...", totalPages);
    }
    return pages;
  }

  function handleJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pageNum = parseInt(jumpInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpInput("");
    }
  }

  const statusSummary = [
    { key: "ACTIVE", label: "Active" },
    { key: "AWAITING_PAYMENT_APPROVAL", label: "Awaiting Review" },
    { key: "PENDING", label: "Pending" },
    { key: "PREPARING", label: "Preparing" },
    { key: "READY_FOR_PICKUP", label: "Ready for Pickup" },
    { key: "COMPLETED", label: "Completed" },
    { key: "CANCELLED", label: "Cancelled" },
    { key: "ALL", label: "All Orders" },
  ].map((status) => ({
    ...status,
    count: statusCounts[status.key] ?? 0,
  }));

  const hasPrintableOrders = filteredOrders.some(
    (order) => !order.isWalkIn && !["COMPLETED", "CANCELLED"].includes(order.status)
  );

  return (
    <div suppressHydrationWarning className="space-y-5 text-slate-800 dark:text-slate-100">
      {/* 1. Header Toolbar */}
      <header className="flex flex-row items-center justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Orders
            </h1>
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {totalOrderCount} total
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review customer orders, verify payment proofs, and manage pickup fulfillment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={printFilteredOrderLabels}
            disabled={!hasPrintableOrders}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Print Labels</span>
          </button>

          <button
            type="button"
            onClick={printFilteredPickupSheet}
            disabled={!hasPrintableOrders}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            <span>Pickup Sheet</span>
          </button>
        </div>
      </header>

      {/* 2. Unified Filter Toolbar (Status Tabs & Search & Date) */}
      <section className="space-y-3 rounded-lg border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {statusSummary.map(({ key, label, count }) => {
            const isActive = filterStatus === key;
            const isAttention = key === "AWAITING_PAYMENT_APPROVAL" && count > 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleFilterStatusChange(key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-950"
                    : isAttention
                    ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-950"
                      : isAttention
                      ? "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-white"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Pickup Date Selector */}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search order #, customer, phone..."
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-900 outline-hidden placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="inline">Pickup:</span>
            </div>

            <div className="flex max-w-full flex-wrap rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-800/80">
              {[
                ["ALL", "All"],
                ["TODAY", "Today"],
                ["TOMORROW", "Tomorrow"],
                ["NEXT_7_DAYS", "7 Days"],
                ["CUSTOM", "Custom"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleFilterDateChange(key)}
                  className={`rounded-sm px-2.5 py-1 text-xs font-semibold transition ${
                    filterDate === key
                      ? "bg-white text-slate-950 shadow-xs dark:bg-slate-700 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filterDate === "CUSTOM" && (
              <input
                type="date"
                value={customPickupDate}
                onChange={(e) => {
                  setCustomPickupDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-hidden dark:border-slate-700 dark:bg-slate-800"
              />
            )}

            {(search || filterStatus !== "ACTIVE" || filterDate !== "ALL" || customPickupDate) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Reset all filters"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3. Orders Data Table */}
      <section className="rounded-lg border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Pickup</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={`orders-skeleton-${rowIndex}`} className="animate-pulse">
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={`orders-skeleton-${rowIndex}-${cellIndex}`} className="px-4 py-4">
                        <div className={`h-3 rounded bg-slate-200 dark:bg-slate-700 ${cellIndex === 8 ? "ml-auto w-12" : cellIndex === 1 ? "w-28" : "w-20"}`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Package className="mx-auto mb-2 h-7 w-7 text-slate-300 dark:text-slate-600" />
                    <span>No orders match your selected filter criteria.</span>
                  </td>
                </tr>
              ) : (
                paginatedOrders.items.map((order) => {
                  return (
                    <Fragment key={order.id}>
                      <tr className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        {/* Order Number & Created Date */}
                        <td className="py-3 px-4">
                          <span className="block font-mono font-bold text-slate-900 dark:text-white">
                            {order.orderNumber}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {new Date(order.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="py-3 px-4">
                          <span className="block font-semibold text-slate-900 dark:text-white">
                            {order.customerName}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {order.customerPhone || "No phone"}
                          </span>
                        </td>

                        {/* Sales Channel */}
                        <td className="py-3 px-4">
                          <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {order.isWalkIn ? "POS" : "Ecommerce"}
                          </span>
                        </td>

                        {/* Pickup Schedule */}
                        <td className="py-3 px-4">
                          <span className="block font-medium text-slate-800 dark:text-slate-200">
                            {order.isWalkIn
                              ? "Not applicable"
                              : order.pickupDate
                              ? new Date(order.pickupDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Schedule not set"}
                          </span>
                          {!order.isWalkIn && order.pickupTime && (
                            <span className="mt-1 block text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              <span className="mr-1 font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                Time
                              </span>
                              {formatPickupTimeLabel(order.pickupTime)}
                            </span>
                          )}
                        </td>

                        {/* Items */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                          {order.items.length} {order.items.length === 1 ? "item" : "items"}
                        </td>

                        {/* Payment Status & Method */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  order.paymentStatus === "PAID"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                    : order.paymentStatus === "FAILED"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                                }`}
                              >
                                {getPaymentLabel(order.paymentStatus, order.paymentMethod, order.status)}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Method: {order.paymentMethod ?? "CASH"}
                            </span>
                          </div>
                        </td>

                        {/* Fulfillment Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              order.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : order.status === "CANCELLED"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                                : order.status === "READY_FOR_PICKUP"
                                ? "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                                : order.status === "PREPARING"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                            }`}
                          >
                            {getStatusLabel(order.status)}
                          </span>
                        </td>

                        {/* Total Amount */}
                        <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                          ₱{Number(order.totalAmount).toFixed(2)}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailOrderId(order.id)}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              title="View order details"
                            >
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() => openManageModal(order.id)}
                              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                              title="Manage order status"
                            >
                              Manage
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Complete Modern Pagination Footer Bar */}
        <div className="flex gap-4 flex-row items-center justify-between border-t border-slate-200/80 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
          {/* Left: Record Range and Rows per page */}
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="font-semibold text-slate-800 dark:text-slate-200">{visibleRangeStart.toLocaleString()}</strong> to{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">{visibleRangeEnd.toLocaleString()}</strong> of{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">{totalOrderCount.toLocaleString()}</strong> orders
            </span>

            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 dark:border-slate-700">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 outline-none transition focus:border-slate-400 shadow-2xs"
              >
                {[10, 15, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Modern Numbered Pagination Controls & Jump to Page */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {/* First Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1 || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>

              {/* Previous Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1 || isLoading}
                className="inline-flex h-8 items-center gap-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="font-medium">Prev</span>
              </button>

              {/* Windowed Numbered Page Pills */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((p, idx) =>
                  typeof p === "number" ? (
                    <button
                      key={p}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setCurrentPage(p)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition ${
                        p === safeCurrentPage
                          ? "bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs scale-105"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 shadow-2xs"
                      }`}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={`dots-${idx}`} className="px-1 text-slate-400 dark:text-slate-500 font-semibold">
                      {p}
                    </span>
                  )
                )}
              </div>

              {/* Next Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages || isLoading}
                className="inline-flex h-8 items-center gap-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="Next page"
              >
                <span className="font-medium">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Last Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Jump to Page Form */}
            {totalPages > 4 && (
              <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700">
                <span>Go to:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  placeholder={String(safeCurrentPage)}
                  className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:border-slate-400"
                />
                <button
                  type="submit"
                  disabled={!jumpInput}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-2xs transition"
                >
                  Go
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 5. Order Details Slide-Over Drawer */}
      {isMounted && detailOrder
        ? createPortal(
        <div className={`${styles.drawerBackdrop} flex`}>
          <aside className={`${styles.drawerPanel} flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900`}>
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                    {detailOrder.orderNumber}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      detailOrder.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : detailOrder.status === "CANCELLED"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                        : detailOrder.status === "READY_FOR_PICKUP"
                        ? "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                        : detailOrder.status === "PREPARING"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                    }`}
                  >
                    {getStatusLabel(detailOrder.status)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Placed on {new Date(detailOrder.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDetailOrderId(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
              {/* Order Stepper Progress */}
              {renderOrderStepper(detailOrder.status)}

              {/* Customer & Fulfillment Information Card */}
              <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="block font-semibold uppercase tracking-wider text-[10px] text-slate-400 mb-2">
                  Customer & Fulfillment
                </span>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-bold text-slate-900 dark:text-white">{detailOrder.customerName}</span>
                  </div>
                  {detailOrder.customerPhone && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <a href={`tel:${detailOrder.customerPhone}`} className="hover:underline">
                        {detailOrder.customerPhone}
                      </a>
                    </div>
                  )}
                  {detailOrder.customerEmail && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <a href={`mailto:${detailOrder.customerEmail}`} className="hover:underline">
                        {detailOrder.customerEmail}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      Schedule: <strong className="font-semibold text-slate-800 dark:text-slate-200">
                        {detailOrder.isWalkIn
                          ? "Walk-in Store Order"
                          : detailOrder.pickupDate
                          ? `Pickup on ${new Date(detailOrder.pickupDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}${detailOrder.pickupTime ? ` at ${formatPickupTimeLabel(detailOrder.pickupTime)}` : ""}`
                          : detailOrder.pickupTime
                          ? `Pickup time: ${formatPickupTimeLabel(detailOrder.pickupTime)}`
                          : "Pick up schedule not set"}
                      </strong>
                    </span>
                  </div>
                  {detailOrder.customerAddress && (
                    <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5" />
                      <span>{detailOrder.customerAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items Section */}
              <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                    Order Items
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {detailOrder.items.length} items
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailOrder.items.map((item) => (
                    <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-900 dark:text-white">
                          {item.product?.name ?? "Product item"}
                        </span>
                        {item.variant && (
                          <span className="mt-0.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {getVariantLabel(item.variant)}
                          </span>
                        )}
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {item.quantity} × ₱{Number(item.price).toFixed(2)}
                        </span>
                      </div>
                      <span className="shrink-0 font-bold text-slate-900 dark:text-white">
                        ₱{Number(item.subtotal).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Summary & Proof */}
              <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
                <span className="block font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                  Payment Summary
                </span>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Method:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {detailOrder.paymentMethod ?? "Cash"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Status:</span>
                    <span
                      className={`font-semibold ${
                        detailOrder.paymentStatus === "PAID"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : detailOrder.paymentStatus === "FAILED"
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {getPaymentLabel(detailOrder.paymentStatus, detailOrder.paymentMethod, detailOrder.status)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                    <span>Grand Total:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ₱{Number(detailOrder.totalAmount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Uploaded Receipt Card */}
                {detailOrder.paymentMethod !== "CASH" && detailOrder.proofOfPaymentUrl ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                        Customer Payment Receipt
                      </span>
                      {isPaymentReviewEligible(detailOrder) && (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          Review Needed
                        </span>
                      )}
                    </div>
                    <div className="relative h-44 w-full overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700">
                      <Image
                        src={detailOrder.proofOfPaymentUrl}
                        alt="Customer payment proof"
                        fill
                        className="object-cover cursor-pointer"
                        unoptimized
                        onClick={() => setPaymentProofViewerUrl(detailOrder.proofOfPaymentUrl ?? null)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentProofViewerUrl(detailOrder.proofOfPaymentUrl ?? null)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Enlarge & Review Receipt</span>
                    </button>
                  </div>
                ) : detailOrder.paymentMethod !== "CASH" ? (
                  <div className="mt-2 rounded-md border border-dashed border-slate-200 p-2.5 text-center text-[11px] text-slate-400 dark:border-slate-800">
                    No uploaded receipt image attached.
                  </div>
                ) : null}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDetailOrderId(null)}
                className="rounded-md border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => openManageModal(detailOrder.id)}
                className="flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Manage Status</span>
              </button>
            </div>
          </aside>
        </div>,
        document.body,
      )
        : null}

      {/* 6. Manage Order Workflow Modal */}
      {isMounted && manageModal
        ? createPortal(
        <div
          className={`${styles.modalBackdrop} p-4`}
          onClick={() => setManageModal(null)}
        >
          <div
            className={ADMIN_MODAL_PANEL_CLASS}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={ADMIN_MODAL_HEADER_CLASS}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Manage Order Status
                  </h3>
                  <p className="font-mono text-xs text-slate-500">
                    {manageModal.orderNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManageModal(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 p-5 text-xs">
              {/* Stepper Display */}
              {renderOrderStepper(manageModal.status)}

              {/* Payment Clearance Callout if review is pending */}
              {(() => {
                const targetOrder = orders.find((o) => o.id === manageModal.orderId);
                const eligible = targetOrder ? isPaymentReviewEligible(targetOrder) : false;

                if (!eligible) return null;

                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/30">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-amber-900 dark:text-amber-300">
                          Payment Clearance Required
                        </span>
                        <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-400">
                          Customer submitted proof of payment. Verify the transaction slip to confirm this order.
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {targetOrder?.proofOfPaymentUrl && (
                            <button
                              type="button"
                              onClick={() => setPaymentProofViewerUrl(targetOrder.proofOfPaymentUrl ?? null)}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 shadow-xs dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                            >
                              <Eye className="h-3 w-3" />
                              <span>View Receipt Slip</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handlePaymentApproval(manageModal.orderId)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-emerald-700"
                          >
                            <Check className="h-3 w-3" />
                            <span>Approve Payment</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Decline payment for ${manageModal.orderNumber}?`)) {
                                void handlePaymentDecline(manageModal.orderId);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400"
                          >
                            <span>Decline</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Status Transition Controls */}
              {manageModal.status === "COMPLETED" || manageModal.status === "CANCELLED" ? (
                <div className="rounded-lg bg-slate-50 p-3 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  This order has reached its final state ({getStatusLabel(manageModal.status)}) and cannot be modified.
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="manage-status-select" className="block font-bold text-slate-700 dark:text-slate-300">
                    Change Status To
                  </label>

                  {isStatusBlockedByPayment(manageModal.paymentMethod, manageModal.paymentStatus, manageModal.status) && (
                    <div className="flex items-center gap-2 rounded-md bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>Payment must be approved before advancing this order to production.</span>
                    </div>
                  )}

                  <select
                    id="manage-status-select"
                    value={manageModal.status}
                    onChange={(e) =>
                      setManageModal((current) => (current ? { ...current, status: e.target.value } : current))
                    }
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-hidden focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {orderStatuses
                      .filter((status) => status !== "CONFIRMED" || status === manageModal.status)
                      .map((status) => (
                        <option key={status} value={status}>
                          {getStatusLabel(status)}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={ADMIN_MODAL_ACTION_ROW_CLASS}>
              <button
                type="button"
                onClick={() => setManageModal(null)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const didUpdate = await handleStatusChange(manageModal.orderId, manageModal.status);
                  if (didUpdate) {
                    setManageModal(null);
                    setStatusUpdateFeedback({
                      title: "Order Updated",
                      message: `${manageModal.orderNumber} status changed to ${getStatusLabel(manageModal.status)}.`,
                      type: "success",
                    });
                  }
                }}
                disabled={
                  manageModal.status === "CANCELLED" ||
                  isStatusBlockedByPayment(manageModal.paymentMethod, manageModal.paymentStatus, manageModal.status)
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Save Status</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}

      {/* 7. Payment Proof Lightbox Modal with Direct Review Suite */}
      {isMounted && paymentProofViewerUrl
        ? createPortal(
        <div
          className={`${styles.lightboxBackdrop} p-4`}
          onClick={() => setPaymentProofViewerUrl(null)}
        >
          {(() => {
            const proofOrder =
              orders.find((o) => o.proofOfPaymentUrl === paymentProofViewerUrl) ?? detailOrder;

            return (
              <div
                className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Lightbox Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Payment Receipt Slip
                    </h3>
                    {proofOrder && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Order <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{proofOrder.orderNumber}</span> • {proofOrder.customerName} • Total Due: <strong className="text-emerald-600 dark:text-emerald-400">₱{Number(proofOrder.totalAmount).toFixed(2)}</strong>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentProofViewerUrl(null)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Lightbox Image Viewport */}
                <div className="flex max-h-[70vh] flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
                  <Image
                    src={paymentProofViewerUrl}
                    alt="Payment receipt proof"
                    width={800}
                    height={1100}
                    className="max-h-[66vh] w-auto rounded-md object-contain shadow-lg"
                    unoptimized
                  />
                </div>

                {/* Lightbox Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                  <span className="text-[11px] text-slate-500">
                    Verify the reference number and amount matches the order total.
                  </span>

                  <button
                    type="button"
                    onClick={() => setPaymentProofViewerUrl(null)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </div>,
        document.body,
      )
        : null}

      {/* 8. Toast Feedback Alert */}
      {statusUpdateFeedback && (
        <AdminToast
          type={statusUpdateFeedback.type}
          title={statusUpdateFeedback.title}
          message={statusUpdateFeedback.message}
          onDismiss={() => setStatusUpdateFeedback(null)}
        />
      )}
    </div>
  );
}
