"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";
import {
  CalendarRange,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  Package,
  Store,
  Globe,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  AlertTriangle,
  Sparkles,
  BarChart3,
  Layers,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AnalyticsRange = "DAILY" | "WEEKLY" | "MONTHLY" | "ANNUALLY" | "CUSTOM";

type AnalyticsStats = {
  customers: number;
  products: number;
  orders: number;
  pendingOrders?: number;
  cancelledOrders?: number;
  completedOrders?: number;
  revenue: number;
  totalCost?: number;
  totalPrice?: number;
  lowStock: Array<{ id: string; name: string; stock: number; minStock: number }>;
  revenueTrend: Array<{ label: string; revenue: number }>;
  statusBreakdown: Array<{ name: string; orders: number }>;
  channelComparison: Array<{ name: string; orders: number; revenue: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    imageUrl?: string | null;
    categoryName?: string;
    quantity: number;
    revenue: number;
    orders: number;
  }>;
  completionRate: number;
  avgOrderValue: number;
  salesByCategory: Array<{ name: string; revenue: number; quantity: number }>;
  salesByProduct: Array<{ name: string; revenue: number; quantity: number }>;
  inventoryHealth: {
    lowStockCount: number;
    outOfStockCount: number;
    averageStock: number;
  };
  inventoryMovement?: {
    stockIn: number;
    stockOut: number;
    netChange: number;
    lowStockCount: number;
  };
};

const rangeOptions: { label: string; value: AnalyticsRange }[] = [
  { label: "Today", value: "DAILY" },
  { label: "Last 7 Days", value: "WEEKLY" },
  { label: "Last 30 Days", value: "MONTHLY" },
  { label: "Last 12 Months", value: "ANNUALLY" },
  { label: "Custom Range", value: "CUSTOM" },
];

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const formatCurrency = (val: number) =>
  `₱${Number(val ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatCompactCurrency = (val: number) => {
  const num = Number(val ?? 0);
  if (num >= 1_000_000) return `₱${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `₱${(num / 1_000).toFixed(1)}k`;
  return `₱${num.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsStats>({
    customers: 0,
    products: 0,
    orders: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    completedOrders: 0,
    revenue: 0,
    lowStock: [],
    revenueTrend: [],
    statusBreakdown: [],
    channelComparison: [],
    topProducts: [],
    completionRate: 0,
    avgOrderValue: 0,
    salesByCategory: [],
    salesByProduct: [],
    inventoryHealth: {
      lowStockCount: 0,
      outOfStockCount: 0,
      averageStock: 0,
    },
    inventoryMovement: {
      stockIn: 0,
      stockOut: 0,
      netChange: 0,
      lowStockCount: 0,
    },
  });

  const [range, setRange] = useState<AnalyticsRange>("WEEKLY");
  const [customFrom, setCustomFrom] = useState(() =>
    formatInputDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  );
  const [customTo, setCustomTo] = useState(() => formatInputDate(new Date()));
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Sync with document theme for Recharts styling
  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains("dark"));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  // Fetch analytics stats
  useEffect(() => {
    let ignore = false;

    async function fetchStats() {
      try {
        const params = new URLSearchParams({ range });
        if (range === "CUSTOM" && customFrom && customTo) {
          params.set("from", customFrom);
          params.set("to", customTo);
        }
        const response = await fetch(`/api/admin/analytics?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch analytics");
        const data = await response.json();
        if (!ignore) {
          setStats(data);
        }
      } catch (err) {
        console.error("Analytics fetch error:", err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void fetchStats();

    return () => {
      ignore = true;
    };
  }, [range, customFrom, customTo, refreshIndex]);

  const handleManualRefresh = () => {
    setLoading(true);
    setRefreshIndex((prev) => prev + 1);
  };

  const handleSelectRange = (selected: AnalyticsRange) => {
    setRange(selected);
    if (selected === "CUSTOM") {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      setLoading(true);
    }
  };

  // Recharts styling tokens
  const chartColors = useMemo(
    () => ({
      emerald: isDarkMode ? "#34D399" : "#059669",
      indigo: isDarkMode ? "#818CF8" : "#4F46E5",
      amber: isDarkMode ? "#FBBF24" : "#D97706",
      rose: isDarkMode ? "#F87171" : "#E11D48",
      surface: isDarkMode ? "#0F172A" : "#FFFFFF",
      border: isDarkMode ? "#334155" : "#E2E8F0",
      grid: isDarkMode ? "#1E293B" : "#F1F5F9",
      axis: isDarkMode ? "#94A3B8" : "#64748B",
      text: isDarkMode ? "#F8FAFC" : "#0F172A",
      muted: isDarkMode ? "#94A3B8" : "#64748B",
    }),
    [isDarkMode]
  );

  const tooltipContentStyle = useMemo(
    () => ({
      backgroundColor: chartColors.surface,
      borderColor: chartColors.border,
      borderRadius: "0.75rem",
      color: chartColors.text,
      fontSize: "12px",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
      padding: "10px 14px",
    }),
    [chartColors]
  );

  // Computed data calculations
  const categoryRevenueTotal = useMemo(
    () =>
      Math.max(
        stats.salesByCategory.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0),
        1
      ),
    [stats.salesByCategory]
  );

  const topProductsRevenueTotal = useMemo(
    () =>
      Math.max(
        (stats.topProducts ?? []).reduce((sum, item) => sum + Number(item.revenue ?? 0), 0),
        1
      ),
    [stats.topProducts]
  );

  // Channels comparison metrics
  const posChannel = stats.channelComparison.find((c) => c.name.includes("POS")) || {
    name: "POS (Walk-in)",
    orders: 0,
    revenue: 0,
  };
  const ecommerceChannel = stats.channelComparison.find((c) => !c.name.includes("POS")) || {
    name: "Ecommerce",
    orders: 0,
    revenue: 0,
  };
  const totalChannelOrders = Math.max(posChannel.orders + ecommerceChannel.orders, 1);
  const posOrderPercent = Math.round((posChannel.orders / totalChannelOrders) * 100);
  const ecommerceOrderPercent = 100 - posOrderPercent;

  return (
    <div className="space-y-6 pb-12 text-slate-900 dark:text-slate-100">
      {/* 1. Header & Period Filter Toolbar */}
      <header className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-row items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Analytics
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Revenue overview, sales channels, and inventory health.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={loading}
              title="Refresh Analytics"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loading
                    ? "animate-spin text-emerald-600 dark:text-emerald-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              />
              <span>{loading ? "Updating..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Segmented Period Selector Toolbar */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <div className="flex flex-row items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-1 dark:border-slate-800 dark:bg-slate-950/60">
              {rangeOptions.map((option) => {
                const isActive = range === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelectRange(option.value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium tracking-tight transition ${
                      isActive
                        ? "bg-white text-emerald-700 font-semibold shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-emerald-400 dark:ring-slate-700"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Range Indicator or Quick Date Picker Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustomPicker((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  showCustomPicker || range === "CUSTOM"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                <span>Custom Dates</span>
              </button>
            </div>
          </div>

          {/* Collapsible Custom Date Pickers */}
          {showCustomPicker && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-1 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="analytics-custom-from"
                    className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                  >
                    Start Date
                  </label>
                  <input
                    id="analytics-custom-from"
                    type="date"
                    value={customFrom}
                    max={customTo || formatInputDate(new Date())}
                    onChange={(event) => {
                      setCustomFrom(event.target.value);
                      setRange("CUSTOM");
                    }}
                    className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="analytics-custom-to"
                    className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                  >
                    End Date
                  </label>
                  <input
                    id="analytics-custom-to"
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={formatInputDate(new Date())}
                    onChange={(event) => {
                      setCustomTo(event.target.value);
                      setRange("CUSTOM");
                    }}
                    className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setRange("CUSTOM");
                      setLoading(true);
                      setRefreshIndex((prev) => prev + 1);
                    }}
                    className="h-8 w-full rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2. Primary 4-Card Executive KPI Grid */}
      <section aria-label="Executive Metrics" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Metric 1: Gross Sales Revenue */}
        <div className="group rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gross Revenue
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <span className="text-sm font-bold leading-none" aria-hidden="true">₱</span>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {loading ? "--" : formatCurrency(stats.revenue)}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {stats.completedOrders ?? 0}
              </span>{" "}
              completed orders in period
            </div>
          </div>
        </div>

        {/* Metric 2: Average Order Value (AOV) */}
        <div className="group rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Avg. Order Value
            </span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {loading ? "--" : formatCurrency(stats.avgOrderValue)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Per completed transaction
            </p>
          </div>
        </div>

        {/* Metric 3: Fulfillment Rate */}
        <div className="group rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Fulfillment Rate
            </span>
            <div className="rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {loading ? "--" : `${stats.completionRate.toFixed(1)}%`}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{stats.orders} active</span>
              <span>•</span>
              <span className="text-rose-500 dark:text-rose-400">
                {stats.cancelledOrders ?? 0} cancelled
              </span>
            </div>
          </div>
        </div>

        {/* Metric 4: Inventory Watch */}
        <div className="group rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Inventory Watch
            </span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {loading ? "--" : `${stats.inventoryHealth.averageStock.toFixed(1)} avg`}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {stats.inventoryHealth.lowStockCount} low
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-rose-600 dark:text-rose-400">
                {stats.inventoryHealth.outOfStockCount} out of stock
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Primary Visual Analytics: Revenue Dynamics & Channel Distribution */}
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        {/* Left: Revenue Dynamics Area Chart */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-row items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Revenue Overview
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {range === "DAILY"
                  ? "Completed daily sales volume"
                  : range === "WEEKLY"
                  ? "Daily sales movement across the last 7 days"
                  : range === "MONTHLY"
                  ? "Daily sales movement across the last 30 days"
                  : range === "ANNUALLY"
                  ? "Monthly aggregated gross sales"
                  : "Daily sales movement across the selected period"}
              </p>
            </div>
            <div className="self-start rounded-lg border border-slate-100 bg-slate-50 px-3 py-1 text-right dark:border-slate-800 dark:bg-slate-800/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Period Total
              </span>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {loading ? "--" : formatCurrency(stats.revenue)}
              </p>
            </div>
          </div>

          <div className="h-72 w-full min-w-0">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : stats.revenueTrend.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No revenue records found for this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.revenueTrend}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="analyticsRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.emerald} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={chartColors.emerald} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke={chartColors.grid}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: chartColors.axis }}
                    stroke={chartColors.border}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: chartColors.axis }}
                    stroke={chartColors.border}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatCompactCurrency}
                  />
                  <Tooltip
                    allowEscapeViewBox={{ x: false, y: false }}
                    contentStyle={tooltipContentStyle}
                    labelStyle={{ fontWeight: "bold", color: chartColors.text, marginBottom: "4px" }}
                    formatter={(value: unknown) => [
                      formatCurrency(Number(value ?? 0)),
                      "Completed Revenue",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={chartColors.emerald}
                    strokeWidth={2.5}
                    fill="url(#analyticsRevenueGradient)"
                    dot={{ r: 3, fill: chartColors.emerald, strokeWidth: 1 }}
                    activeDot={{
                      r: 6,
                      fill: chartColors.indigo,
                      stroke: chartColors.emerald,
                      strokeWidth: 2,
                    }}
                    isAnimationActive
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Right: Sales Channels Distribution (Donut Chart + Summary Cards) */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Sales Channels
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Transaction and revenue split between in-store POS and Ecommerce
            </p>
          </div>

          <div className="my-3 flex h-48 items-center justify-center">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.channelComparison}
                    dataKey="orders"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={76}
                    paddingAngle={3}
                    labelLine={false}
                    isAnimationActive
                    animationDuration={800}
                  >
                    <Cell fill={chartColors.emerald} />
                    <Cell fill={chartColors.indigo} />
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value: unknown, name: unknown) => [
                      `${Number(value ?? 0)} orders`,
                      String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Breakdown Cards */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* POS Card */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Store className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  POS Walk-in
                </span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {posOrderPercent}%
                </span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                {loading ? "--" : formatCurrency(posChannel.revenue)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {posChannel.orders} orders
              </p>
            </div>

            {/* Ecommerce Card */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Globe className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  Ecommerce
                </span>
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  {ecommerceOrderPercent}%
                </span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                {loading ? "--" : formatCurrency(ecommerceChannel.revenue)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {ecommerceChannel.orders} orders
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* 4. Deep Breakdown: Category Sales, Product Performance, & Inventory Velocity */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Col 1: Sales by Category */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Sales by Category
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Revenue distribution across catalog categories
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : stats.salesByCategory.length > 0 ? (
              stats.salesByCategory.slice(0, 5).map((category, index) => {
                const sharePercent = Number(
                  ((category.revenue / categoryRevenueTotal) * 100).toFixed(1)
                );
                return (
                  <div key={category.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          #{index + 1}
                        </span>
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                          {category.name}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          ({category.quantity} units)
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(category.revenue)}
                        </span>
                        <span className="ml-1 text-[11px] text-slate-400">
                          {sharePercent}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
                        style={{ width: `${Math.max(sharePercent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No category sales recorded.
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Catalog Total: {stats.salesByCategory.length} categories
            </span>
          </div>
        </section>

        {/* Col 2: Top Performing Products */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Top Products
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Highest grossing products in this period
            </p>
          </div>

          <div className="mt-5 space-y-3.5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : stats.topProducts && stats.topProducts.length > 0 ? (
              stats.topProducts.slice(0, 5).map((product, index) => {
                const productImageUrl = getPrimaryImageUrl(product.imageUrl);
                const sharePercent = Number(
                  ((product.revenue / topProductsRevenueTotal) * 100).toFixed(1)
                );

                return (
                  <div
                    key={product.productId}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 p-2 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      #{index + 1}
                    </span>

                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                      {productImageUrl ? (
                        <Image
                          src={productImageUrl}
                          alt={product.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{product.quantity} sold</span>
                        <span>•</span>
                        <span>{product.orders} orders</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {formatCurrency(product.revenue)}
                      </p>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {sharePercent}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No product sales recorded.
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Showing top 5 revenue contributors
            </span>
          </div>
        </section>

        {/* Col 3: Inventory Velocity & Critical Stock */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Inventory Velocity
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Stock movement throughput & low-stock warnings
            </p>
          </div>

          {/* Movement Flow Stat Cards */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 text-center dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <ArrowDownRight className="h-3 w-3" />
                Inflow
              </span>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                +{stats.inventoryMovement?.stockIn ?? 0}
              </p>
            </div>

            <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                <ArrowUpRight className="h-3 w-3" />
                Outflow
              </span>
              <p className="text-sm font-bold text-rose-800 dark:text-rose-300">
                -{stats.inventoryMovement?.stockOut ?? 0}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-center dark:border-slate-700 dark:bg-slate-800">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Net Flow
              </span>
              <p
                className={`text-sm font-bold ${
                  (stats.inventoryMovement?.netChange ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {(stats.inventoryMovement?.netChange ?? 0) > 0 ? "+" : ""}
                {stats.inventoryMovement?.netChange ?? 0}
              </p>
            </div>
          </div>

          {/* Low Stock Warning List */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Critical Stock Pressure
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {stats.inventoryHealth.lowStockCount} items
              </span>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ) : stats.lowStock && stats.lowStock.length > 0 ? (
                stats.lowStock.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-amber-50/40 p-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/20"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">
                        Min threshold: {item.minStock} units
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                      {item.stock} left
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  All inventory stocks are above minimum threshold.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Avg. Stock Level: {stats.inventoryHealth.averageStock} units/item
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
