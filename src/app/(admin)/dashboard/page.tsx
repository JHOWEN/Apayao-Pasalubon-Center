"use client";

import Link from "next/link";
import Image from "@/components/safe-image";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Package,
  Plus,
  Printer,
  Receipt,
  Store,
  Globe,
  TrendingUp,
  Warehouse,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";

type LowStockItem = {
  id: string;
  name: string;
  minStock: number;
  stock: number;
};

type TopProductItem = {
  productId: string;
  name: string;
  imageUrl?: string | null;
  categoryName?: string;
  quantity: number;
  revenue: number;
  orders: number;
};

type SalesCategoryItem = {
  name: string;
  revenue: number;
  quantity: number;
};

type SalesChannelItem = {
  name: string;
  orders: number;
  revenue: number;
};

type DashboardRange = "DAILY" | "WEEKLY" | "MONTHLY" | "ANNUALLY" | "CUSTOM";

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getRecentDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

function getAnnualDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

export default function DashboardPage() {
  const [userName, setUserName] = useState("Admin");
  const [startDate, setStartDate] = useState(() => {
    return formatDateInput(new Date());
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [range, setRange] = useState<DashboardRange>("DAILY");
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    completedOrders: 0,
    revenue: 0,
    lowStock: [] as LowStockItem[],
    totalCost: 0,
    totalPrice: 0,
    topProducts: [] as TopProductItem[],
    salesByCategory: [] as SalesCategoryItem[],
    channelComparison: [] as SalesChannelItem[],
  });

  const [todayStats, setTodayStats] = useState({
    pendingOrders: 0,
    cancelledOrders: 0,
    completedOrders: 0,
  });

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const profileResponse = await fetch("/api/admin/profile");
        const profileData = await profileResponse.json();

        if (profileData?.success && typeof profileData?.user?.name === "string" && profileData.user.name.trim()) {
          setUserName(profileData.user.name.trim());
        }
      } catch {
        // Fallback to default name
      }

      try {
        setIsLoading(true);
        const params = new URLSearchParams({ range, includeToday: "true" });
        if (range === "CUSTOM") {
          params.set("from", startDate);
          params.set("to", endDate);
        }
        const summaryResponse = await fetch(`/api/admin/analytics?${params.toString()}`);
        const summaryData = await summaryResponse.json();

        setStats({
          products: Number(summaryData?.products ?? 0),
          orders: Number(summaryData?.orders ?? 0),
          pendingOrders: Number(summaryData?.pendingOrders ?? 0),
          cancelledOrders: Number(summaryData?.cancelledOrders ?? 0),
          completedOrders: Number(summaryData?.completedOrders ?? 0),
          revenue: Number(summaryData?.revenue ?? 0),
          lowStock: Array.isArray(summaryData?.lowStock) ? summaryData.lowStock : [],
          totalCost: Number(summaryData?.totalCost ?? 0),
          totalPrice: Number(summaryData?.totalPrice ?? 0),
          topProducts: Array.isArray(summaryData?.topProducts) ? summaryData.topProducts : [],
          salesByCategory: Array.isArray(summaryData?.salesByCategory) ? summaryData.salesByCategory : [],
          channelComparison: Array.isArray(summaryData?.channelComparison) ? summaryData.channelComparison : [],
        });

        setTodayStats({
          pendingOrders: Number(summaryData?.todayStats?.pendingOrders ?? 0),
          cancelledOrders: Number(summaryData?.todayStats?.cancelledOrders ?? 0),
          completedOrders: Number(summaryData?.todayStats?.completedOrders ?? 0),
        });
        setLastUpdated(new Date());
      } catch {
        // Retain current state if analytics fails
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboardData();

    const refreshInterval = window.setInterval(() => {
      void loadDashboardData();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadDashboardData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [range, startDate, endDate]);

  const formatCurrency = (value: number | null | undefined) => {
    const numericValue = Number(value ?? 0);
    return `₱${Number.isFinite(numericValue) ? numericValue.toLocaleString() : "0"}`;
  };

  function printDashboardReport() {
    const reportWindow = window.open(
      "",
      "_blank",
      `popup=yes,width=${window.screen.availWidth},height=${window.screen.availHeight},left=0,top=0`,
    );
    if (!reportWindow) return;

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const formatReportCurrency = (value: number) =>
      `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const generatedDate = new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const generatedTime = new Date().toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const logoUrl = process.env.NEXT_PUBLIC_APP_LOGO_URL ?? "/logo/apc-logo.png";

    const channelRows =
      stats.channelComparison.length > 0
        ? stats.channelComparison
            .map(
              (channel) =>
                `<tr><td>${escapeHtml(channel.name)}</td><td>${escapeHtml(channel.orders)}</td><td>${formatReportCurrency(channel.revenue)}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="3">No completed channel sales in this period.</td></tr>`;

    const productRows =
      stats.topProducts.length > 0
        ? stats.topProducts
            .map(
              (product, index) =>
                `<tr><td>${index + 1}</td><td>${escapeHtml(product.name)}</td><td>${escapeHtml(
                  product.categoryName ?? "Uncategorized"
                )}</td><td>${escapeHtml(product.quantity)}</td><td>${formatReportCurrency(product.revenue)}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="5">No product sales in this period.</td></tr>`;

    const lowStockRows =
      stats.lowStock.length > 0
        ? stats.lowStock
            .map(
              (item) =>
                `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.stock)}</td><td>${escapeHtml(
                  item.minStock
                )}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="3">No low-stock items.</td></tr>`;

    reportWindow.document.write(`
      <!doctype html>
      <html><head><title>Dashboard Performance Report - Apayao Pasalubong Center</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 14mm 12mm; font-size: 11px; line-height: 1.45; }
        .report-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 3px solid #059669; margin-bottom: 14px; }
        .brand-lockup { display: flex; align-items: center; gap: 12px; }
        .brand-logo { width: 52px; height: 52px; flex: 0 0 auto; object-fit: contain; }
        .brand-name { color: #0f172a; font-size: 17px; font-weight: 800; }
        .brand-contact { margin-top: 3px; color: #64748b; font-size: 9.5px; }
        .report-meta { text-align: right; }
        .meta-badge { display: inline-block; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
        .report-title { margin-top: 4px; color: #0f172a; font-size: 15px; font-weight: 800; }
        .report-date { margin-top: 2px; color: #64748b; font-size: 9.5px; }
        .meta-strip { display: flex; gap: 20px; flex-wrap: wrap; margin: 0 0 16px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; font-size: 10px; color: #475569; }
        h2 { margin: 24px 0 8px; font-size: 14px; font-weight: 600; border-bottom: 2px solid #059669; padding-bottom: 4px; }
        p { margin: 3px 0; color: #475569; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
        .metric { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
        .metric-label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
        .metric-value { margin-top: 4px; font-size: 18px; font-weight: 700; color: #0f172a; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; font-weight: 600; color: #475569; }
        td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
        @media screen { body { visibility: hidden; } }
        @media print {
          body { visibility: visible; }
          .report-header, .summary, thead, tr { break-inside: avoid; }
        }
      </style></head><body>
        <header class="report-header">
          <div class="brand-lockup">
            <img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="Apayao Pasalubong Center logo">
            <div>
              <div class="brand-name">Apayao Pasalubong Center</div>
              <div class="brand-contact">San Isidro Sur, Luna, Apayao, Philippines | apcstore@example.com | +63 912 345 6789</div>
            </div>
          </div>
          <div class="report-meta">
            <span class="meta-badge">Management Report</span>
            <div class="report-title">Dashboard Performance Report</div>
            <div class="report-date">Generated: ${generatedDate} ${generatedTime}</div>
          </div>
        </header>
        <div class="meta-strip">
          <div><strong>Reporting Period:</strong> ${escapeHtml(formatDateDisplay(startDate))} - ${escapeHtml(formatDateDisplay(endDate))}</div>
          <div><strong>Generated By:</strong> ${escapeHtml(userName)}</div>
          <div><strong>Document Status:</strong> Certified Official Copy</div>
        </div>
        <div class="summary">
          <div class="metric"><div class="metric-label">Revenue</div><div class="metric-value">${formatReportCurrency(stats.revenue)}</div></div>
          <div class="metric"><div class="metric-label">Orders</div><div class="metric-value">${escapeHtml(stats.orders)}</div></div>
          <div class="metric"><div class="metric-label">Completed Orders</div><div class="metric-value">${escapeHtml(stats.completedOrders)}</div></div>
          <div class="metric"><div class="metric-label">Active Products</div><div class="metric-value">${escapeHtml(stats.products)}</div></div>
          <div class="metric"><div class="metric-label">Inventory Cost</div><div class="metric-value">${formatReportCurrency(stats.totalCost)}</div></div>
          <div class="metric"><div class="metric-label">Inventory Price</div><div class="metric-value">${formatReportCurrency(stats.totalPrice)}</div></div>
        </div>
        <h2>Sales Channels</h2>
        <table><thead><tr><th>Channel</th><th>Completed Orders</th><th>Revenue</th></tr></thead><tbody>${channelRows}</tbody></table>
        <h2>Top Selling Products</h2>
        <table><thead><tr><th>#</th><th>Product</th><th>Category</th><th>Sold</th><th>Revenue</th></tr></thead><tbody>${productRows}</tbody></table>
        <h2>Low Stock Alerts</h2>
        <table><thead><tr><th>Product</th><th>Stock Left</th><th>Minimum Stock</th></tr></thead><tbody>${lowStockRows}</tbody></table>
        <h2>Today Overview</h2>
        <table><thead><tr><th>Status</th><th>Orders</th></tr></thead><tbody>
          <tr><td>Pending</td><td>${todayStats.pendingOrders}</td></tr>
          <tr><td>Completed</td><td>${todayStats.completedOrders}</td></tr>
          <tr><td>Cancelled</td><td>${todayStats.cancelledOrders}</td></tr>
        </tbody></table>
      </body></html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.setTimeout(() => reportWindow.print(), 250);
  }

  const outOfStockCount = stats.lowStock.filter((item) => item.stock <= 0).length;
  const criticalStockCount = stats.lowStock.filter(
    (item) => item.stock > 0 && (item.minStock <= 0 || item.stock / item.minStock <= 0.4)
  ).length;

  const presets = [
    { label: "Daily", value: "DAILY" as const, range: getRecentDateRange(1) },
    { label: "Weekly", value: "WEEKLY" as const, range: getRecentDateRange(7) },
    { label: "Monthly", value: "MONTHLY" as const, range: getRecentDateRange(30) },
    { label: "Annually", value: "ANNUALLY" as const, range: getAnnualDateRange() },
  ];

  const totalPeriodRevenue = stats.revenue;
  const totalUnitsSold = stats.salesByCategory.reduce((sum, item) => sum + item.quantity, 0);
  const posChannel = stats.channelComparison.find((channel) => channel.name.includes("POS")) ?? {
    name: "POS (Walk-in)",
    orders: 0,
    revenue: 0,
  };
  const ecommerceChannel = stats.channelComparison.find((channel) => !channel.name.includes("POS")) ?? {
    name: "Ecommerce",
    orders: 0,
    revenue: 0,
  };
  const totalChannelOrders = posChannel.orders + ecommerceChannel.orders;
  const posOrderPercent = totalChannelOrders > 0 ? Math.round((posChannel.orders / totalChannelOrders) * 100) : 0;
  const ecommerceOrderPercent = totalChannelOrders > 0 ? 100 - posOrderPercent : 0;

  function handleCustomDateChange(nextStartDate: string, nextEndDate: string) {
    const safeStart = nextStartDate || formatDateInput(new Date());
    const safeEnd = nextEndDate || formatDateInput(new Date());

    if (safeStart > safeEnd) {
      const swappedStart = safeEnd;
      const swappedEnd = safeStart;
      setStartDate(swappedStart);
      setEndDate(swappedEnd);
      setRange("CUSTOM");
      return;
    }

    setStartDate(safeStart);
    setEndDate(safeEnd);
    setRange("CUSTOM");
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-7 px-1 py-3 text-slate-800 dark:text-slate-100">
      {/* 1. Page Header & Date Range Controls */}
      <section className="flex flex-col gap-5 border-b-2 border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Welcome back, <span className="font-semibold text-slate-800 dark:text-slate-200">{userName}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A quick look at store performance
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end lg:w-auto">
          {/* Presets Segmented Bar */}
          <div className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {presets.map((preset) => {
              const isActive = range === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setStartDate(preset.range.start);
                    setEndDate(preset.range.end);
                    setRange(preset.value);
                  }}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                    isActive
                      ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs */}
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:w-auto sm:flex-nowrap sm:gap-1.5 sm:py-1.5">
            <Calendar className="hidden h-3.5 w-3.5 shrink-0 text-slate-500 sm:block" />
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">From</span>
              <input
                ref={startDateInputRef}
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => {
                  handleCustomDateChange(e.target.value, endDate);
                }}
                className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold outline-none ring-0 transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 sm:w-auto"
              />
            </label>
            <span className="hidden text-slate-400 dark:text-slate-500 sm:block">-</span>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">To</span>
              <input
                ref={endDateInputRef}
                type="date"
                value={endDate}
                min={startDate}
                max={formatDateInput(new Date())}
                onChange={(e) => {
                  handleCustomDateChange(startDate, e.target.value);
                }}
                className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 sm:w-auto"
              />
            </label>
          </div>

          {/* Print Button */}
          <button
            type="button"
            onClick={printDashboardReport}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            title="Print printable dashboard report"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>

          {/* Live Status Indicator */}
          <div className="flex min-h-10 min-w-32 shrink-0 items-center justify-end gap-2 px-1 text-right text-xs text-slate-600 dark:text-slate-300">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${isLoading ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`}
            />
            <span className="whitespace-nowrap">
              {isLoading
                ? "Syncing..."
                : lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Live"}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Dashboard KPI Metrics */}
      {isLoading ? (
        <section
          aria-label="Loading dashboard metrics"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[minmax(7.5rem,1fr)] lg:grid-cols-4 xl:gap-5"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`dashboard-kpi-skeleton-${index}`}
              className={`animate-pulse flex flex-col rounded-md border border-slate-200 border-t-4 border-t-slate-300 bg-white dark:border-slate-800 dark:border-t-slate-700 dark:bg-slate-900 ${
                index === 0
                  ? "min-h-68 p-6 sm:col-span-2 lg:col-span-2 lg:row-span-2"
                  : "min-h-40 p-3 lg:min-h-0"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-10 w-10 rounded-md bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-10 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section
          aria-label="Dashboard metrics"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[minmax(7.5rem,1fr)] lg:grid-cols-4 xl:gap-5"
        >
          <div className="flex min-h-68 flex-col rounded-md border border-emerald-200 border-t-4 border-t-emerald-600 bg-emerald-50/50 p-6 dark:border-emerald-900 dark:border-t-emerald-500 dark:bg-slate-900 sm:col-span-2 lg:col-span-2 lg:row-span-2">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                {range === "DAILY" ? "Today's Revenue" : "Total Revenue"}
              </span>
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-8">
              <p className="text-5xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                {formatCurrency(totalPeriodRevenue)}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {stats.completedOrders} completed sales in selected period
              </p>
            </div>
          </div>

          <div className="flex min-h-40 flex-col rounded-md border border-slate-200 border-t-4 border-t-sky-500 bg-white p-3 dark:border-slate-800 dark:border-t-sky-400 dark:bg-slate-900 lg:min-h-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                Orders
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                <Receipt className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-auto pt-3">
              <p className="text-3xl leading-8 font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                {stats.orders}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-amber-600 dark:text-amber-400">{todayStats.pendingOrders} pending</span>
                <span>·</span>
                <span>{todayStats.completedOrders} completed today</span>
              </div>
            </div>
          </div>

          <div className={`flex min-h-40 flex-col rounded-md border border-slate-200 border-t-4 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:min-h-0 ${stats.lowStock.length > 0 ? "border-t-rose-500 dark:border-t-rose-400" : "border-t-slate-300 dark:border-t-slate-700"}`}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                Low Stock Alerts
              </span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-md ${
                stats.lowStock.length > 0
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-auto pt-3">
              <p className="text-3xl leading-8 font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                {stats.lowStock.length}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-rose-600 dark:text-rose-400">{outOfStockCount} out of stock</span>
                <span>·</span>
                <span>{criticalStockCount} critical</span>
              </div>
            </div>
          </div>

          <div className="flex min-h-40 flex-col rounded-md border border-slate-200 border-t-4 border-t-amber-500 bg-white p-3 dark:border-slate-800 dark:border-t-amber-400 dark:bg-slate-900 lg:min-h-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                Total Products
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Package className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-auto pt-3">
              <p className="text-3xl leading-8 font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                {stats.products}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Products in catalog
              </p>
            </div>
          </div>

          <div className="flex min-h-40 flex-col rounded-md border border-slate-200 border-t-4 border-t-indigo-500 bg-white p-3 dark:border-slate-800 dark:border-t-indigo-400 dark:bg-slate-900 lg:min-h-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">Total Units Sold</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <Receipt className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-auto pt-1.5 text-3xl leading-8 font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
              {totalUnitsSold.toLocaleString()}
            </p>
          </div>
        </section>
      )}

      {/* 3. Analytics & Operations Section (Main Balanced Multi-Column Layout) */}
      <div className="space-y-4 xl:space-y-5">
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-12 xl:gap-5">
          {/* Top Selling Products Table */}
          <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-8">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Top Selling Products
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Leading products ranked by sales volume and revenue
                </p>
              </div>
              <Link
                href="/reports"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <span>Full report</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-152 text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="w-10 py-2.5 pl-1 pr-3">#</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="w-36 py-2.5 px-3">Category</th>
                    <th className="w-28 py-2.5 px-3 text-right">Units Sold</th>
                    <th className="w-32 py-2.5 pl-3 pr-1 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {stats.topProducts.length > 0 ? (
                    stats.topProducts.map((product, index) => (
                      <tr key={product.productId} className="h-14 transition-colors hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20">
                        <td className="py-2.5 pl-1 pr-3 font-semibold text-slate-400">{index + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                              {product.imageUrl ? (
                                <Image
                                  src={getPrimaryImageUrl(product.imageUrl) ?? "/logo/apc-logo.png"}
                                  alt={product.name}
                                  width={36}
                                  height={36}
                                  className="h-full w-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <span className="block min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100">
                              {product.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          <span className="inline-flex max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {product.categoryName ?? "Uncategorized"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium tabular-nums text-slate-700 dark:text-slate-300">
                          {product.quantity.toLocaleString()}
                        </td>
                        <td className="py-2.5 pl-3 pr-1 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          ₱{Number(product.revenue ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                            <Package className="h-5 w-5" />
                          </div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            No product sales recorded
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Try a different date range to view product performance.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sales Channels */}
          <div className="rounded-md border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Sales Channels
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Completed orders by sales channel
                </p>
              </div>
              <Link
                href="/analytics"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <span>Analytics</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div
              className="mb-4 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              aria-label={`${posOrderPercent}% POS, ${ecommerceOrderPercent}% Ecommerce`}
              role="img"
            >
              <div className="bg-emerald-600 transition-[width] dark:bg-emerald-400" style={{ width: `${posOrderPercent}%` }} />
              <div className="bg-indigo-500 transition-[width] dark:bg-indigo-400" style={{ width: `${ecommerceOrderPercent}%` }} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-md border border-emerald-200/80 bg-emerald-50/60 p-3.5 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Store className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                    POS Walk-in
                  </span>
                  <span className="text-xs font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                    {posOrderPercent}%
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">
                  {formatCurrency(posChannel.revenue)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {posChannel.orders.toLocaleString()} completed orders
                </p>
              </div>

              <div className="rounded-md border border-indigo-200/80 bg-indigo-50/60 p-3.5 dark:border-indigo-900/70 dark:bg-indigo-950/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Globe className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
                    Ecommerce
                  </span>
                  <span className="text-xs font-bold tabular-nums text-indigo-800 dark:text-indigo-300">
                    {ecommerceOrderPercent}%
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">
                  {formatCurrency(ecommerceChannel.revenue)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {ecommerceChannel.orders.toLocaleString()} completed orders
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
          {/* Today's Operational Pulse */}
          <div className="flex h-full flex-col rounded-md border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                Today&apos;s Overview
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Order fulfillment status for today
              </p>
            </div>

            <div className="space-y-2">
              <Link
                href="/admin-orders?status=PENDING"
                className="group flex min-h-17 items-center justify-between rounded-md border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-amber-700/60 dark:hover:bg-amber-950/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-800 transition-colors group-hover:text-amber-900 dark:text-slate-200 dark:group-hover:text-amber-100">Pending Orders</span>
                    <p className="text-[11px] text-slate-500 transition-colors group-hover:text-amber-800 dark:text-slate-400 dark:group-hover:text-amber-200">Requires processing</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {todayStats.pendingOrders}
                </span>
              </Link>

              <Link
                href="/admin-orders?status=COMPLETED"
                className="group flex min-h-17 items-center justify-between rounded-md border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-800 transition-colors group-hover:text-emerald-900 dark:text-slate-200 dark:group-hover:text-emerald-100">Completed Orders</span>
                    <p className="text-[11px] text-slate-500 transition-colors group-hover:text-emerald-800 dark:text-slate-400 dark:group-hover:text-emerald-200">Fulfilled today</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {todayStats.completedOrders}
                </span>
              </Link>

              <Link
                href="/admin-orders?status=CANCELLED"
                className="group flex min-h-17 items-center justify-between rounded-md border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-700/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <XCircle className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-800 transition-colors group-hover:text-slate-950 dark:text-slate-200 dark:group-hover:text-white">Cancelled Orders</span>
                    <p className="text-[11px] text-slate-500 transition-colors group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200">Voided today</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-slate-600 dark:text-slate-400">
                  {todayStats.cancelledOrders}
                </span>
              </Link>
            </div>
          </div>

          {/* Low Stock Attention List */}
          <div className="flex h-full flex-col rounded-md border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Low Stock Items
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Items currently at or below minimum threshold
                </p>
              </div>
              <Link
                href="/inventory"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <span>Inventory</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Scrollable Low Stock List */}
            <div className="flex-1 divide-y divide-slate-100 overflow-hidden border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {stats.lowStock.length > 0 ? (
                stats.lowStock.slice(0, 7).map((item) => {
                  const ratio = item.minStock > 0 ? item.stock / item.minStock : 0;
                  const isOutOfStock = item.stock <= 0;
                  const isCritical = !isOutOfStock && ratio <= 0.4;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-3 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="block truncate font-semibold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          Min required: {item.minStock}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            isOutOfStock
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                              : isCritical
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {item.stock} left
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  All inventory levels are currently sufficient.
                </div>
              )}
            </div>
          </div>

          {/* Quick Store Actions */}
          <div className="flex h-full flex-col rounded-md border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                Quick Actions
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Common management shortcuts
              </p>
            </div>

            <div className="space-y-2">
              <Link
                href="/inventory?view=add"
                className="flex min-h-11 items-center justify-between rounded-md border border-slate-200/80 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-slate-500" />
                  <span>Add New Product</span>
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </Link>

              <Link
                href="/admin-orders"
                className="flex min-h-11 items-center justify-between rounded-md border border-slate-200/80 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <div className="flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5 text-slate-500" />
                  <span>Manage All Orders</span>
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </Link>

              <Link
                href="/reports"
                className="flex min-h-11 items-center justify-between rounded-md border border-slate-200/80 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <div className="flex items-center gap-2">
                  <Warehouse className="h-3.5 w-3.5 text-slate-500" />
                  <span>View Sales Reports</span>
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
