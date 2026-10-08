"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Printer,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  Boxes,
  AlertTriangle,
  RotateCcw,
  Store,
  CreditCard,
  X,
} from "lucide-react";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";

type ReportType = "ALL" | "INVENTORY" | "SALES" | "LOW_STOCK" | "TOP_PRODUCTS";

type CategoryOption = {
  id: string;
  name: string;
};

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

type ReportSummary = {
  totalRevenue: number;
  completedOrders: number;
  totalItemsSold: number;
  stockValue: number;
  retailValue: number;
  activeProducts: number;
  lowStockCount?: number;
};

type ReportBreakdown = Record<string, { count: number; revenue: number }>;

type RecentOrderItem = {
  quantity: number;
  productName: string;
};

type RecentOrder = {
  id: string;
  orderNumber: string;
  totalAmount: string;
  createdAt: string;
  itemCount: number;
  items: RecentOrderItem[];
};

type LowStockItem = {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  sku: string;
  price?: string | number;
  cost?: string | number;
  stockValue?: string | number;
};

type TopProduct = {
  id: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
};

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  cost: string;
  price: string;
  stockValue: string;
};

type ReportState = {
  summary: ReportSummary;
  recentOrders: RecentOrder[];
  lowStock: LowStockItem[];
  topProducts: TopProduct[];
  inventoryItems: InventoryItem[];
  categories: CategoryOption[];
  channelBreakdown: ReportBreakdown;
  paymentBreakdown: ReportBreakdown;
};

function escapeReportStrings(report: ReportState): ReportState {
  return {
    ...report,
    recentOrders: report.recentOrders.map((order) => ({
      ...order,
      orderNumber: escapeHtml(order.orderNumber),
      items: order.items.map((item) => ({ ...item, productName: escapeHtml(item.productName) })),
    })),
    lowStock: report.lowStock.map((item) => ({
      ...item,
      name: escapeHtml(item.name),
      sku: escapeHtml(item.sku),
    })),
    topProducts: report.topProducts.map((item) => ({
      ...item,
      name: escapeHtml(item.name),
      sku: escapeHtml(item.sku),
    })),
    inventoryItems: report.inventoryItems.map((item) => ({
      ...item,
      name: escapeHtml(item.name),
      sku: escapeHtml(item.sku),
    })),
    channelBreakdown: Object.fromEntries(
      Object.entries(report.channelBreakdown).map(([name, values]) => [escapeHtml(name), values]),
    ),
    paymentBreakdown: Object.fromEntries(
      Object.entries(report.paymentBreakdown).map(([name, values]) => [escapeHtml(name), values]),
    ),
  };
}

type PrintScope = {
  periodLabel: string;
  categoryLabel: string;
};

type PrintPreview = {
  reportTitle: string;
  periodLabel: string;
  categoryLabel: string;
  summary: ReportSummary;
};

const initialState: ReportState = {
  summary: {
    totalRevenue: 0,
    completedOrders: 0,
    totalItemsSold: 0,
    stockValue: 0,
    retailValue: 0,
    activeProducts: 0,
    lowStockCount: 0,
  },
  recentOrders: [],
  lowStock: [],
  topProducts: [],
  inventoryItems: [],
  categories: [],
  channelBreakdown: {},
  paymentBreakdown: {},
};

