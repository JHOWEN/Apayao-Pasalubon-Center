"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-data-cache";
import {
  DIRECT_STOCK_OUT_REASON_LABELS,
  DIRECT_STOCK_OUT_REASON_VALUES,
  getDirectStockOutReasonLabel,
} from "@/lib/direct-stock-out";

type DirectStockOutRecord = {
  id: string;
  createdAt: string;
  productDisplayName: string;
  variantSku: string | null;
  reason: string;
  quantity: number;
  unitCostSnapshot: number | null;
  estimatedLossValue: number | null;
  stockBefore: number | null;
  stockAfter: number | null;
  remarks: string | null;
  performedByName: string | null;
  isArchived: boolean;
};

type DirectStockOutReasonGroup = {
  reason: string;
  entries: number;
  units: number;
  estimatedValue: number;
  unvaluedEntries: number;
};

type DirectStockOutReport = {
  summary: {
    entries: number;
    units: number;
    estimatedValue: number;
    unvaluedEntries: number;
  };
  reasonBreakdown: DirectStockOutReasonGroup[];
  transactions: DirectStockOutRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return formatInputDate(date);
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function DirectStockOutReportPage() {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => formatInputDate(new Date()));
  const [reasonFilter, setReasonFilter] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<DirectStockOutReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    const params = new URLSearchParams({ startDate, endDate, page: String(page) });
    if (reasonFilter) params.set("reason", reasonFilter);

    try {
      const response = await adminFetch(`/api/admin/reports/direct-stock-out?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to load the direct stock-out report.");
      }
      setReport(data as DirectStockOutReport);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load the direct stock-out report.");
    } finally {
      setIsLoading(false);
    }
  }, [endDate, page, reasonFilter, startDate]);

  useEffect(() => {
    void loadReport();
    const handleInventoryUpdate = (event: Event) => {
      const message = (event as CustomEvent<{ type?: string }>).detail;
      if (
        message?.type === "inventory-updated" ||
        message?.type === "inventory-history-updated" ||
        message?.type === "admin-data-invalidated"
      ) {
        void loadReport();
      }
    };
    window.addEventListener("apc-admin-live-event", handleInventoryUpdate);
    return () => window.removeEventListener("apc-admin-live-event", handleInventoryUpdate);
  }, [loadReport]);

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMessage("");
    const params = new URLSearchParams({ startDate, endDate, export: "1" });
    if (reasonFilter) params.set("reason", reasonFilter);

    try {
      const response = await adminFetch(`/api/admin/reports/direct-stock-out?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to export the direct stock-out report.");
      }
      const exportReport = data as DirectStockOutReport;
      const header = [
        "Date",
        "Product",
        "SKU",
        "Reason",
        "Quantity",
        "Stock Before",
        "Stock After",
        "Unit Cost Snapshot",
        "Estimated Loss Value",
        "Recorded By",
        "Notes",
        "Archived",
      ];
      const rows = exportReport.transactions.map((record) => [
        new Date(record.createdAt).toLocaleString(),
        record.productDisplayName,
        record.variantSku ?? "",
        getDirectStockOutReasonLabel(record.reason),
        record.quantity,
        record.stockBefore ?? "",
        record.stockAfter ?? "",
        record.unitCostSnapshot ?? "",
        record.estimatedLossValue ?? "",
        record.performedByName || "System",
        record.remarks ?? "",
        record.isArchived ? "Yes" : "No",
      ]);
      const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `direct-stock-out-${startDate}-to-${endDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to export the direct stock-out report.");
    } finally {
      setIsExporting(false);
    }
  };

  const summary = report?.summary ?? { entries: 0, units: 0, estimatedValue: 0, unvaluedEntries: 0 };
  const pagination = report?.pagination ?? { page: 1, pageSize: 25, totalCount: 0, totalPages: 1 };

  return (
    <div className="space-y-6 pb-16 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/reports" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            Reports
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Direct Stock-out Report</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track manual stock deductions by reason, item, date, and staff member. Sales are excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || summary.entries === 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-emerald-600"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </button>
        </div>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          From
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => { setStartDate(event.target.value); setPage(1); }}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          To
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => { setEndDate(event.target.value); setPage(1); }}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Reason
          <select
            value={reasonFilter}
            onChange={(event) => { setReasonFilter(event.target.value); setPage(1); }}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All reasons</option>
            {DIRECT_STOCK_OUT_REASON_VALUES.map((reason) => (
              <option key={reason} value={reason}>{DIRECT_STOCK_OUT_REASON_LABELS[reason]}</option>
            ))}
            <option value="UNSPECIFIED">Unspecified (older entries)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => { setStartDate(""); setEndDate(""); setReasonFilter(""); setPage(1); }}
          className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          All history
        </button>
      </section>

      {errorMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={isLoading}>
        {[
          { label: "Stock-out entries", value: summary.entries.toLocaleString(), note: "Manual deductions" },
          { label: "Units deducted", value: summary.units.toLocaleString(), note: "Across matching entries" },
          { label: "Estimated item cost", value: formatCurrency(summary.estimatedValue), note: "Based on cost at deduction" },
          { label: "Older entries without cost", value: summary.unvaluedEntries.toLocaleString(), note: "Excluded from estimated cost" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{metric.value}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{metric.note}</p>
          </div>
        ))}
      </section>

      <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Estimated item cost uses the product or variant cost captured when each deduction was recorded. Older entries without a cost snapshot are excluded from the cost total.
      </p>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Boxes className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Breakdown by reason</h2>
        </div>
        {report?.reasonBreakdown.length ? (
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 dark:divide-slate-800">
            {report.reasonBreakdown.map((group) => (
              <div key={group.reason} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{getDirectStockOutReasonLabel(group.reason)}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{group.entries} entries · {group.units.toLocaleString()} units</p>
                </div>
                <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{formatCurrency(group.estimatedValue)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No direct stock-outs match this period and reason.</p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Direct stock-out activity</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{pagination.totalCount.toLocaleString()} matching entries</p>
          </div>
          {isLoading ? <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating report</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Date / Staff</th>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Reason / Notes</th>
                <th className="px-4 py-3 text-right font-semibold">Units</th>
                <th className="px-4 py-3 text-right font-semibold">Cost / Unit</th>
                <th className="px-4 py-3 text-right font-semibold">Estimated Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Stock Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {report?.transactions.map((record) => (
                <tr key={record.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">{new Date(record.createdAt).toLocaleString()}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{record.performedByName || "System"}{record.isArchived ? " · Archived" : ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{record.productDisplayName}</p>
                    {record.variantSku ? <p className="mt-1 text-[11px] text-slate-500">SKU: {record.variantSku}</p> : null}
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{getDirectStockOutReasonLabel(record.reason)}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-500 dark:text-slate-400">{record.remarks || "No additional notes"}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700 dark:text-rose-300">−{record.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{record.unitCostSnapshot == null ? "—" : formatCurrency(record.unitCostSnapshot)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{record.estimatedLossValue == null ? "Not recorded" : formatCurrency(record.estimatedLossValue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{record.stockBefore ?? "—"} → {record.stockAfter ?? "—"}</td>
                </tr>
              ))}
              {!isLoading && !report?.transactions.length ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No direct stock-outs found for these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Page {pagination.page} of {pagination.totalPages}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || isLoading}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"
            ><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              disabled={page >= pagination.totalPages || isLoading}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"
            >Next<ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
