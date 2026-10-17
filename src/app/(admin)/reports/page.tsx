"use client";
import { adminFetch, invalidateCurrentAdminApiPaths } from "@/lib/admin-data-cache";

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
import {
  filterReportDocumentData,
  formatReportGeneratedAt,
  getReportPeriodLabel,
  getReportSections,
  getReportSummaryRows,
  getReportTitle,
  isReportNumericHeader,
  type DirectStockOutReportData,
  type ReportType,
} from "@/lib/report-document";
import {
  DIRECT_STOCK_OUT_REASON_LABELS,
  DIRECT_STOCK_OUT_REASON_VALUES,
  getDirectStockOutReasonLabel,
} from "@/lib/direct-stock-out";

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
  grossProfit: number;
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
  sku: string;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  grossProfit: number;
};

type RecentOrder = {
  id: string;
  orderNumber: string;
  totalAmount: string;
  grossProfit: number;
  completedAt: string;
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
  business: {
    name: string;
    address: string;
  };
  summary: ReportSummary;
  recentOrders: RecentOrder[];
  lowStock: LowStockItem[];
  topProducts: TopProduct[];
  inventoryItems: InventoryItem[];
  categories: CategoryOption[];
  channelBreakdown: ReportBreakdown;
  paymentBreakdown: ReportBreakdown;
  directStockOut?: DirectStockOutReportData;
};

type DirectStockOutResponse = DirectStockOutReportData & {
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
};

function filterDirectStockOutData(data: DirectStockOutReportData, searchTerm: string): DirectStockOutReportData {
  const query = searchTerm.trim().toLocaleLowerCase();
  const transactions = query
    ? data.transactions.filter((record) => [
        record.productDisplayName,
        record.variantSku ?? "",
        getDirectStockOutReasonLabel(record.reason),
        record.remarks ?? "",
        record.performedByName ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(query)))
    : data.transactions;

  const groups = new Map<string, DirectStockOutReportData["reasonBreakdown"][number]>();
  const summary = transactions.reduce((totals, record) => {
    const group = groups.get(record.reason) ?? {
      reason: record.reason,
      entries: 0,
      units: 0,
      estimatedValue: 0,
      unvaluedEntries: 0,
    };
    group.entries += 1;
    group.units += record.quantity;
    if (record.estimatedLossValue == null) group.unvaluedEntries += 1;
    else group.estimatedValue += record.estimatedLossValue;
    groups.set(record.reason, group);

    return {
      entries: totals.entries + 1,
      units: totals.units + record.quantity,
      estimatedValue: totals.estimatedValue + (record.estimatedLossValue ?? 0),
      unvaluedEntries: totals.unvaluedEntries + (record.estimatedLossValue == null ? 1 : 0),
    };
  }, { entries: 0, units: 0, estimatedValue: 0, unvaluedEntries: 0 });

  return { summary, reasonBreakdown: [...groups.values()], transactions };
}

type PrintScope = {
  periodLabel: string;
  categoryLabel: string;
  searchLabel: string;
  generatedAt: string;
  businessName: string;
  businessAddress: string;
};

type PrintPreview = {
  reportTitle: string;
  periodLabel: string;
  categoryLabel: string;
  searchLabel: string;
};

