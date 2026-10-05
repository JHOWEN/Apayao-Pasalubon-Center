"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  ListFilter,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  User,
  X,
} from "lucide-react";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";

interface ActivityRecord {
  id: string;
  type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT" | "RETURN";
  eventType?: string | null;
  quantity: number;
  stockBefore?: number | null;
  stockAfter?: number | null;
  reservedBefore?: number | null;
  reservedAfter?: number | null;
  remarks?: string | null;
  createdAt: string;
  performedByName?: string | null;
  performedByType?: string | null;
  source?: string | null;
  customerName?: string | null;
  orderNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
  productName?: string | null;
  productDisplayName?: string | null;
  variantLabel?: string | null;
  isArchived?: boolean | null;
  archivedAt?: string | null;
  product?: { name?: string };
  variant?: { sku?: string; attributes?: string | null } | null;
}

type ActivityFilter =
  | "ALL"
  | "STOCK_IN"
  | "STOCK_OUT"
  | "ADJUSTMENT"
  | "RETURN"
  | "POS_SALE"
  | "THRESHOLD_ADJUSTMENT";
type ArchiveFilter = "all" | "archived";

function movementLabel(
  type: ActivityRecord["type"],
  remarks?: string | null,
  eventType?: string | null,
) {
  const eventLabels: Record<string, string> = {
    POS_SALE: "POS Sale",
    THRESHOLD_ADJUSTMENT: "Adjustment",
    STOCK_IN: "Stock In",
    STOCK_OUT: "Stock Out",
    RETURN: "Return",
  };
  if (eventType && eventLabels[eventType]) return eventLabels[eventType];
  const text = remarks?.toLowerCase() ?? "";
  if (type === "STOCK_IN" && text.includes("initial stock"))
    return "Product Created";
  if (type === "STOCK_IN") return "Stock In";
  if (type === "STOCK_OUT") return "Stock Out";
  if (type === "RETURN") return "Return";
  return "Adjustment";
}

function stockChangeLabel(record: ActivityRecord) {
  const quantity = Math.abs(Number(record.quantity) || 0);
  const text = record.remarks?.toLowerCase() ?? "";
  if (record.eventType === "POS_SALE") return `-${quantity} stock (sold)`;
  if (record.type === "STOCK_OUT")
    return record.source?.toUpperCase() === "INVENTORY"
      ? `-${quantity} stock (direct deduction)`
      : `-${quantity}`;
  if (record.type === "RETURN") return `+${quantity}`;
  if (record.type === "STOCK_IN")
    return text.includes("initial stock")
      ? `+${quantity} stock (initial)`
      : record.source?.toUpperCase() === "INVENTORY"
        ? `+${quantity} stock (direct addition)`
        : `+${quantity}`;
  return text.includes("threshold")
    ? `No stock change (minimum: ${quantity})`
    : record.source?.toUpperCase() === "INVENTORY"
      ? `Stock set to ${record.quantity} (direct adjustment)`
      : `Stock set to ${record.quantity}`;
}

function sourceLabel(source?: string | null) {
  if (source?.toUpperCase() === "POS") return "POS Terminal";
  if (source?.toUpperCase() === "ECOMMERCE") return "Storefront";
  return "Store";
}

function stockTransitionLabel(record: ActivityRecord) {
  if (record.stockBefore == null || record.stockAfter == null) return "Not recorded";
  return `${record.stockBefore} -> ${record.stockAfter}`;
}

function badgeClasses(
  type: ActivityRecord["type"],
  archived: boolean,
  eventType?: string | null,
) {
  if (archived)
    return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  if (eventType === "POS_SALE")
    return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300";
  if (type === "STOCK_IN")
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (type === "STOCK_OUT")
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300";
  if (type === "RETURN")
    return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300";
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
}