export default function ReportsPage() {
  const [report, setReport] = useState<ReportState>(initialState);
  const [hasLoadedReport, setHasLoadedReport] = useState(false);
  const [settledReportRequestKey, setSettledReportRequestKey] = useState<string | null>(null);
  const [reportLoadFailure, setReportLoadFailure] = useState<{ requestKey: string; message: string } | null>(null);
  const [reportRequestVersion, setReportRequestVersion] = useState(0);
  const [reportType, setReportType] = useState<ReportType>("ALL");
  const [startDate, setStartDate] = useState(() => formatInputDate(new Date()));
  const [endDate, setEndDate] = useState(() => formatInputDate(new Date()));
  const [category, setCategory] = useState("");
  const [activePreset, setActivePreset] = useState<string>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [printStatus, setPrintStatus] = useState<"loading" | "preparing" | "ready" | "error" | null>(null);
  const [printError, setPrintError] = useState("");
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [pdfExportError, setPdfExportError] = useState("");
  const [printPreview, setPrintPreview] = useState<PrintPreview | null>(null);
  const printAbortControllerRef = useRef<AbortController | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const reportRequestKey = JSON.stringify([startDate, endDate, category, reportRequestVersion]);
  const isReportLoading = settledReportRequestKey !== reportRequestKey;
  const reportLoadError = reportLoadFailure?.requestKey === reportRequestKey
    ? reportLoadFailure.message
    : "";

  const fetchReportData = useCallback(
    async (
      selectedStartDate = startDate,
      selectedEndDate = endDate,
      selectedCategory = category,
      signal?: AbortSignal,
    ) => {
      const params = new URLSearchParams();
      if (selectedStartDate) params.set("startDate", selectedStartDate);
      if (selectedEndDate) params.set("endDate", selectedEndDate);
      if (selectedCategory) params.set("category", selectedCategory);

      const response = await fetch(`/api/admin/reports?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Failed to load report data");
      return (await response.json()) as ReportState;
    },
    [category, endDate, startDate]
  );

  const loadReport = useCallback(
    async (
      selectedStartDate = startDate,
      selectedEndDate = endDate,
      selectedCategory = category
    ) => {
      try {
        const data = await fetchReportData(
          selectedStartDate,
          selectedEndDate,
          selectedCategory
        );
        setReport(data);
        setHasLoadedReport(true);
        return data;
      } catch (err) {
        console.error("Reports loading error:", err);
        return null;
      }
    },
    [category, endDate, fetchReportData, startDate]
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = reportRequestKey;

    void fetchReportData(startDate, endDate, category, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setReport(data);
        setHasLoadedReport(true);
        setReportLoadFailure(null);
        setSettledReportRequestKey(requestKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch report", error);
        setReportLoadFailure({
          requestKey,
          message: "We couldn't load this report. Check your connection and try again.",
        });
        setSettledReportRequestKey(requestKey);
      });

    return () => {
      controller.abort();
    };
  }, [category, endDate, fetchReportData, reportRequestKey, startDate]);

  const handleRetryReportLoad = () => {
    setReportRequestVersion((version) => version + 1);
  };

  // Preset handlers
  const handleApplyPreset = (preset: "today" | "7days" | "30days" | "month" | "all") => {
    setActivePreset(preset);
    const today = new Date();
    if (preset === "today") {
      setStartDate(formatInputDate(today));
      setEndDate(formatInputDate(today));
    } else if (preset === "7days") {
      const past = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
      setStartDate(formatInputDate(past));
      setEndDate(formatInputDate(today));
    } else if (preset === "30days") {
      const past = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
      setStartDate(formatInputDate(past));
      setEndDate(formatInputDate(today));
    } else if (preset === "month") {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatInputDate(startOfMonth));
      setEndDate(formatInputDate(today));
    } else if (preset === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleResetFilters = () => {
    setActivePreset("today");
    setStartDate(formatInputDate(new Date()));
    setEndDate(formatInputDate(new Date()));
    setCategory("");
    setSearchQuery("");
  };

  const escapeCsvValue = (value: unknown) => {
    const stringValue = String(value ?? "");
    return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
  };

  // Filtered rows based on search
  const filteredInventoryItems = useMemo(() => {
    if (!searchQuery.trim()) return report.inventoryItems;
    const q = searchQuery.toLowerCase();
    return report.inventoryItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }, [report.inventoryItems, searchQuery]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return report.recentOrders;
    const q = searchQuery.toLowerCase();
    return report.recentOrders.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(q) ||
        order.items.some((item) => item.productName.toLowerCase().includes(q))
    );
  }, [report.recentOrders, searchQuery]);

  const filteredLowStock = useMemo(() => {
    if (!searchQuery.trim()) return report.lowStock;
    const q = searchQuery.toLowerCase();
    return report.lowStock.filter(
      (item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }, [report.lowStock, searchQuery]);

  const filteredTopProducts = useMemo(() => {
    if (!searchQuery.trim()) return report.topProducts;
    const q = searchQuery.toLowerCase();
    return report.topProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [report.topProducts, searchQuery]);

  // PRINT TEMPLATE
  const printOfficialDocument = async (
    title: string,
    subCategory: string,
    content: string,
    scope: PrintScope,
  ): Promise<boolean> => {
    const printFrame = document.createElement("iframe");
    printFrame.setAttribute("aria-hidden", "true");
    printFrame.title = `${title} print preview`;
    printFrame.style.position = "fixed";
    printFrame.style.left = "0";
    printFrame.style.top = "0";
    printFrame.style.width = "100vw";
    printFrame.style.height = "100vh";
    printFrame.style.border = "0";
    printFrame.style.opacity = "0";
    printFrame.style.pointerEvents = "none";
    printFrame.style.zIndex = "-1";
    document.body.appendChild(printFrame);
    printFrameRef.current = printFrame;

    const generatedDate = new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const generatedTime = new Date().toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const safeTitle = escapeHtml(title);
    const safeSubCategory = escapeHtml(subCategory);
    const safePeriodLabel = escapeHtml(scope.periodLabel);
    const safeCategoryLabel = escapeHtml(scope.categoryLabel);

    const header = `
      <header class="report-header">
        <div class="business-block">
          <div class="brand-name">Apayao Pasalubong Center</div>
          <div class="brand-location">San Isidro Sur, Luna, Apayao, Philippines</div>
        </div>
        <div class="report-meta">
          <span class="meta-badge">${safeSubCategory}</span>
          <h1 class="report-title">${safeTitle}</h1>
        </div>
      </header>

      <div class="meta-strip">
        <div><strong>Period</strong><span>${safePeriodLabel}</span></div>
        <div><strong>Category</strong><span>${safeCategoryLabel}</span></div>
        <div><strong>Generated</strong><span>${generatedDate} at ${generatedTime}</span></div>
      </div>
    `;

    const styles = `
      @page {
        size: A4 portrait;
        margin: 14mm 15mm;
      }
      * { box-sizing: border-box; }
      html, body { width: auto; min-width: 0; }
      body {
        margin: 0;
        background: #ffffff;
        color: #1f2937;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10pt;
        line-height: 1.4;
      }
      .report-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 12px;
        border-bottom: 2px solid #047857;
        margin-bottom: 14px;
      }
      .business-block { min-width: 0; }
      .brand-name {
        color: #111827;
        font-size: 15pt;
        font-weight: 700;
      }
      .brand-location {
        margin-top: 3px;
        color: #4b5563;
        font-size: 8.5pt;
      }
      .report-meta {
        flex: 0 0 auto;
        text-align: right;
      }
      .meta-badge {
        color: #047857;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .report-title {
        margin: 3px 0 0;
        color: #111827;
        font-size: 16pt;
        font-weight: 700;
      }
      .meta-strip {
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr;
        gap: 12px;
        margin: 0 0 16px;
        padding: 0 0 10px;
        border-bottom: 1px solid #cbd5e1;
        background: #ffffff;
        color: #374151;
        font-size: 9pt;
      }
      .meta-strip div { display: grid; gap: 3px; }
      .meta-strip strong {
        color: #4b5563;
        font-size: 8pt;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
        margin: 0 0 16px;
        border-top: 1px solid #cbd5e1;
        border-bottom: 1px solid #cbd5e1;
      }
      .kpi-card {
        padding: 9px 10px;
        border: 0;
        border-right: 1px solid #d1d5db;
        background: #ffffff;
      }
      .kpi-card:last-child { border-right: 0; }
      .kpi-label {
        color: #4b5563;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .kpi-val {
        margin-top: 4px;
        color: #111827;
        font-size: 12pt;
        font-weight: 700;
      }
      .section-title {
        margin: 18px 0 7px;
        padding-bottom: 5px;
        border-bottom: 1px solid #047857;
        color: #111827;
        font-size: 11pt;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
      }
      th, td {
        padding: 6px 7px;
        border-bottom: 1px solid #d1d5db;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      th {
        background: #f3f4f6;
        color: #374151;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      td { font-size: 9pt; }
      code { font-family: "Courier New", monospace; font-size: 8.5pt; }
      td.right, th.right { text-align: right; }
      .report-footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 24px;
        padding-top: 7px;
        border-top: 1px solid #cbd5e1;
        color: #4b5563;
        font-size: 8pt;
      }
      @media screen {
        body { visibility: hidden; }
      }
      @media print {
        body { visibility: visible; }
        .report-header, .meta-strip, .kpi-grid { break-inside: avoid; page-break-inside: avoid; }
        .section-title { break-after: avoid; page-break-after: avoid; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        table { break-inside: auto; page-break-inside: auto; }
      }
    `;

    const printDocument = printFrame.contentDocument;
    const printWindow = printFrame.contentWindow;
    if (!printDocument || !printWindow) {
      printFrame.remove();
      if (printFrameRef.current === printFrame) printFrameRef.current = null;
      return false;
    }

    printDocument.open();
    printDocument.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${safeTitle} - Apayao Pasalubong Center</title>
          <style>${styles}</style>
        </head>
        <body>
          ${header}
          ${content}
          <footer class="report-footer">
            <span>Apayao Pasalubong Center</span>
            <span>Generated from current system records</span>
          </footer>
        </body>
      </html>
    `);
    printDocument.close();

    if (printAbortControllerRef.current?.signal.aborted) {
      printFrame.remove();
      if (printFrameRef.current === printFrame) printFrameRef.current = null;
      return false;
    }
    setPrintStatus("ready");
    return true;
  };

  const closePrintModal = useCallback(() => {
    printAbortControllerRef.current?.abort();
    printAbortControllerRef.current = null;
    printFrameRef.current?.remove();
    printFrameRef.current = null;
    setPrintPreview(null);
    setPrintError("");
    setPrintStatus(null);
  }, []);

  useEffect(() => {
    if (!printStatus) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePrintModal();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closePrintModal, printStatus]);

  const handleConfirmPrint = () => {
    const printFrame = printFrameRef.current;
    const printWindow = printFrame?.contentWindow;
    if (!printFrame || !printWindow) {
      setPrintStatus("error");
      setPrintError("The report preview is no longer available. Prepare the report again.");
      return;
    }

    const removePrintFrame = () => {
      printFrame.remove();
      if (printFrameRef.current === printFrame) printFrameRef.current = null;
    };

    const pageCover = document.createElement("div");
    pageCover.setAttribute("aria-hidden", "true");
    pageCover.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "background:#f8fafc",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(pageCover);

    let cleanupTimer: number | null = null;
    const cleanupPrint = () => {
      if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
      pageCover.remove();
      removePrintFrame();
    };

    try {
      printWindow.addEventListener("afterprint", cleanupPrint, { once: true });
      cleanupTimer = window.setTimeout(cleanupPrint, 120_000);
      printWindow.focus();
      setPrintError("");
      setPrintStatus(null);
      setPrintPreview(null);
      printWindow.print();
    } catch (error) {
      console.error("Unable to open the browser print dialog:", error);
      setPrintStatus("error");
      setPrintError("Your browser couldn't open printing. Use its menu and choose Print or Save as PDF.");
      cleanupPrint();
    }
  };

  // PRINT DISPATCHER BASED ON REPORT TYPE
  const handlePrintCurrentReport = async () => {
    const controller = new AbortController();
    printAbortControllerRef.current?.abort();
    printAbortControllerRef.current = controller;
    setPrintStatus("loading");
    setPrintError("");
    setPrintPreview(null);
    printFrameRef.current?.remove();
    printFrameRef.current = null;

    const selectedStartDate = startDate;
    const selectedEndDate = endDate;
    const selectedCategory = category;
    const selectedReportType = reportType;

    try {
      const loadedReport = await fetchReportData(
        selectedStartDate,
        selectedEndDate,
        selectedCategory,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setReport(loadedReport);
      setHasLoadedReport(true);
      const data = escapeReportStrings(loadedReport);

      const periodLabel = selectedStartDate && selectedEndDate
        ? `${selectedStartDate} to ${selectedEndDate}`
        : selectedStartDate
          ? `From ${selectedStartDate}`
          : selectedEndDate
            ? `Until ${selectedEndDate}`
            : "All Record History";
      const categoryLabel = selectedCategory
        ? loadedReport.categories.find((item) => item.id === selectedCategory)?.name ?? "Selected category"
        : "All catalog categories";
      const reportTitle = {
        INVENTORY: "Inventory Report",
        SALES: "Sales Report",
        LOW_STOCK: "Low Stock Alerts Report",
        TOP_PRODUCTS: "Top Products Report",
        ALL: "Business Summary Report",
      }[selectedReportType];

      setPrintPreview({ reportTitle, periodLabel, categoryLabel, summary: loadedReport.summary });
      setPrintStatus("preparing");
      const printScope = { periodLabel, categoryLabel };

      if (selectedReportType === "INVENTORY") {
      const rows = data.inventoryItems.length > 0
        ? data.inventoryItems.map(
            (item) => `
          <tr>
            <td>${item.name}</td>
            <td><code>${item.sku}</code></td>
            <td class="right">${item.stock}</td>
            <td class="right">₱${Number(item.cost).toFixed(2)}</td>
            <td class="right">₱${Number(item.price).toFixed(2)}</td>
            <td class="right"><strong>₱${Number(item.stockValue).toFixed(2)}</strong></td>
          </tr>
        `
          ).join("")
        : `<tr><td colspan="6" style="text-align:center;color:#64748b;">No inventory items recorded.</td></tr>`;

      const content = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Cost Valuation</div><div class="kpi-val">₱${Number(data.summary.stockValue).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Retail Potential</div><div class="kpi-val">₱${Number(data.summary.retailValue).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Cataloged Products</div><div class="kpi-val">${data.summary.activeProducts} items</div></div>
          <div class="kpi-card"><div class="kpi-label">Low Stock Urgency</div><div class="kpi-val">${data.lowStock.length} items</div></div>
        </div>
        <h2 class="section-title">Inventory and valuation</h2>
        <table>
          <thead>
            <tr>
              <th>Product / Variant Name</th>
              <th>SKU</th>
              <th class="right">Stock Units</th>
              <th class="right">Unit Cost</th>
              <th class="right">Retail Price</th>
              <th class="right">Stock Valuation</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      if (!(await printOfficialDocument("Inventory Report", "Inventory Summary", content, printScope))) {
        throw new Error("The print preview could not be created.");
      }
    } else if (selectedReportType === "SALES") {
      const rows = data.recentOrders.length > 0
        ? data.recentOrders.map((order) => {
            const itemsSummary = order.items
              .map((i) => `${i.productName} (x${i.quantity})`)
              .join(", ");
            const totalQty = order.items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
            return `
            <tr>
              <td><strong>${order.orderNumber}</strong></td>
              <td>${new Date(order.createdAt).toLocaleDateString()}</td>
              <td>${itemsSummary || "-"}</td>
              <td class="right">${totalQty}</td>
              <td class="right"><strong>₱${Number(order.totalAmount).toFixed(2)}</strong></td>
            </tr>
          `;
          }).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No sales transactions for this period.</td></tr>`;

      const channelRows = Object.entries(data.channelBreakdown)
        .map(
          ([channel, values]) =>
            `<tr><td>${channel}</td><td class="right">${values.count}</td><td class="right"><strong>₱${Number(values.revenue).toFixed(2)}</strong></td></tr>`
        )
        .join("");

      const content = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-val">₱${Number(data.summary.totalRevenue).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Completed Transactions</div><div class="kpi-val">${data.summary.completedOrders} orders</div></div>
          <div class="kpi-card"><div class="kpi-label">Units Sold</div><div class="kpi-val">${data.summary.totalItemsSold} units</div></div>
          <div class="kpi-card"><div class="kpi-label">Avg. Order Value</div><div class="kpi-val">₱${data.summary.completedOrders > 0 ? (data.summary.totalRevenue / data.summary.completedOrders).toFixed(2) : "0.00"}</div></div>
        </div>

        <h2 class="section-title">Sales by channel</h2>
        <table>
          <thead><tr><th>Sales Channel</th><th class="right">Completed Orders</th><th class="right">Gross Sales</th></tr></thead>
          <tbody>${channelRows || `<tr><td colspan="3">No channel sales found.</td></tr>`}</tbody>
        </table>

        <h2 class="section-title">Completed orders</h2>
        <table>
          <thead>
            <tr>
              <th>Order Number</th>
              <th>Date</th>
              <th>Items Purchased</th>
              <th class="right">Qty</th>
              <th class="right">Order Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      if (!(await printOfficialDocument("Sales Report", "Sales Summary", content, printScope))) {
        throw new Error("The print preview could not be created.");
      }
    } else if (selectedReportType === "LOW_STOCK") {
      const rows = data.lowStock.length > 0
        ? data.lowStock.map(
            (item) => `
          <tr>
            <td>${item.name}</td>
            <td><code>${item.sku}</code></td>
            <td class="right" style="color:#b91c1c;font-weight:700;">${item.stock}</td>
            <td class="right">${item.minStock}</td>
            <td class="right" style="color:#b91c1c;">${item.minStock - item.stock > 0 ? `-${item.minStock - item.stock}` : "0"} units</td>
          </tr>
        `
          ).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#64748b;">All products are above minimum threshold.</td></tr>`;

      const content = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Items at Critical Level</div><div class="kpi-val" style="color:#b91c1c;">${data.lowStock.length} items</div></div>
          <div class="kpi-card"><div class="kpi-label">Catalog Products</div><div class="kpi-val">${data.summary.activeProducts} items</div></div>
          <div class="kpi-card"><div class="kpi-label">Inventory Cost Value</div><div class="kpi-val">₱${Number(data.summary.stockValue).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Stock Status</div><div class="kpi-val">${data.lowStock.length > 0 ? "Reorder needed" : "All items stocked"}</div></div>
        </div>
        <h2 class="section-title">Low-stock items</h2>
        <table>
          <thead>
            <tr>
              <th>Product / Variant</th>
              <th>SKU</th>
              <th class="right">Current Stock</th>
              <th class="right">Min Threshold</th>
              <th class="right">Reorder Deficit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      if (!(await printOfficialDocument("Low Stock Report", "Stock Monitoring", content, printScope))) {
        throw new Error("The print preview could not be created.");
      }
    } else if (selectedReportType === "TOP_PRODUCTS") {
      const rows = data.topProducts.length > 0
        ? data.topProducts.map(
            (item, index) => `
          <tr>
            <td><strong>#${index + 1}</strong></td>
            <td>${item.name}</td>
            <td><code>${item.sku}</code></td>
            <td class="right"><strong>${item.unitsSold}</strong></td>
            <td class="right"><strong>₱${Number(item.revenue).toFixed(2)}</strong></td>
          </tr>
        `
          ).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No product sales recorded in this period.</td></tr>`;

      const content = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Best Seller Items</div><div class="kpi-val">${data.topProducts.length} items</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Units Sold</div><div class="kpi-val">${data.summary.totalItemsSold} units</div></div>
          <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-val">₱${Number(data.summary.totalRevenue).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Average Order Value</div><div class="kpi-val">₱${data.summary.completedOrders > 0 ? (data.summary.totalRevenue / data.summary.completedOrders).toFixed(2) : "0.00"}</div></div>
        </div>
        <h2 class="section-title">Top products</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Product / Variant</th>
              <th>SKU</th>
              <th class="right">Units Sold</th>
              <th class="right">Gross Sales</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      if (!(await printOfficialDocument("Top Products Report", "Product Summary", content, printScope))) {
        throw new Error("The print preview could not be created.");
      }
    } else {
      // ALL-IN-ONE SUMMARY
      const salesRows = data.recentOrders.map((order) => {
        const products = order.items
          .map((item) => `${item.productName} (x${item.quantity})`)
          .join("<br>");
        const quantity = order.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
        return `<tr><td>${order.orderNumber}</td><td>${new Date(order.createdAt).toLocaleDateString()}</td><td>${products || "-"}</td><td class="right">${quantity}</td><td class="right">₱${Number(order.totalAmount).toFixed(2)}</td></tr>`;
      }).join("");

      const inventoryRows = data.inventoryItems.map(
        (item) =>
          `<tr><td>${item.name}</td><td><code>${item.sku}</code></td><td class="right">${item.stock}</td><td class="right">₱${Number(item.stockValue).toFixed(2)}</td></tr>`
      ).join("");

      const lowStockRows = data.lowStock.map(
        (item) =>
          `<tr><td>${item.name}</td><td><code>${item.sku}</code></td><td class="right" style="color:#b91c1c;">${item.stock}</td><td class="right">${item.minStock}</td></tr>`
      ).join("");

      const topProductRows = data.topProducts.map(
        (item, idx) =>
          `<tr><td>#${idx + 1}</td><td>${item.name}</td><td><code>${item.sku}</code></td><td class="right">${item.unitsSold}</td><td class="right">₱${Number(item.revenue).toFixed(2)}</td></tr>`
      ).join("");

      const channelRows = Object.entries(data.channelBreakdown)
        .map(
          ([label, values]) =>
            `<tr><td>${label}</td><td class="right">${values.count}</td><td class="right">₱${Number(values.revenue).toFixed(2)}</td></tr>`
        )
        .join("");

      const paymentRows = Object.entries(data.paymentBreakdown)
        .map(
          ([label, values]) =>
            `<tr><td>${label}</td><td class="right">${values.count}</td><td class="right">₱${Number(values.revenue).toFixed(2)}</td></tr>`
        )
        .join("");

      const content = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Revenue</div><div class="kpi-val">₱${Number(data.summary.totalRevenue).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Completed Orders</div><div class="kpi-val">${data.summary.completedOrders}</div></div>
          <div class="kpi-card"><div class="kpi-label">Units Sold</div><div class="kpi-val">${data.summary.totalItemsSold}</div></div>
          <div class="kpi-card"><div class="kpi-label">Cost Valuation</div><div class="kpi-val">₱${Number(data.summary.stockValue).toFixed(2)}</div></div>
        </div>

        <h2 class="section-title">Sales and payments</h2>
        <table>
          <thead><tr><th>Channel</th><th class="right">Orders</th><th class="right">Revenue</th></tr></thead>
          <tbody>${channelRows || `<tr><td colspan="3">No channel records.</td></tr>`}</tbody>
        </table>
        <table style="margin-top:12px;">
          <thead><tr><th>Payment Method</th><th class="right">Transactions</th><th class="right">Collected Revenue</th></tr></thead>
          <tbody>${paymentRows || `<tr><td colspan="3">No payment records.</td></tr>`}</tbody>
        </table>

        <h2 class="section-title">Completed orders</h2>
        <table>
          <thead><tr><th>Order #</th><th>Date</th><th>Items</th><th class="right">Units</th><th class="right">Total</th></tr></thead>
          <tbody>${salesRows || `<tr><td colspan="5">No completed sales.</td></tr>`}</tbody>
        </table>

        <h2 class="section-title">Inventory</h2>
        <table>
          <thead><tr><th>Product / Variant</th><th>SKU</th><th class="right">Stock</th><th class="right">Stock Value</th></tr></thead>
          <tbody>${inventoryRows || `<tr><td colspan="4">No inventory records.</td></tr>`}</tbody>
        </table>

        <h2 class="section-title">Low stock</h2>
        <table>
          <thead><tr><th>Product / Variant</th><th>SKU</th><th class="right">Current Stock</th><th class="right">Minimum Threshold</th></tr></thead>
          <tbody>${lowStockRows || `<tr><td colspan="4">No low stock items.</td></tr>`}</tbody>
        </table>

        <h2 class="section-title">Top products</h2>
        <table>
          <thead><tr><th>Rank</th><th>Product / Variant</th><th>SKU</th><th class="right">Units Sold</th><th class="right">Revenue</th></tr></thead>
          <tbody>${topProductRows || `<tr><td colspan="5">No product sales recorded.</td></tr>`}</tbody>
        </table>
      `;

      if (!(await printOfficialDocument("Business Summary Report", "Business Summary", content, printScope))) {
        throw new Error("The print preview could not be created.");
      }
    }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Unable to prepare report for printing:", error);
      setPrintStatus("error");
      setPrintError("We couldn't prepare this report for printing. Check your connection and try again.");
    } finally {
      if (printAbortControllerRef.current === controller) {
        printAbortControllerRef.current = null;
      }
    }
  };

  // CSV EXPORT DISPATCHER BASED ON REPORT TYPE
  const handleExportCsv = async () => {
    const data = await loadReport(startDate, endDate, category);
    if (!data) return;

    const lines: string[] = [];
    const addSection = (title: string, headers: string[], rows: Array<Array<unknown>>) => {
      lines.push(title, headers.map(escapeCsvValue).join(","));
      rows.forEach((row) => lines.push(row.map(escapeCsvValue).join(",")));
      lines.push("");
    };

    let filename = "business-summary-report.csv";

    addSection("Report Header", ["Field", "Value"], [
      ["Report Type", reportType],
      ["Period Start", startDate || "All time"],
      ["Period End", endDate || "All time"],
      ["Category", category ? data.categories.find((item) => item.id === category)?.name ?? "Selected" : "All categories"],
      ["Generated At", new Date().toLocaleString("en-PH")],
    ]);

    if (reportType === "INVENTORY") {
      filename = "inventory-valuation-report.csv";
      addSection("Inventory Valuation Snapshot", ["Product / Variant", "SKU", "Stock Units", "Unit Cost", "Retail Price", "Stock Value"], data.inventoryItems.map((item) => [
        item.name,
        item.sku,
        item.stock,
        item.cost,
        item.price,
        item.stockValue,
      ]));
    } else if (reportType === "SALES") {
      filename = "sales-orders-report.csv";
      addSection("Sales Channels", ["Channel", "Orders", "Revenue"], Object.entries(data.channelBreakdown).map(([label, v]) => [label, v.count, v.revenue]));
      addSection("Payment Methods", ["Payment Method", "Orders", "Revenue"], Object.entries(data.paymentBreakdown).map(([label, v]) => [label, v.count, v.revenue]));
      addSection("Completed Sales Orders", ["Order Number", "Date", "Items", "Quantity", "Total Amount"], data.recentOrders.map((order) => [
        order.orderNumber,
        new Date(order.createdAt).toLocaleDateString(),
        order.items.map((i) => `${i.productName} (Qty. ${i.quantity})`).join("; "),
        order.items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0),
        order.totalAmount,
      ]));
    } else if (reportType === "LOW_STOCK") {
      filename = "low-stock-report.csv";
      addSection("Low Stock Alerts", ["Product / Variant", "SKU", "Current Stock", "Minimum Threshold", "Deficit"], data.lowStock.map((item) => [
        item.name,
        item.sku,
        item.stock,
        item.minStock,
        Math.max(item.minStock - item.stock, 0),
      ]));
    } else if (reportType === "TOP_PRODUCTS") {
      filename = "top-products-report.csv";
      addSection("Top Performing Products", ["Rank", "Product / Variant", "SKU", "Units Sold", "Gross Revenue"], data.topProducts.map((item, idx) => [
        idx + 1,
        item.name,
        item.sku,
        item.unitsSold,
        item.revenue,
      ]));
    } else {
      // ALL-IN-ONE
      filename = "complete-business-summary-report.csv";
      addSection("Sales Breakdown", ["Channel", "Orders", "Revenue"], Object.entries(data.channelBreakdown).map(([l, v]) => [l, v.count, v.revenue]));
      addSection("Payment Breakdown", ["Payment method", "Orders", "Revenue"], Object.entries(data.paymentBreakdown).map(([l, v]) => [l, v.count, v.revenue]));
      addSection("Sales Orders", ["Order", "Date", "Items", "Quantity", "Total"], data.recentOrders.map((order) => [
        order.orderNumber,
        new Date(order.createdAt).toLocaleDateString(),
        order.items.map((i) => `${i.productName} (Qty. ${i.quantity})`).join("; "),
        order.items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0),
        order.totalAmount,
      ]));
      addSection("Inventory Snapshot", ["Product / Variant", "SKU", "Stock", "Cost", "Price", "Stock Value"], data.inventoryItems.map((item) => [
        item.name,
        item.sku,
        item.stock,
        item.cost,
        item.price,
        item.stockValue,
      ]));
      addSection("Low Stock Snapshot", ["Product / Variant", "SKU", "Current Stock", "Minimum Stock"], data.lowStock.map((item) => [
        item.name,
        item.sku,
        item.stock,
        item.minStock,
      ]));
      addSection("Top Products", ["Product / Variant", "SKU", "Units Sold", "Revenue"], data.topProducts.map((item) => [
        item.name,
        item.sku,
        item.unitsSold,
        item.revenue,
      ]));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    setIsPdfExporting(true);
    setPdfExportError("");

    try {
      const selectedStartDate = startDate;
      const selectedEndDate = endDate;
      const selectedCategory = category;
      const selectedReportType = reportType;
      const data = await fetchReportData(selectedStartDate, selectedEndDate, selectedCategory);
      setReport(data);
      setHasLoadedReport(true);

      const periodLabel = selectedStartDate && selectedEndDate
        ? `${selectedStartDate} to ${selectedEndDate}`
        : selectedStartDate
          ? `From ${selectedStartDate}`
          : selectedEndDate
            ? `Until ${selectedEndDate}`
            : "All Record History";
      const categoryLabel = selectedCategory
        ? data.categories.find((item) => item.id === selectedCategory)?.name ?? "Selected category"
        : "All catalog categories";
      const reportTitle = {
        INVENTORY: "Generate Report",
        SALES: "Generate Report",
        LOW_STOCK: "Generate Report",
        TOP_PRODUCTS: "Generate Report",
        ALL: "Generate Report",
      }[selectedReportType];

      const [{ pdf }, { default: ReportPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/admin/report-pdf-document"),
      ]);
      const document = createElement(ReportPdfDocument, {
        report: data,
        reportType: selectedReportType,
        reportTitle,
        periodLabel,
        categoryLabel,
        generatedAt: new Date(),
      }) as unknown as Parameters<typeof pdf>[0];
      const blob = await pdf(document).toBlob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      console.error("Unable to export PDF report:", error);
      setPdfExportError("We couldn't create the PDF. Please try again or use Print / Export CSV.");
    } finally {
      setIsPdfExporting(false);
    }
  };

  const currentReportLabel = useMemo(() => {
    switch (reportType) {
      case "INVENTORY":
        return "Inventory Report";
      case "SALES":
        return "Sales Report";
      case "LOW_STOCK":
        return "Low Stock Alerts Report";
      case "TOP_PRODUCTS":
        return "Top Products Report";
      default:
        return "Full Summary Report";
    }
  }, [reportType]);

  return (
    <div className="space-y-6 pb-16 text-slate-900 dark:text-slate-100">
      {/* 1. Header & Quick Actions */}
      <header className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-3 flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold tracking-tight text-slate-950 dark:text-white text-2xl">
                Reports
              </h1>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                {currentReportLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Generate, preview, and export audited financial, sales, and inventory reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePrintCurrentReport()}
              disabled={isReportLoading || printStatus !== null || isPdfExporting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {printStatus === "loading" || printStatus === "preparing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              <span>{printStatus === "loading" || printStatus === "preparing" ? "Preparing..." : `Print ${currentReportLabel}`}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={isReportLoading || printStatus !== null || isPdfExporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isReportLoading || printStatus !== null || isPdfExporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950"
            >
              {isPdfExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              <span>{isPdfExporting ? "Creating PDF..." : "Download PDF"}</span>
            </button>
          </div>
        </div>
        {pdfExportError && (
          <p className="mt-3 text-xs font-medium text-rose-700 dark:text-rose-300" role="alert">
            {pdfExportError}
          </p>
        )}

        {/* 2. Report Scope Tabs (Filter by Report) */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  {
                    id: "ALL",
                    label: "Full Summary Reports",
                    icon: BarChart3,
                    activeClass: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200",
                    idleClass: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60",
                  },
                  {
                    id: "INVENTORY",
                    label: "Inventory Reports",
                    icon: Boxes,
                    activeClass: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-200",
                    idleClass: "border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60",
                  },
                  {
                    id: "SALES",
                    label: "Sales Reports",
                    icon: ShoppingCart,
                    activeClass: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-950/70 dark:text-violet-200",
                    idleClass: "border-violet-200 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/60",
                  },
                  {
                    id: "LOW_STOCK",
                    label: "Low Stock Alerts Reports",
                    icon: AlertTriangle,
                    activeClass: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200",
                    idleClass: "border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60",
                  },
                  {
                    id: "TOP_PRODUCTS",
                    label: "Top Products Reports",
                    icon: TrendingUp,
                    activeClass: "border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-700 dark:bg-teal-950/70 dark:text-teal-200",
                    idleClass: "border-teal-200 bg-teal-50/60 text-teal-700 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/60",
                  },
                ] as const
              ).map((tab) => {
                const isActive = reportType === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setReportType(tab.id)}
                    className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center text-xs tracking-tight transition ${
                      isActive
                        ? `${tab.activeClass} font-semibold shadow-sm`
                        : `${tab.idleClass} font-medium`
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quick Period Presets
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "today", label: "Today" },
                { id: "7days", label: "Last 7 Days" },
                { id: "30days", label: "Last 30 Days" },
                { id: "month", label: "This Month" },
                { id: "all", label: "All History" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset.id as "today" | "7days" | "30days" | "month" | "all")}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    activePreset === preset.id
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid w-full grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800/80">
            <div className="min-w-0">
              <label
                htmlFor="report-start-date"
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
              >
                <CalendarRange className="h-3 w-3" />
                Start Date
              </label>
              <input
                id="report-start-date"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="report-end-date"
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
              >
                <CalendarRange className="h-3 w-3" />
                End Date
              </label>
              <input
                id="report-end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                max={formatInputDate(new Date())}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="report-category"
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Category
              </label>
              <select
                id="report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">All Categories</option>
                {report.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleResetFilters}
                title="Reset all filters"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-black px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-black dark:text-white dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {hasLoadedReport && isReportLoading ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span>Refreshing report data for the selected dates and category…</span>
        </div>
      ) : null}

      {hasLoadedReport && reportLoadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          <span>{reportLoadError} The previous report is still shown.</span>
          <button type="button" onClick={() => void handleRetryReportLoad()} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900/40">
            Try again
          </button>
        </div>
      ) : null}

      {!hasLoadedReport ? (
        isReportLoading ? (
          <section className="space-y-5 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-busy="true" aria-live="polite" role="status">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Loader2 className="h-5 w-5 animate-spin" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Loading report data</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Fetching the latest figures for your selected report.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-9 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />)}
            </div>
          </section>
        ) : reportLoadError ? (
          <section className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900/60 dark:bg-slate-900" role="alert">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">Report unavailable</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{reportLoadError}</p>
            <button type="button" onClick={() => void handleRetryReportLoad()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </section>
        ) : null
      ) : (
      <>
      {/* 5. Interactive Report Workspace (Changes based on Report Type) */}

      {/* VIEW A: ALL-IN-ONE SUMMARY */}
      {reportType === "ALL" && (
        <div className="space-y-6">
          {/* Executive Distribution Widgets */}
          <div className="grid gap-6 grid-cols-2">
            {/* Sales Channel Split */}
            <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Sales Channel Distribution
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setReportType("SALES")}
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  View Sales Ledger →
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Object.entries(report.channelBreakdown).map(([channel, values]) => (
                  <div
                    key={channel}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/60"
                  >
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {channel}
                    </span>
                    <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                      {formatCurrency(values.revenue)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {values.count} completed orders
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Payment Method Distribution */}
            <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Payment Collection Breakdown
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  {Object.keys(report.paymentBreakdown).length} methods active
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {Object.entries(report.paymentBreakdown).map(([method, values]) => (
                  <div
                    key={method}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-800/60"
                  >
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {method}
                    </span>
                    <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                      {formatCurrency(values.revenue)}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {values.count} txns
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Quick Previews: Top Products & Critical Stock */}
          <div className="grid gap-6 grid-cols-2">
            {/* Top 5 Products Preview */}
            <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Top Selling Products
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setReportType("TOP_PRODUCTS")}
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Full Leaderboard →
                </button>
              </div>
              <div className="mt-4 space-y-2.5">
                {report.topProducts.slice(0, 5).map((prod, idx) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold dark:bg-slate-800">
                        #{idx + 1}
                      </span>
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {prod.name}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatCurrency(prod.revenue)}
                      </span>
                      <span className="ml-1.5 text-[11px] text-slate-500">
                        ({prod.unitsSold} sold)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Low Stock Highlights Preview */}
            <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Critical Low-Stock Alerts
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setReportType("LOW_STOCK")}
                  className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
                >
                  View All Alerts →
                </button>
              </div>
              <div className="mt-4 space-y-2.5">
                {report.lowStock.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-amber-50/50 p-2.5 text-xs dark:border-amber-900/40 dark:bg-amber-950/20"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        SKU: {item.sku} · Min Threshold: {item.minStock}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                      {item.stock} left
                    </span>
                  </div>
                ))}
                {report.lowStock.length === 0 && (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No low stock items. All inventory levels healthy.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* VIEW B: INVENTORY VALUATION ONLY */}
      {reportType === "INVENTORY" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-3 border-b border-slate-100 flex-row items-center justify-between dark:border-slate-800 p-5">
            <div>
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Inventory Valuation Report
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Detailed valuation breakdown of all catalog products and variants on hand
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Product / Variant Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Stock Units</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Retail Price</th>
                  <th className="px-4 py-3 text-right">Total Stock Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInventoryItems.length > 0 ? (
                  filteredInventoryItems.map((item) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-800">
                          {item.sku}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                        {item.stock}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {formatCurrency(Number(item.cost))}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {formatCurrency(Number(item.price))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(Number(item.stockValue))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-500">
                      No inventory items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>Showing {filteredInventoryItems.length} inventory records</span>
            <span className="font-bold text-slate-900 dark:text-white">
              Total Valuation: {formatCurrency(report.summary.stockValue)}
            </span>
          </div>
        </section>
      )}

      {/* VIEW C: SALES & ORDERS ONLY */}
      {reportType === "SALES" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-3 border-b border-slate-100 flex-row items-center justify-between dark:border-slate-800 p-5">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Completed Sales Orders Ledger
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Audited record of all completed orders across the evaluated timeframe
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search order # or item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Items Purchased</th>
                  <th className="px-4 py-3 text-right">Total Units</th>
                  <th className="px-4 py-3 text-right">Order Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => {
                    const totalQty = order.items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
                    return (
                      <tr
                        key={order.id}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {order.orderNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {order.items.map((i) => `${i.productName} (x${i.quantity})`).join(", ")}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">
                          {totalQty}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                          {formatCurrency(Number(order.totalAmount))}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                      No completed orders recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>Showing {filteredOrders.length} completed transactions</span>
            <span className="font-bold text-slate-900 dark:text-white">
              Gross Volume: {formatCurrency(report.summary.totalRevenue)}
            </span>
          </div>
        </section>
      )}

      {/* VIEW D: LOW STOCK ALERTS ONLY */}
      {reportType === "LOW_STOCK" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-3 border-b border-slate-100 flex-row items-center justify-between dark:border-slate-800 p-5">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Critical Stock & Replenishment Report
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Items currently at or below minimum threshold requiring purchase orders
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Product / Variant Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Current Stock</th>
                  <th className="px-4 py-3 text-right">Min Threshold</th>
                  <th className="px-4 py-3 text-right">Replenishment Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLowStock.length > 0 ? (
                  filteredLowStock.map((item) => {
                    const deficit = Math.max(item.minStock - item.stock, 0);
                    return (
                      <tr
                        key={item.id}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {item.sku}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                          {item.stock}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                          {item.minStock}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">
                          {deficit > 0 ? `-${deficit} units` : "At Minimum"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                      All inventory stocks are above minimum threshold.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>Critical Items: {filteredLowStock.length}</span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              Action: Generate Supplier Purchase Orders
            </span>
          </div>
        </section>
      )}

      {/* VIEW E: TOP PRODUCTS ONLY */}
      {reportType === "TOP_PRODUCTS" && (
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-3 border-b border-slate-100 flex-row items-center justify-between dark:border-slate-800 p-5">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Top Selling Products Leaderboard
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Products ranked by sales volume and gross revenue contribution
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Product / Variant Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Units Sold</th>
                  <th className="px-4 py-3 text-right">Gross Sales Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTopProducts.length > 0 ? (
                  filteredTopProducts.map((item, index) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-bold text-slate-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] dark:bg-slate-800">
                          #{index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                        {item.unitsSold}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(Number(item.revenue))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                      No product sales recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>Showing top {filteredTopProducts.length} best sellers</span>
            <span className="font-bold text-slate-900 dark:text-white">
              Total Units Dispensed: {report.summary.totalItemsSold}
            </span>
          </div>
        </section>
      )}
      </>
      )}

      {printStatus ? (
        <AdminModalPortal>
          <div
            className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && printStatus !== "preparing") closePrintModal();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-print-dialog-title"
              aria-busy={printStatus === "loading" || printStatus === "preparing"}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Print center</p>
                    <h2 id="report-print-dialog-title" className="mt-0.5 truncate text-base font-semibold text-slate-950 dark:text-white">
                      {printPreview?.reportTitle ?? currentReportLabel}
                    </h2>
                  </div>
                </div>
                <button type="button" onClick={closePrintModal} aria-label="Close print preview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 dark:hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="p-5 sm:p-6">
                {printStatus === "loading" ? (
                  <div className="py-4 text-center" role="status" aria-live="polite">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Loader2 className="h-7 w-7 animate-spin" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">Loading report data</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">We’re getting the latest figures for your date range and category. You can cancel while it loads.</p>
                    <div className="mx-auto mt-5 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-500" />
                    </div>
                  </div>
                ) : printStatus === "preparing" ? (
                  <div className="py-4 text-center" role="status" aria-live="polite">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      <Loader2 className="h-7 w-7 animate-spin" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">Preparing print preview</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">The report is ready. We’re finishing the page layout and loading the logo.</p>
                  </div>
                ) : printStatus === "ready" && printPreview ? (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5" /> Your report is ready
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose Print or Save as PDF in your device’s print dialog.</p>
                    <dl className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/50 sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Period</dt>
                        <dd className="mt-1 wrap-break-word font-medium text-slate-900 dark:text-slate-100">{printPreview.periodLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</dt>
                        <dd className="mt-1 wrap-break-word font-medium text-slate-900 dark:text-slate-100">{printPreview.categoryLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completed sales</dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{printPreview.summary.completedOrders.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Revenue</dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(printPreview.summary.totalRevenue)}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="py-3" role="alert">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                      <AlertCircle className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">Couldn’t prepare the report</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{printError || "Check your connection, then try again."}</p>
                  </div>
                )}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/40 sm:flex-row sm:justify-end sm:px-6">
                {printStatus === "error" ? (
                  <>
                    <button type="button" onClick={closePrintModal} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Close</button>
                    <button type="button" onClick={() => void handlePrintCurrentReport()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                      <RotateCcw className="h-4 w-4" /> Try again
                    </button>
                  </>
                ) : printStatus === "ready" ? (
                  <>
                    <button type="button" onClick={closePrintModal} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
                    <button type="button" onClick={handleConfirmPrint} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                      <Printer className="h-4 w-4" /> Print report
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={closePrintModal} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto">Cancel</button>
                )}
              </footer>
            </section>
          </div>
        </AdminModalPortal>
      ) : null}
    </div>
  );
}