const initialState: ReportState = {
  business: {
    name: "APAYAO PASALUBONG CENTER",
    address: "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
  },
  summary: {
    totalRevenue: 0,
    grossProfit: 0,
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
  const [directStockOutReason, setDirectStockOutReason] = useState("");
  const [directStockOutPage, setDirectStockOutPage] = useState(1);
  const [directStockOutRefreshVersion, setDirectStockOutRefreshVersion] = useState(0);
  const [directStockOutReport, setDirectStockOutReport] = useState<DirectStockOutResponse | null>(null);
  const [settledDirectStockOutRequestKey, setSettledDirectStockOutRequestKey] = useState<string | null>(null);
  const [directStockOutFailure, setDirectStockOutFailure] = useState<{ requestKey: string; message: string } | null>(null);
  const [directStockOutExportError, setDirectStockOutExportError] = useState("");
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
  const directStockOutRequestKey = JSON.stringify([
    startDate,
    endDate,
    directStockOutReason,
    directStockOutPage,
    directStockOutRefreshVersion,
  ]);
  const isDirectStockOutLoading = reportType === "DIRECT_STOCK_OUT" &&
    settledDirectStockOutRequestKey !== directStockOutRequestKey;
  const directStockOutError = (
    directStockOutFailure?.requestKey === directStockOutRequestKey
      ? directStockOutFailure.message
      : ""
  ) || directStockOutExportError;

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

      const response = await adminFetch(`/api/admin/reports?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Failed to load report data");
      return (await response.json()) as ReportState;
    },
    [category, endDate, startDate]
  );

  const fetchDirectStockOutData = useCallback(async (
    selectedStartDate = startDate,
    selectedEndDate = endDate,
    selectedReason = directStockOutReason,
    page = directStockOutPage,
    exportAll = false,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    if (selectedStartDate) params.set("startDate", selectedStartDate);
    if (selectedEndDate) params.set("endDate", selectedEndDate);
    if (selectedReason) params.set("reason", selectedReason);
    if (exportAll) params.set("export", "1");
    else params.set("page", String(page));

    const response = await adminFetch(`/api/admin/reports/direct-stock-out?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message ?? "Unable to load the direct stock-out report.");
    }
    return data as DirectStockOutResponse;
  }, [directStockOutPage, directStockOutReason, endDate, startDate]);

  useEffect(() => {
    if (reportType !== "DIRECT_STOCK_OUT") return;
    const controller = new AbortController();
    const requestKey = directStockOutRequestKey;

    void fetchDirectStockOutData(startDate, endDate, directStockOutReason, directStockOutPage, false, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDirectStockOutReport(data);
        setDirectStockOutFailure(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load direct stock-out report", error);
        setDirectStockOutFailure({
          requestKey,
          message: error instanceof Error ? error.message : "Unable to load the direct stock-out report.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledDirectStockOutRequestKey(requestKey);
      });

    return () => controller.abort();
  }, [directStockOutPage, directStockOutReason, directStockOutRefreshVersion, directStockOutRequestKey, endDate, fetchDirectStockOutData, reportType, startDate]);

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

  useEffect(() => {
    const handleLiveEvent = (event: Event) => {
      const message = (event as CustomEvent<{ type?: string }>).detail;
      if (
        message?.type === "inventory-updated" ||
        message?.type === "order-created" ||
        message?.type === "order-updated" ||
        message?.type === "catalog-updated" ||
        message?.type === "admin-data-invalidated"
      ) {
        void loadReport();
      }
    };
    window.addEventListener("apc-admin-live-event", handleLiveEvent);
    return () => window.removeEventListener("apc-admin-live-event", handleLiveEvent);
  }, [loadReport]);

  useEffect(() => {
    if (reportType !== "DIRECT_STOCK_OUT") return;
    const handleInventoryUpdate = (event: Event) => {
      const message = (event as CustomEvent<{ type?: string }>).detail;
      if (
        message?.type === "inventory-updated" ||
        message?.type === "inventory-history-updated" ||
        message?.type === "admin-data-invalidated"
      ) {
        setDirectStockOutRefreshVersion((version) => version + 1);
      }
    };
    window.addEventListener("apc-admin-live-event", handleInventoryUpdate);
    return () => window.removeEventListener("apc-admin-live-event", handleInventoryUpdate);
  }, [reportType]);

  const handleRetryReportLoad = () => {
    invalidateCurrentAdminApiPaths(["/api/admin/reports"]);
    setReportRequestVersion((version) => version + 1);
  };

  // Preset handlers
  const handleApplyPreset = (preset: "today" | "7days" | "30days" | "month" | "all") => {
    setActivePreset(preset);
    setDirectStockOutPage(1);
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
    setDirectStockOutReason("");
    setDirectStockOutPage(1);
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

  const filteredSalesLines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return report.recentOrders.flatMap((order) =>
      order.items
        .filter((item) =>
          !query ||
          order.orderNumber.toLowerCase().includes(query) ||
          item.productName.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query),
        )
        .map((item, index) => ({
          ...item,
          orderId: order.id,
          orderNumber: order.orderNumber,
          completedAt: order.completedAt,
          lineKey: `${order.id}:${index}`,
        })),
    );
  }, [report.recentOrders, searchQuery]);

  const salesTotals = useMemo(() => ({
    totalRevenue: filteredSalesLines.reduce((sum, line) => sum + line.subtotal, 0),
    grossProfit: filteredSalesLines.reduce((sum, line) => sum + line.grossProfit, 0),
    completedOrders: new Set(filteredSalesLines.map((line) => line.orderId)).size,
    totalItemsSold: filteredSalesLines.reduce((sum, line) => sum + line.quantity, 0),
  }), [filteredSalesLines]);

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

  const filteredDirectStockOutTransactions = useMemo(() => {
    const transactions = directStockOutReport?.transactions ?? [];
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return transactions;
    return transactions.filter((record) => [
      record.productDisplayName,
      record.variantSku ?? "",
      getDirectStockOutReasonLabel(record.reason),
      record.remarks ?? "",
      record.performedByName ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [directStockOutReport?.transactions, searchQuery]);

  const renderReportContent = (data: ReportState, type: ReportType, hasSearchFilter: boolean) => {
    const reportClass = type.toLowerCase().replaceAll("_", "-");
    const summary = getReportSummaryRows(data, type)
      .map(([label, value]) => `<div class="summary-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join("");
    const sections = getReportSections(data, type, hasSearchFilter)
      .map((section) => {
        const tableClass = `report-table report-table-${section.headers.length}`;
        const columns = section.headers.map(() => "<col>").join("");
        const rows = section.rows.length
          ? section.rows.map((row) => `<tr>${row.map((value, index) => {
              const header = section.headers[index] ?? "";
              const align = isReportNumericHeader(header)
                ? " class=\"right\""
                : "";
              return `<td${align}>${escapeHtml(value)}</td>`;
            }).join("")}</tr>`).join("")
          : `<tr><td colspan="${section.headers.length}">${escapeHtml(section.emptyMessage)}</td></tr>`;

        return `
          <section class="report-section">
            <h2 class="section-title">${escapeHtml(section.title)}</h2>
            <table class="${tableClass}">
              <colgroup>${columns}</colgroup>
              <thead><tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </section>
        `;
      })
      .join("");

    return `
      <main class="report-document report-${reportClass}">
        <section class="summary-section">
          <h2 class="section-title">Summary</h2>
          <dl class="summary-list">${summary}</dl>
        </section>
        ${sections}
      </main>
    `;
  };

  // Shared print layout for every report type.
  const printOfficialDocument = async (
    title: string,
    content: string,
    scope: PrintScope,
    landscape = false,
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

    const safeTitle = escapeHtml(title);
    const safePeriodLabel = escapeHtml(scope.periodLabel);
    const safeCategoryLabel = escapeHtml(scope.categoryLabel);
    const safeSearchLabel = escapeHtml(scope.searchLabel);
    const safeGeneratedAt = escapeHtml(scope.generatedAt);
    const safeBusinessName = escapeHtml(scope.businessName);
    const safeBusinessAddress = escapeHtml(scope.businessAddress);

    const header = `
      <header class="report-header">
        <h1 class="report-title">${safeTitle}</h1>
        <div class="brand-name">${safeBusinessName}</div>
        <div class="brand-location">${safeBusinessAddress}</div>
      </header>

      <div class="meta-strip">
        <div><strong>Reporting period</strong><span>${safePeriodLabel}</span></div>
        <div><strong>Category</strong><span>${safeCategoryLabel}</span></div>
        <div><strong>Search</strong><span>${safeSearchLabel}</span></div>
        <div><strong>Generated</strong><span>${safeGeneratedAt}</span></div>
      </div>
    `;

    const styles = `
      @page {
        size: ${landscape ? "13in 8.5in landscape" : "8.5in 13in portrait"};
        margin: 14mm;
      }
      * { box-sizing: border-box; }
      html, body { width: auto; min-width: 0; }
      body {
        margin: 0;
        background: #ffffff;
        color: #17211b;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9pt;
        line-height: 1.45;
      }
      .report-header {
        display: block;
        padding-bottom: 12px;
        border-bottom: 1px solid #a8b8ad;
        margin-bottom: 13px;
        text-align: center;
      }
      .brand-name {
        margin-top: 5px;
        color: #174c37;
        font-size: 10pt;
        font-weight: 700;
      }
      .brand-location {
        margin-top: 2px;
        color: #526257;
        font-size: 8pt;
      }
      .report-title {
        margin: 0;
        color: #142a20;
        font-size: 17pt;
        font-weight: 700;
      }
      .meta-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 0 0 15px;
        padding: 0 0 10px;
        border-bottom: 1px solid #d5ded6;
        color: #374151;
        font-size: 8pt;
        text-align: center;
      }
      .meta-strip div { display: grid; justify-items: center; gap: 4px; min-width: 0; }
      .meta-strip span { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
      .meta-strip strong {
        color: #526257;
        font-size: 7pt;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      .section-title {
        margin: 16px 0 7px;
        padding-bottom: 6px;
        border-bottom: 1px solid #cbd5cd;
        color: #26332b;
        font-size: 10pt;
        font-weight: 700;
        text-align: center;
      }
      .summary-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        column-gap: 22px;
        margin: 0 0 4px;
      }
      .report-direct-stock-out .summary-list {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        column-gap: 18px;
      }
      .report-section { margin-bottom: 16px; }
      .report-direct-stock-out .section-title { text-align: left; }
      .summary-item {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 4px 0;
        border-bottom: 1px solid #e1e7e2;
      }
      .summary-item dt { color: #526257; }
      .summary-item dd {
        margin: 0;
        color: #17211b;
        font-weight: 700;
      }
      .summary-item dt, .summary-item dd {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 5px;
        table-layout: fixed;
      }
      .report-table-9 col:nth-child(1) { width: 18%; }
      .report-table-9 col:nth-child(2) { width: 10%; }
      .report-table-9 col:nth-child(3) { width: 20%; }
      .report-table-9 col:nth-child(4) { width: 13%; }
      .report-table-9 col:nth-child(5) { width: 7%; }
      .report-table-9 col:nth-child(6),
      .report-table-9 col:nth-child(7),
      .report-table-9 col:nth-child(8),
      .report-table-9 col:nth-child(9) { width: 8%; }
      .report-table-11 col:nth-child(1) { width: 13%; }
      .report-table-11 col:nth-child(2) { width: 17%; }
      .report-table-11 col:nth-child(3) { width: 8%; }
      .report-table-11 col:nth-child(4) { width: 8%; }
      .report-table-11 col:nth-child(5) { width: 5%; }
      .report-table-11 col:nth-child(6),
      .report-table-11 col:nth-child(7) { width: 6%; }
      .report-table-11 col:nth-child(8) { width: 7%; }
      .report-table-11 col:nth-child(9) { width: 8%; }
      .report-table-11 col:nth-child(10) { width: 9%; }
      .report-table-11 col:nth-child(11) { width: 13%; }
      .report-direct-stock-out .report-table-11 th,
      .report-direct-stock-out .report-table-11 td { padding: 7px 5px; font-size: 6.5pt; }
      th, td {
        padding: 5px 4px;
        border-bottom: 1px solid #e1e7e2;
        text-align: left;
        vertical-align: middle;
        line-height: 1.25;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      th {
        padding-top: 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid #82948a;
        color: #405148;
        font-size: 7pt;
        font-weight: 700;
        text-align: center;
      }
      td { font-size: 7pt; }
      td.right { text-align: right; }
      @media screen {
        body { visibility: hidden; }
      }
      @media print {
        body { visibility: visible; }
        .report-header, .meta-strip, .summary-section { break-inside: avoid; page-break-inside: avoid; }
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
    const selectedSearch = searchQuery;

    try {
      let filteredReport: ReportState;
      let categoryLabel: string;
      if (selectedReportType === "DIRECT_STOCK_OUT") {
        const loadedDirectStockOut = await fetchDirectStockOutData(
          selectedStartDate,
          selectedEndDate,
          directStockOutReason,
          1,
          true,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setDirectStockOutReport(loadedDirectStockOut);
        filteredReport = {
          ...report,
          directStockOut: filterDirectStockOutData(loadedDirectStockOut, selectedSearch),
        };
        categoryLabel = "Not applicable";
      } else {
        const loadedReport = await fetchReportData(
          selectedStartDate,
          selectedEndDate,
          selectedCategory,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setReport(loadedReport);
        setHasLoadedReport(true);
        filteredReport = filterReportDocumentData(loadedReport, selectedSearch);
        categoryLabel = selectedCategory
          ? loadedReport.categories.find((item) => item.id === selectedCategory)?.name ?? "Selected category"
          : "All categories";
      }
      const periodLabel = getReportPeriodLabel(selectedStartDate, selectedEndDate, selectedReportType);
      const searchLabel = selectedSearch.trim() || "Not applied";
      const generatedAt = new Date();
      const reportTitle = getReportTitle(selectedReportType);

      setPrintPreview({ reportTitle, periodLabel, categoryLabel, searchLabel });
      setPrintStatus("preparing");
      const printScope = {
        periodLabel,
        categoryLabel,
        searchLabel,
        generatedAt: formatReportGeneratedAt(generatedAt),
        businessName: filteredReport.business.name,
        businessAddress: filteredReport.business.address,
      };
      const content = renderReportContent(filteredReport, selectedReportType, Boolean(selectedSearch.trim()));

      if (!(await printOfficialDocument(reportTitle, content, printScope, selectedReportType === "DIRECT_STOCK_OUT"))) {
        throw new Error("The print preview could not be created.");
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
  const handleExportCsv = async () => {
    setDirectStockOutExportError("");
    const selectedStartDate = startDate;
    const selectedEndDate = endDate;
    const selectedCategory = category;
    const selectedReportType = reportType;
    const selectedSearch = searchQuery;
    let data: ReportState;
    let business: ReportState["business"];
    let categoryLabel: string;
    if (selectedReportType === "DIRECT_STOCK_OUT") {
      try {
        const loadedDirectStockOut = await fetchDirectStockOutData(
          selectedStartDate,
          selectedEndDate,
          directStockOutReason,
          1,
          true,
        );
        setDirectStockOutReport(loadedDirectStockOut);
        data = { ...report, directStockOut: filterDirectStockOutData(loadedDirectStockOut, selectedSearch) };
        business = report.business;
        categoryLabel = "Not applicable";
      } catch (error) {
        console.error("Unable to export direct stock-out report:", error);
        setDirectStockOutExportError(error instanceof Error ? error.message : "Unable to export the direct stock-out report.");
        return;
      }
    } else {
      const loadedReport = await loadReport(selectedStartDate, selectedEndDate, selectedCategory);
      if (!loadedReport) return;
      data = filterReportDocumentData(loadedReport, selectedSearch);
      business = loadedReport.business;
      categoryLabel = selectedCategory
        ? loadedReport.categories.find((item) => item.id === selectedCategory)?.name ?? "Selected category"
        : "All categories";
    }
    const reportTitle = getReportTitle(selectedReportType);
    const periodLabel = getReportPeriodLabel(selectedStartDate, selectedEndDate, selectedReportType);
    const searchLabel = selectedSearch.trim() || "Not applied";
    const generatedAt = new Date();
    const lines: string[] = [reportTitle];
    const addSection = (title: string, headers: string[], rows: Array<Array<unknown>>) => {
      lines.push(title, headers.map(escapeCsvValue).join(","));
      rows.forEach((row) => lines.push(row.map(escapeCsvValue).join(",")));
      lines.push("");
    };

    addSection("Report details", ["Field", "Value"], [
      ["Business name", business.name],
      ["Business address", business.address],
      ["Reporting period", periodLabel],
      ["Category", categoryLabel],
      ["Search", searchLabel],
      ["Generated", formatReportGeneratedAt(generatedAt)],
    ]);
    addSection("Summary", ["Metric", "Value"], getReportSummaryRows(data, selectedReportType));
    getReportSections(data, selectedReportType, Boolean(selectedSearch.trim())).forEach((section) => {
      const rows = section.rows.length
        ? section.rows
        : [[section.emptyMessage, ...Array.from({ length: section.headers.length - 1 }, () => "")]];
      addSection(section.title, section.headers, rows);
    });

    const filename = `${reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
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
      const selectedSearch = searchQuery;
      let data: ReportState;
      let categoryLabel: string;
      if (selectedReportType === "DIRECT_STOCK_OUT") {
        const loadedDirectStockOut = await fetchDirectStockOutData(
          selectedStartDate,
          selectedEndDate,
          directStockOutReason,
          1,
          true,
        );
        setDirectStockOutReport(loadedDirectStockOut);
        data = { ...report, directStockOut: filterDirectStockOutData(loadedDirectStockOut, selectedSearch) };
        categoryLabel = "Not applicable";
      } else {
        const loadedReport = await fetchReportData(selectedStartDate, selectedEndDate, selectedCategory);
        setReport(loadedReport);
        setHasLoadedReport(true);
        data = filterReportDocumentData(loadedReport, selectedSearch);
        categoryLabel = selectedCategory
          ? loadedReport.categories.find((item) => item.id === selectedCategory)?.name ?? "Selected category"
          : "All categories";
      }
      const periodLabel = getReportPeriodLabel(selectedStartDate, selectedEndDate, selectedReportType);
      const searchLabel = selectedSearch.trim() || "Not applied";
      const reportTitle = getReportTitle(selectedReportType);
      const generatedAt = new Date();

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
        searchLabel,
        generatedAt,
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
    return getReportTitle(reportType);
  }, [reportType]);
  const isReportActionLoading = isReportLoading || (
    reportType === "DIRECT_STOCK_OUT" && isDirectStockOutLoading
  );

  const handleSelectReportType = (type: ReportType) => {
    setReportType(type);
    setSearchQuery("");
    if (type === "DIRECT_STOCK_OUT") {
      setDirectStockOutPage(1);
      setDirectStockOutRefreshVersion((version) => version + 1);
      setDirectStockOutExportError("");
    }
  };

  return (
    <div className="space-y-6 pb-16 text-slate-900 dark:text-slate-100">
      {/* 1. Header & Quick Actions */}
      <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Reports</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Create reports from the selected dates, category, and search filter.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePrintCurrentReport()}
              disabled={isReportActionLoading || printStatus !== null || isPdfExporting}
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
              disabled={isReportActionLoading || printStatus !== null || isPdfExporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isReportActionLoading || printStatus !== null || isPdfExporting}
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
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {(
                [
                  {
                    id: "ALL",
                    label: "Business Summary",
                    icon: BarChart3,
                    activeClass: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200",
                    idleClass: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60",
                  },
                  {
                    id: "INVENTORY",
                    label: "Inventory",
                    icon: Boxes,
                    activeClass: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-200",
                    idleClass: "border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60",
                  },
                  {
                    id: "SALES",
                    label: "Sales",
                    icon: ShoppingCart,
                    activeClass: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-950/70 dark:text-violet-200",
                    idleClass: "border-violet-200 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/60",
                  },
                  {
                    id: "LOW_STOCK",
                    label: "Low Stock",
                    icon: AlertTriangle,
                    activeClass: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200",
                    idleClass: "border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60",
                  },
                  {
                    id: "TOP_PRODUCTS",
                    label: "Top Products",
                    icon: TrendingUp,
                    activeClass: "border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-700 dark:bg-teal-950/70 dark:text-teal-200",
                    idleClass: "border-teal-200 bg-teal-50/60 text-teal-700 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/60",
                  },
                  {
                    id: "DIRECT_STOCK_OUT",
                    label: "Direct Stock-out",
                    icon: AlertCircle,
                    activeClass: "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-200",
                    idleClass: "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/60",
                  },
                ] as const
              ).map((tab) => {
                const isActive = reportType === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectReportType(tab.id)}
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

          <div className={`mt-4 grid w-full grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 ${reportType === "DIRECT_STOCK_OUT" ? "lg:grid-cols-3" : "lg:grid-cols-4"} dark:border-slate-800/80`}>
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
                  setDirectStockOutPage(1);
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
                  setDirectStockOutPage(1);
                  setActivePreset("custom");
                }}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            {reportType !== "DIRECT_STOCK_OUT" && <div className="min-w-0">
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
            </div>}
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

      {!hasLoadedReport && reportType !== "DIRECT_STOCK_OUT" ? (
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Sales Channel Split */}
            <section className="border-t border-slate-200 py-4 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Sales by channel</h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectReportType("SALES")}
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  View sales
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Object.entries(report.channelBreakdown).map(([channel, values]) => (
                  <div
                    key={channel}
                    className="border-b border-slate-100 py-3 dark:border-slate-800"
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
            <section className="border-t border-slate-200 py-4 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Payments
                  </h2>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries(report.paymentBreakdown).map(([method, values]) => (
                  <div
                    key={method}
                    className="border-b border-slate-100 py-3 dark:border-slate-800"
                  >
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {method}
                    </span>
                    <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                      {formatCurrency(values.revenue)}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {values.count} orders
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Quick Previews: Top Products & Critical Stock */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top 5 Products Preview */}
            <section className="border-t border-slate-200 py-4 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Top Selling Products
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectReportType("TOP_PRODUCTS")}
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  View products
                </button>
              </div>
              <div className="mt-4 space-y-2.5">
                {report.topProducts.slice(0, 5).map((prod, idx) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between border-b border-slate-100 py-2.5 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="shrink-0 font-semibold text-slate-500">{idx + 1}.</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
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
            <section className="border-t border-slate-200 py-4 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Items to restock
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectReportType("LOW_STOCK")}
                  className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
                >
                  View low stock
                </button>
              </div>
              <div className="mt-4 space-y-2.5">
                {report.lowStock.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b border-slate-100 py-2.5 text-xs dark:border-slate-800"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        SKU: {item.sku} · Minimum stock: {item.minStock}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {item.stock} on hand
                    </span>
                  </div>
                ))}
                {report.lowStock.length === 0 && (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No items need restocking.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* VIEW B: INVENTORY VALUATION ONLY */}
      {reportType === "INVENTORY" && (
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Inventory
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Current stock, cost, and retail value
              </p>
            </div>
            <div className="relative w-full sm:w-64">
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
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Retail Price</th>
                  <th className="px-4 py-3 text-right">Stock cost value</th>
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
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Completed Sales Orders Ledger
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Sales for the selected dates and category. Profit is estimated using current item costs.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
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

          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3 xl:grid-cols-5 dark:border-slate-800">
            {[
              {
                label: "Gross Revenue",
                value: formatCurrency(salesTotals.totalRevenue),
                detail: "Completed sales",
                valueClass: "text-slate-900 dark:text-white",
              },
              {
                label: "Estimated Product Cost",
                value: formatCurrency(salesTotals.totalRevenue - salesTotals.grossProfit),
                detail: "At current costs",
                valueClass: "text-slate-700 dark:text-slate-200",
              },
              {
                label: "Estimated Gross Profit",
                value: formatCurrency(salesTotals.grossProfit),
                detail: "At current costs",
                valueClass: salesTotals.grossProfit < 0
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-emerald-700 dark:text-emerald-400",
              },
              {
                label: "Completed Orders",
                value: salesTotals.completedOrders.toLocaleString(),
                detail: "In this period",
                valueClass: "text-slate-900 dark:text-white",
              },
              {
                label: "Units Sold",
                value: salesTotals.totalItemsSold.toLocaleString(),
                detail: "In this period",
                valueClass: "text-slate-900 dark:text-white",
              },
            ].map((total) => (
              <div key={total.label} className="border-b border-slate-200 px-1 py-3 dark:border-slate-800">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{total.label}</p>
                <p className={`mt-1 text-sm font-bold ${total.valueClass}`}>{total.value}</p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-500">{total.detail}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Order number</th>
                  <th className="px-4 py-3">Date completed</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit price</th>
                  <th className="px-4 py-3 text-right">Cost / unit</th>
                  <th className="px-4 py-3 text-right">Line total</th>
                  <th className="px-4 py-3 text-right">Estimated profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSalesLines.length > 0 ? (
                  filteredSalesLines.map((line) => (
                    <tr key={line.lineKey} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {line.orderNumber}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {new Date(line.completedAt).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "Asia/Manila",
                        })}
                      </td>
                      <td className="min-w-48 px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {line.productName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-500">
                        {line.sku}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">
                        {line.quantity}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                        {formatCurrency(line.unitCost)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(line.subtotal)}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${line.grossProfit < 0 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {formatCurrency(line.grossProfit)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-slate-500">
                      No completed sale items found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>{filteredSalesLines.length} sale items shown</span>
          </div>
        </section>
      )}

      {/* VIEW D: LOW STOCK ALERTS ONLY */}
      {reportType === "LOW_STOCK" && (
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Items to Restock
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Inventory at or below the minimum stock level
              </p>
            </div>
            <div className="relative w-full sm:w-64">
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
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  <th className="px-4 py-3 text-right">Minimum stock</th>
                  <th className="px-4 py-3 text-right">Units to restock</th>
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
                          {deficit.toLocaleString()} units
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                      No items need restocking for these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>{filteredLowStock.length} items to restock</span>
          </div>
        </section>
      )}

      {/* VIEW E: TOP PRODUCTS ONLY */}
      {reportType === "TOP_PRODUCTS" && (
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Best-Selling Products
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Products ranked by units sold
              </p>
            </div>
            <div className="relative w-full sm:w-64">
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
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Units sold</th>
                  <th className="px-4 py-3 text-right">Sales Revenue</th>
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
                        {index + 1}.
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
                      No product sales match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-3.5 text-xs text-slate-500 dark:border-slate-800">
            <span>{filteredTopProducts.length} products shown</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {filteredTopProducts.reduce((sum, item) => sum + item.unitsSold, 0)} units sold
            </span>
          </div>
        </section>
      )}

      {reportType === "DIRECT_STOCK_OUT" && (
        <section className="space-y-5 border-t border-slate-200 pt-5 dark:border-slate-800">
          <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Direct Stock-out</h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Manual inventory deductions by reason. Sales transactions are excluded.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-[minmax(11rem,0.8fr)_minmax(14rem,1.2fr)_auto] sm:items-end">
              <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="block">Reason</span>
                <select
                  value={directStockOutReason}
                  onChange={(event) => { setDirectStockOutReason(event.target.value); setDirectStockOutPage(1); }}
                  className="block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All reasons</option>
                  {DIRECT_STOCK_OUT_REASON_VALUES.map((reason) => (
                    <option key={reason} value={reason}>{DIRECT_STOCK_OUT_REASON_LABELS[reason]}</option>
                  ))}
                  <option value="UNSPECIFIED">Unspecified (older entries)</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">Search records</span>
                <span className="relative block">
                  <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search product, SKU, notes..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-normal outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
                />
                </span>
              </label>
              <button
                type="button"
                onClick={() => setDirectStockOutRefreshVersion((version) => version + 1)}
                disabled={isDirectStockOutLoading}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {isDirectStockOutLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {directStockOutError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
              {directStockOutError}
            </div>
          )}

          {(() => {
            const summary = directStockOutReport?.summary ?? { entries: 0, units: 0, estimatedValue: 0, unvaluedEntries: 0 };
            return (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Stock-out entries", summary.entries.toLocaleString("en-PH"), "For the selected period"],
                  ["Units removed", summary.units.toLocaleString("en-PH"), "Total quantity deducted"],
                  ["Estimated stock loss", formatCurrency(summary.estimatedValue), "Based on recorded unit costs"],
                  ["Entries without cost", summary.unvaluedEntries.toLocaleString("en-PH"), "Not included in the estimate"],
                ].map(([label, value, detail]) => (
                  <div key={label} className="min-h-24 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-2 text-lg font-bold leading-tight text-slate-900 dark:text-white">{value}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Stock-out by reason</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Entry count, quantity removed, and estimated value by reason.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Entries</th>
                    <th className="px-4 py-3 text-right">Units</th>
                    <th className="px-4 py-3 text-right">Estimated loss</th>
                    <th className="px-4 py-3 text-right">Unvalued</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(directStockOutReport?.reasonBreakdown ?? []).length > 0 ? directStockOutReport?.reasonBreakdown.map((group) => (
                    <tr key={group.reason}>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{getDirectStockOutReasonLabel(group.reason)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{group.entries.toLocaleString("en-PH")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{group.units.toLocaleString("en-PH")}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(group.estimatedValue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{group.unvaluedEntries.toLocaleString("en-PH")}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No direct stock-outs in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Transaction details</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Manual inventory deductions recorded during the selected period.</p>
            </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[1260px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Date and time</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Stock before</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Stock after</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Unit cost</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Estimated loss</th>
                  <th className="whitespace-nowrap px-4 py-3">Recorded by</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isDirectStockOutLoading ? (
                  <tr><td colSpan={11} className="py-12 text-center text-xs text-slate-500">Loading direct stock-out records...</td></tr>
                ) : filteredDirectStockOutTransactions.length > 0 ? filteredDirectStockOutTransactions.map((record) => (
                  <tr key={record.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{new Date(record.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">{record.productDisplayName}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500">{record.variantSku || "—"}</td>
                    <td className="px-3 py-3">{getDirectStockOutReasonLabel(record.reason)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{record.quantity.toLocaleString("en-PH")}</td>
                    <td className="px-3 py-3 text-right">{record.stockBefore?.toLocaleString("en-PH") ?? "—"}</td>
                    <td className="px-3 py-3 text-right">{record.stockAfter?.toLocaleString("en-PH") ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{record.unitCostSnapshot == null ? "Unvalued" : formatCurrency(record.unitCostSnapshot)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-rose-700 dark:text-rose-300">{record.estimatedLossValue == null ? "Unvalued" : formatCurrency(record.estimatedLossValue)}</td>
                    <td className="px-3 py-3">{record.performedByName || "System"}</td>
                    <td className="max-w-56 px-3 py-3 text-slate-500">{record.remarks || "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={11} className="py-12 text-center text-xs text-slate-500">No direct stock-out entries match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Showing {filteredDirectStockOutTransactions.length} of {directStockOutReport?.pagination.totalCount ?? 0} entries
              {searchQuery.trim() ? " on this page matching search" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDirectStockOutPage((page) => Math.max(1, page - 1))}
                disabled={isDirectStockOutLoading || directStockOutPage <= 1}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold disabled:opacity-40 dark:border-slate-700"
              >Previous</button>
              <span>Page {directStockOutReport?.pagination.page ?? directStockOutPage} of {directStockOutReport?.pagination.totalPages ?? 1}</span>
              <button
                type="button"
                onClick={() => setDirectStockOutPage((page) => Math.min(directStockOutReport?.pagination.totalPages ?? page, page + 1))}
                disabled={isDirectStockOutLoading || directStockOutPage >= (directStockOutReport?.pagination.totalPages ?? 1)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold disabled:opacity-40 dark:border-slate-700"
              >Next</button>
            </div>
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
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Print preview</p>
                    <h2 id="report-print-dialog-title" className="mt-0.5 break-words text-base font-semibold text-slate-950 dark:text-white">
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
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">We’re loading the latest data for your selected filters. You can cancel while it loads.</p>
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
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">The report is ready. We’re preparing the print layout.</p>
                  </div>
                ) : printStatus === "ready" && printPreview ? (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5" /> Your report is ready
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose Print or Save as PDF in your device’s print dialog.</p>
                    <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700 sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reporting period</dt>
                        <dd className="mt-1 wrap-break-word font-medium text-slate-900 dark:text-slate-100">{printPreview.periodLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</dt>
                        <dd className="mt-1 wrap-break-word font-medium text-slate-900 dark:text-slate-100">{printPreview.categoryLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search</dt>
                        <dd className="mt-1 wrap-break-word font-medium text-slate-900 dark:text-slate-100">{printPreview.searchLabel}</dd>
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