export default function InventoryTransactionsPage() {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState<ActivityFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ActivityRecord | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      search,
      type: movementFilter,
      source: sourceFilter === "ALL" ? "" : sourceFilter,
      fromDate,
      toDate,
      archiveMode: archiveFilter,
    });
    try {
      const response = await fetch(`/api/admin/inventory?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          data?.message || "Unable to load inventory transactions.",
        );
      setRecords(Array.isArray(data?.transactions) ? data.transactions : []);
      setTotalCount(Number(data?.pagination?.totalCount) || 0);
      setCounts(
        data?.counts && typeof data.counts === "object" ? data.counts : {},
      );
    } catch (error) {
      setRecords([]);
      setTotalCount(0);
      setCounts({});
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load inventory transactions.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [archiveFilter, fromDate, movementFilter, page, pageSize, search, sourceFilter, toDate]);

  useEffect(() => {
    const loadTimeout = window.setTimeout(() => {
      void loadRecords();
    }, 0);
    return () => window.clearTimeout(loadTimeout);
  }, [loadRecords]);

  useEffect(() => {
    if (!selectedRecord) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRecord(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedRecord]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const startRecord = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRecord = Math.min(safePage * pageSize, totalCount);
  const hasFilters = Boolean(
    search ||
    movementFilter !== "ALL" ||
    sourceFilter !== "ALL" ||
    archiveFilter !== "all" ||
    fromDate ||
    toDate,
  );
  const activeFilterCount = [
    search.trim(),
    movementFilter !== "ALL",
    sourceFilter !== "ALL",
    archiveFilter !== "all",
    fromDate,
    toDate,
  ].filter(Boolean).length;
  const visibleAllSelected =
    records.length > 0 &&
    records.every((record) => selectedIds.includes(record.id));
  const countsByType = {
    STOCK_IN: counts.STOCK_IN ?? 0,
    STOCK_OUT: counts.STOCK_OUT ?? 0,
    ADJUSTMENT: counts.ADJUSTMENT ?? 0,
    RETURN: counts.RETURN ?? 0,
    POS_SALE: counts.POS_SALE ?? 0,
    THRESHOLD_ADJUSTMENT: counts.THRESHOLD_ADJUSTMENT ?? 0,
  };

  function resetFilters() {
    setSearch("");
    setMovementFilter("ALL");
    setSourceFilter("ALL");
    setArchiveFilter("all");
    setFromDate("");
    setToDate("");
    setPage(1);
    setSelectedIds([]);
  }

  function applyDatePreset(days: number | null) {
    if (days === null) {
      changeFilter(setFromDate, "");
      changeFilter(setToDate, "");
      return;
    }

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    changeFilter(setFromDate, start.toISOString().slice(0, 10));
    changeFilter(setToDate, end.toISOString().slice(0, 10));
  }

  function changeFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
    setSelectedIds([]);
  }

  function pageNumbers(): Array<number | string> {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
    if (safePage >= totalPages - 3)
      return [
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    return [1, "...", safePage - 1, safePage, safePage + 1, "...", totalPages];
  }

  async function updateArchive(action: "archive" | "restore", ids: string[]) {
    if (!ids.length) return;
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          data?.message || "Unable to update transaction archive state.",
        );
      setSelectedIds([]);
      setSelectedRecord(null);
      await loadRecords();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to update transaction archive state.",
      );
    }
  }

  async function exportRecords() {
    const params = new URLSearchParams({
      search,
      type: movementFilter,
      source: sourceFilter === "ALL" ? "" : sourceFilter,
      fromDate,
      toDate,
      archiveMode: archiveFilter,
      export: "1",
    });
    try {
      const response = await fetch(`/api/admin/inventory?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.message || "Unable to export transactions.");
      const exportRows = Array.isArray(data?.transactions)
        ? (data.transactions as ActivityRecord[])
        : records;
      const rows = [
        [
          "Transaction ID",
          "Date",
          "Product",
          "Movement",
          "Event Type",
          "Stock Change",
          "Stock Before",
          "Stock After",
          "Performed by",
          "Actor type",
          "Channel",
          "Customer",
          "Order",
          "Payment Method",
          "Payment Status",
          "Payment Reference",
          "Archived",
          "Archived At",
          "Remarks",
        ],
        ...exportRows.map((record) => [
          record.id,
          new Date(record.createdAt).toLocaleString(),
          record.productDisplayName ||
            record.productName ||
            record.product?.name ||
            "Unknown product",
          movementLabel(record.type, record.remarks, record.eventType),
          record.eventType || "",
          stockChangeLabel(record),
          record.stockBefore ?? "Not recorded",
          record.stockAfter ?? "Not recorded",
          record.performedByName || "System",
          record.performedByType || "SYSTEM",
          sourceLabel(record.source),
          record.customerName || "",
          record.orderNumber || "",
          record.paymentMethod || "",
          record.paymentStatus || "",
          record.paymentReference || "",
          record.isArchived ? "Yes" : "No",
          record.archivedAt ? new Date(record.archivedAt).toLocaleString() : "",
          record.remarks || "",
        ]),
      ];
      const csv = rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to export transactions.",
      );
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Inventory Transactions
            </h1>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {totalCount.toLocaleString()} entries
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track stock received, sold, returned, and reserved for open orders.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadRecords()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Refresh transaction records"
          >
            <RefreshCw
              className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void exportRecords()}
            disabled={!totalCount}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            [
              "Stock In Entries",
              countsByType.STOCK_IN,
              ArrowDownRight,
              "text-emerald-600",
            ],
            ["POS Sales", countsByType.POS_SALE, ArrowUpRight, "text-rose-600"],
            ["Adjustments", countsByType.ADJUSTMENT, ClipboardList, "text-amber-600"],
            ["Returns", countsByType.RETURN, RotateCcw, "text-amber-600"],
          ] as const
        ).map(([label, count, Icon, color]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {count.toLocaleString()}
            </div>
            <p className={`mt-1 text-[11px] font-medium ${color}`}>
              {label === "Returns"
                ? "Customer returns to stock"
                : "Ledger entries"}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListFilter className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Filter ledger</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {activeFilterCount} active
            </span>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-rose-700 hover:text-rose-800 dark:text-rose-300"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => changeFilter(setSearch, event.target.value)}
            placeholder="Search product, variant, staff, order, customer, or remarks"
            className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            aria-label="Search inventory transactions"
          />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Movement type</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ["ALL", "All activity"],
                ["STOCK_IN", "Stock in"],
                ["STOCK_OUT", "Stock out"],
                ["ADJUSTMENT", "Adjustments"],
                ["RETURN", "Returns"],
                ["POS_SALE", "POS sales"],
                ["THRESHOLD_ADJUSTMENT", "Thresholds"],
              ] as [ActivityFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeFilter(setMovementFilter, value)}
                aria-pressed={movementFilter === value}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${movementFilter === value ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}
              >
                {label}
                <span className={movementFilter === value ? "text-white/70 dark:text-slate-600" : "text-slate-400"}>
                  {value === "ALL" ? totalCount : countsByType[value as keyof typeof countsByType] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-4 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <label className="space-y-1.5 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Source</span>
              <select
                value={sourceFilter}
                onChange={(event) => changeFilter(setSourceFilter, event.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                aria-label="Transaction source filter"
              >
                <option value="ALL">All sources</option>
                <option value="ECOMMERCE">Storefront</option>
                <option value="POS">POS terminal</option>
                <option value="INVENTORY">Inventory</option>
              </select>
            </label>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">Record status</legend>
              <div className="flex h-9 rounded-md border border-slate-200 p-0.5 dark:border-slate-700">
                {([ ["all", "Active"], ["archived", "Archived"] ] as [ArchiveFilter, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeFilter(setArchiveFilter, value)}
                    aria-pressed={archiveFilter === value}
                    className={`flex-1 rounded px-2 text-xs font-semibold transition ${archiveFilter === value ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <CalendarDays className="h-3.5 w-3.5" />
              Recorded date
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-36 flex-1 items-center gap-2 rounded-md border border-slate-200 px-2.5 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-[10px] font-semibold uppercase text-slate-400">From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => changeFilter(setFromDate, event.target.value)}
                  className="h-8 min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200"
                  aria-label="Transactions from date"
                />
              </label>
              <label className="flex min-w-36 flex-1 items-center gap-2 rounded-md border border-slate-200 px-2.5 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-[10px] font-semibold uppercase text-slate-400">To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => changeFilter(setToDate, event.target.value)}
                  className="h-8 min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200"
                  aria-label="Transactions to date"
                />
              </label>
              <div className="flex items-center gap-1">
                {([[0, "Today"], [7, "7 days"], [30, "30 days"], [null, "Any time"]] as [number | null, string][]).map(([days, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applyDatePreset(days)}
                    className="h-8 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => void loadRecords()}
            className="font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Transaction ledger</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {startRecord.toLocaleString()}-{endRecord.toLocaleString()} of {totalCount.toLocaleString()} records
            </p>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3" aria-live="polite">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => void updateArchive(archiveFilter === "archived" ? "restore" : "archive", selectedIds)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700"
              >
                {archiveFilter === "archived" ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                {archiveFilter === "archived" ? "Restore selected" : "Archive selected"}
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-245 text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {[
                  "",
                  "Date & time",
                  "Product / variant",
                  "Movement",
                  "Stock change",
                  "Stock left",
                  "Recorded by / channel",
                  "Order / customer / audit note",
                ].map((heading, index) => (
                  <th
                    key={heading || "select"}
                    className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600 dark:text-slate-300"
                  >
                    {index === 0 ? (
                      <input
                        type="checkbox"
                        aria-label="Select all visible transactions"
                        checked={visibleAllSelected}
                        onChange={() =>
                          setSelectedIds(
                            visibleAllSelected
                              ? []
                              : records.map((record) => record.id),
                          )
                        }
                      />
                    ) : (
                      heading
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-14 text-center text-slate-500"
                  >
                    Loading transactions ledger...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <ClipboardList className="mx-auto mb-2 h-7 w-7 text-slate-400" />
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      No inventory transactions found
                    </p>
                    <p className="mt-1 text-slate-500">
                      {hasFilters
                        ? "No transactions match your active filters."
                        : "No transactions recorded in the system yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select transaction ${record.id}`}
                        checked={selectedIds.includes(record.id)}
                        onChange={() =>
                          setSelectedIds((current) =>
                            current.includes(record.id)
                              ? current.filter((id) => id !== record.id)
                              : [...current, record.id],
                          )
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="block font-medium">{new Date(record.createdAt).toLocaleDateString()}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">{new Date(record.createdAt).toLocaleTimeString()}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {record.productDisplayName ||
                        record.productName ||
                        record.product?.name ||
                        "Unknown item"}
                      {record.variantLabel && (
                        <div className="mt-0.5 font-normal text-slate-500">
                          {record.variantLabel}
                          {record.variant?.sku
                            ? ` | SKU: ${record.variant.sku}`
                            : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${badgeClasses(record.type, Boolean(record.isArchived), record.eventType)}`}
                      >
                        {record.isArchived
                          ? "Archived"
                          : movementLabel(record.type, record.remarks, record.eventType)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                      {stockChangeLabel(record)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700 dark:text-slate-200">
                      {record.stockAfter ?? "Not recorded"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-slate-800 dark:text-slate-200">{record.performedByName?.trim() || "System"}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {record.performedByType || "SYSTEM"} | {sourceLabel(record.source)}
                      </span>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <span className="block font-medium text-slate-800 dark:text-slate-200">
                        {record.orderNumber ? `#${record.orderNumber}` : record.customerName || "No linked order"}
                      </span>
                      {record.orderNumber && record.customerName && <span className="block text-[10px] text-slate-500">{record.customerName}</span>}
                      <span className="mt-1 line-clamp-2 block wrap-break-word text-[11px] text-slate-500" title={record.remarks || undefined}>
                        {record.remarks || "No remarks"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {startRecord.toLocaleString()}
              </strong>{" "}
              to{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {endRecord.toLocaleString()}
              </strong>{" "}
              of{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {totalCount.toLocaleString()}
              </strong>{" "}
              transactions
            </span>
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-slate-700">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1 || isLoading}
              onClick={() => setPage(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={safePage <= 1 || isLoading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="font-medium">Prev</span>
            </button>
            {pageNumbers().map((value, index) =>
              typeof value === "number" ? (
                <button
                  key={value}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setPage(value)}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition disabled:opacity-40 ${
                    value === safePage
                      ? "bg-slate-900 text-white shadow-sm dark:bg-emerald-600"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {value}
                </button>
              ) : (
                <span key={`dots-${index}`} className="px-1 text-slate-400 dark:text-slate-500">{value}</span>
              ),
            )}
            <button
              type="button"
              disabled={safePage >= totalPages || isLoading}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Next page"
            >
              <span className="font-medium">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages || isLoading}
              onClick={() => setPage(totalPages)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            </div>
          </div>
        </div>
      </section>

      {selectedRecord && (
        <AdminModalPortal>
          <div
            className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
            onClick={() => setSelectedRecord(null)}
          >
            <aside
              className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                    <FileText className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">
                      Transaction Details
                    </h2>
                    <p className="text-xs text-slate-500">
                      Comprehensive audit record
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  aria-label="Close details"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-5 p-6">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                  <div>
                    <p className="text-xs text-slate-500">Movement type</p>
                    <span
                      className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${badgeClasses(selectedRecord.type, Boolean(selectedRecord.isArchived), selectedRecord.eventType)}`}
                    >
                      {selectedRecord.isArchived
                        ? "Archived"
                        : movementLabel(
                            selectedRecord.type,
                            selectedRecord.remarks,
                            selectedRecord.eventType,
                          )}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Stock change</p>
                    <p className="mt-1 text-xl font-bold">
                      {stockChangeLabel(selectedRecord)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <p className="text-xs text-slate-500">Stock transition</p>
                    <p className="mt-2 text-lg font-semibold tabular-nums">
                      {stockTransitionLabel(selectedRecord)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Before {"->"} After</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Recorded date and time
                  </div>
                  <p className="mt-2 text-sm">
                    {new Date(selectedRecord.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                    {selectedRecord.createdAt}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <ClipboardList className="h-4 w-4 text-slate-400" />
                    Record metadata
                  </div>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                    <dt className="text-slate-500">Transaction ID</dt>
                    <dd className="break-all text-right font-mono text-[11px]">{selectedRecord.id}</dd>
                    <dt className="text-slate-500">Archive state</dt>
                    <dd className="text-right font-medium">{selectedRecord.isArchived ? "Archived" : "Active"}</dd>
                    {selectedRecord.archivedAt && (
                      <>
                        <dt className="text-slate-500">Archived at</dt>
                        <dd className="text-right">{new Date(selectedRecord.archivedAt).toLocaleString()}</dd>
                      </>
                    )}
                  </dl>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Package className="h-4 w-4 text-slate-400" />
                    Item details
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Product</p>
                  <p className="font-semibold">
                    {selectedRecord.productDisplayName ||
                      selectedRecord.productName ||
                      selectedRecord.product?.name ||
                      "Unknown product"}
                  </p>
                  {selectedRecord.variantLabel && (
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedRecord.variantLabel}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <User className="h-4 w-4 text-slate-400" />
                    Actor and channel
                  </div>
                  <p className="mt-3">
                    {selectedRecord.performedByName || "System"} (
                    {selectedRecord.performedByType || "SYSTEM"})
                  </p>
                  <p className="text-sm text-slate-500">
                    {sourceLabel(selectedRecord.source)}
                    {selectedRecord.orderNumber
                      ? ` | #${selectedRecord.orderNumber}`
                      : ""}
                  </p>
                </div>
                  {(selectedRecord.paymentMethod || selectedRecord.paymentStatus || selectedRecord.paymentReference) && (
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <FileText className="h-4 w-4 text-slate-400" />
                        Payment audit
                      </div>
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                        <dt className="text-slate-500">Method</dt>
                        <dd className="text-right">{selectedRecord.paymentMethod || "Not recorded"}</dd>
                        <dt className="text-slate-500">Status</dt>
                        <dd className="text-right">{selectedRecord.paymentStatus || "Not recorded"}</dd>
                        <dt className="text-slate-500">Reference</dt>
                        <dd className="break-all text-right font-mono text-[11px]">{selectedRecord.paymentReference || "Not recorded"}</dd>
                      </dl>
                    </div>
                  )}
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <FileText className="h-4 w-4 text-slate-400" />
                    Full audit remarks
                  </div>
                  <p className="mt-3 whitespace-pre-wrap wrap-break-word rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-800/70">
                    {selectedRecord.remarks ||
                      "No remarks provided for this transaction entry."}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() =>
                    void updateArchive(
                      selectedRecord.isArchived ? "restore" : "archive",
                      [selectedRecord.id],
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800"
                >
                  {selectedRecord.isArchived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  {selectedRecord.isArchived ? "Restore" : "Archive"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  Close
                </button>
              </div>
            </aside>
          </div>
        </AdminModalPortal>
      )}
    </div>
  );
}
