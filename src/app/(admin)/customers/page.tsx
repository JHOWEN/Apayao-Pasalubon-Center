"use client";
import { AdminToast } from "@/components/admin/admin-toast";

import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  CreditCard,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  User,
  Users,
  X,
} from "lucide-react";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import {
  ADMIN_MODAL_BACKDROP_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  imageUrl?: string | null;
  emailVerified: boolean;
  isBlocked?: boolean;
  createdAt: string;
  updatedAt: string;
  orders: number;
  completedOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
  lastOrderStatus: string | null;
  hasOrders: boolean;
};

type FilterKey = "all" | "verified" | "blocked" | "withOrders";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [jumpInput, setJumpInput] = useState("");

  // Modal states
  const [viewingCustomer, setViewingCustomer] = useState<CustomerRow | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);
  const [blockingCustomer, setBlockingCustomer] = useState<CustomerRow | null>(null);

  // Edit form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    emailVerified: false,
  });
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Auto dismiss toast
  // Lock body scroll when any modal is active
  useEffect(() => {
    const hasModal = Boolean(viewingCustomer || editingCustomer || blockingCustomer);
    if (!hasModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [viewingCustomer, editingCustomer, blockingCustomer]);

  // Handle ESC key to close open modals
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (blockingCustomer) setBlockingCustomer(null);
        else if (editingCustomer) setEditingCustomer(null);
        else if (viewingCustomer) setViewingCustomer(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewingCustomer, editingCustomer, blockingCustomer]);

  async function loadCustomers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/customers");
      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Unable to load customers.");
      }

      let data: unknown = [];
      try {
        data = text ? JSON.parse(text) : [];
      } catch {
        data = [];
      }

      const nextCustomers = Array.isArray(data) ? (data as CustomerRow[]) : [];
      setCustomers(nextCustomers);
      setApiError(null);
    } catch (error) {
      console.error("Failed to load customers", error);
      setCustomers([]);
      setApiError(error instanceof Error ? error.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function fetchInitial() {
      try {
        const response = await fetch("/api/admin/customers");
        const text = await response.text();

        if (!response.ok) {
          throw new Error(text || "Unable to load customers.");
        }

        let data: unknown = [];
        try {
          data = text ? JSON.parse(text) : [];
        } catch {
          data = [];
        }

        if (isMounted) {
          const nextCustomers = Array.isArray(data) ? (data as CustomerRow[]) : [];
          setCustomers(nextCustomers);
          setApiError(null);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Failed to load customers", error);
          setCustomers([]);
          setApiError(error instanceof Error ? error.message : "Unable to load customers.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchInitial();

    return () => {
      isMounted = false;
    };
  }, []);

  // Filtered dataset
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const safeQuery = searchQuery.trim().toLowerCase();
      const queryMatch =
        !safeQuery ||
        [customer.name, customer.email, customer.phone ?? "", customer.address ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(safeQuery);

      if (!queryMatch) return false;

      if (filter === "verified") return customer.emailVerified && !customer.isBlocked;
      if (filter === "blocked") return Boolean(customer.isBlocked);
      if (filter === "withOrders") return customer.hasOrders;

      return true;
    });
  }, [customers, searchQuery, filter]);

  // Metric counts
  const totalCount = customers.length;
  const verifiedCount = useMemo(() => customers.filter((c) => c.emailVerified && !c.isBlocked).length, [customers]);
  const blockedCount = useMemo(() => customers.filter((c) => c.isBlocked).length, [customers]);
  const withOrdersCount = useMemo(() => customers.filter((c) => c.hasOrders).length, [customers]);
  const totalRevenue = useMemo(() => customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0), [customers]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedCustomers = useMemo(() => {
    return filteredCustomers.slice(startIndex, startIndex + pageSize);
  }, [filteredCustomers, startIndex, pageSize]);

  const startRecord = filteredCustomers.length === 0 ? 0 : startIndex + 1;
  const endRecord = Math.min(startIndex + pageSize, filteredCustomers.length);

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

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    setCurrentPage(1);
  }

  function handleFilterChange(val: FilterKey) {
    setFilter(val);
    setCurrentPage(1);
  }

  function handlePageSizeChange(val: number) {
    setPageSize(val);
    setCurrentPage(1);
  }

  // Edit customer setup
  function openEditCustomer(customer: CustomerRow) {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      emailVerified: customer.emailVerified,
    });
  }

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCustomer.id, ...formData }),
      });

      const data = await response.json();

      if (!response.ok) {
        setToast({ type: "error", message: data.message ?? "Unable to update customer." });
        return;
      }

      setCustomers((current) =>
        current.map((item) =>
          item.id === editingCustomer.id
            ? { ...item, ...formData, emailVerified: formData.emailVerified }
            : item
        )
      );
      if (viewingCustomer && viewingCustomer.id === editingCustomer.id) {
        setViewingCustomer((prev) => (prev ? { ...prev, ...formData, emailVerified: formData.emailVerified } : null));
      }
      setEditingCustomer(null);
      setToast({ type: "success", message: "Customer profile updated successfully." });
    } catch {
      setToast({ type: "error", message: "Network error updating customer profile." });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBlock() {
    if (!blockingCustomer) return;
    const nextBlocked = !blockingCustomer.isBlocked;

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockingCustomer.id, isBlocked: nextBlocked }),
      });

      const data = await response.json();

      if (!response.ok) {
        setToast({ type: "error", message: data.message ?? "Unable to update status." });
        return;
      }

      setCustomers((current) =>
        current.map((item) => (item.id === blockingCustomer.id ? { ...item, isBlocked: nextBlocked } : item))
      );
      if (viewingCustomer && viewingCustomer.id === blockingCustomer.id) {
        setViewingCustomer((prev) => (prev ? { ...prev, isBlocked: nextBlocked } : null));
      }
      setBlockingCustomer(null);
      setToast({
        type: "success",
        message: `${blockingCustomer.name} has been ${nextBlocked ? "blocked" : "unblocked"}.`,
      });
    } catch {
      setToast({ type: "error", message: "Network error updating customer status." });
    } finally {
      setActionLoading(false);
    }
  }

  function getStatusBadge(customer: CustomerRow) {
    if (customer.isBlocked) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200/80 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <Ban className="h-3 w-3" />
          <span>Blocked</span>
        </span>
      );
    }

    if (customer.emailVerified) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <ShieldCheck className="h-3 w-3" />
          <span>Verified</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
        <Clock className="h-3 w-3" />
        <span>Unverified</span>
      </span>
    );
  }

  const hasActiveFilters = Boolean(searchQuery || filter !== "all");

  return (
    <div className="flex flex-1 flex-col space-y-6">
      {/* Toast Notification */}
      {toast && (
        <AdminToast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />
      )}

      {/* Page Header */}
      <div className="flex flex-row items-center justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Customer Management
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {totalCount.toLocaleString()} customers
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View registered customer profiles, track purchase history, and manage account statuses.
          </p>
        </div>

        <div className="flex items-center gap-2 self-auto">
          <button
            type="button"
            onClick={() => void loadCustomers()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition shadow-xs"
            title="Refresh customer list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* API Error Callout */}
      {apiError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{apiError}</span>
        </div>
      )}

      {/* 4-Card KPI Metric Summary Grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Customers</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {totalCount.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Registered member profiles</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Buyers</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {withOrdersCount.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            {totalCount > 0 ? `${Math.round((withOrdersCount / totalCount) * 100)}% purchase conversion` : "With placed orders"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Verified Accounts</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {verifiedCount.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400">
            {blockedCount > 0 ? `${blockedCount} currently blocked` : "Confirmed emails"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Customer Spend</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            ₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Cumulative order value</p>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-3 flex-row items-center justify-between">
          <div className="relative flex-1 max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, email, phone, or address..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Customer status filters">
            {(
              [
                ["all", "All", totalCount],
                ["verified", "Verified", verifiedCount],
                ["withOrders", "With Orders", withOrdersCount],
                ["blocked", "Blocked", blockedCount],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleFilterChange(key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                {label} ({count})
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilter("all");
                  setCurrentPage(1);
                }}
                className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* High-Density Customer Ledger Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="min-w-56 px-4 py-3 font-semibold">Customer</th>
                <th className="min-w-48 px-4 py-3 font-semibold">Contact Info</th>
                <th className="min-w-44 px-4 py-3 font-semibold">Address</th>
                <th className="w-44 px-4 py-3 font-semibold">Purchase Activity</th>
                <th className="w-32 px-4 py-3 font-semibold whitespace-nowrap">Account Status</th>
                <th className="w-28 px-4 py-3 font-semibold text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                      <span>Loading customers directory...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm font-medium">No customers found</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {hasActiveFilters
                          ? "No customer accounts match your current filters or search query."
                          : "No customer accounts have registered on the store yet."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setFilter("all");
                            setCurrentPage(1);
                          }}
                          className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => {
                  const joinDate = new Date(customer.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => setViewingCustomer(customer)}
                      className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition group"
                    >
                      {/* Customer info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {customer.imageUrl ? (
                            <Image
                              src={customer.imageUrl}
                              alt={customer.name}
                              width={36}
                              height={36}
                              unoptimized
                              className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-emerald-600 shrink-0 shadow-xs">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {customer.name}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">
                              Joined {joinDate}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200">
                            <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{customer.phone || "No phone"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Address */}
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {customer.address ? (
                          <div className="flex items-start gap-1.5 max-w-xs">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 wrap-break-words">{customer.address}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Purchase Activity */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {customer.orders} {customer.orders === 1 ? "order" : "orders"}
                            </span>
                            {customer.completedOrders > 0 && (
                              <span className="rounded bg-emerald-50 px-1 py-0.2 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                {customer.completedOrders} completed
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                            ₱{customer.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </td>

                      {/* Account Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {getStatusBadge(customer)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingCustomer(customer)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition shadow-2xs"
                            title="View customer profile"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditCustomer(customer)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition shadow-2xs"
                            title="Edit customer details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setBlockingCustomer(customer)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition shadow-2xs ${
                              customer.isBlocked
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                            }`}
                            title={customer.isBlocked ? "Unblock account" : "Block account"}
                          >
                            {customer.isBlocked ? <ShieldCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modern Scalable Pagination Bar */}
        <div className="flex gap-4 flex-row items-center justify-between border-t border-slate-200/80 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
          {/* Left: Range and rows per page */}
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="font-semibold text-slate-800 dark:text-slate-200">{startRecord.toLocaleString()}</strong> to{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">{endRecord.toLocaleString()}</strong> of{" "}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">{filteredCustomers.length.toLocaleString()}</strong> customers
            </span>

            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 dark:border-slate-700">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 outline-none transition focus:border-slate-400 shadow-2xs"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Right: Modern Numbered Pagination Controls & Jump to Page */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1 || loading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>

              {/* Prev Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1 || loading}
                className="inline-flex h-8 items-center gap-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="font-medium">Prev</span>
              </button>

              {/* Windowed Numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((p, idx) =>
                  typeof p === "number" ? (
                    <button
                      key={p}
                      type="button"
                      disabled={loading}
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

              {/* Next Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages || loading}
                className="inline-flex h-8 items-center gap-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="Next page"
              >
                <span className="font-medium">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages || loading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition shadow-2xs"
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Jump */}
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
      </div>

      {/* MODAL 1: View Customer Profile Drawer / Dialog */}
      {viewingCustomer && (
        <AdminModalPortal>
        <div className="fixed inset-0 z-9998 flex justify-end bg-slate-900/40 transition-opacity animate-in fade-in duration-200">
          <div
            className="relative z-9999 w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                {viewingCustomer.imageUrl ? (
                  <Image
                    src={viewingCustomer.imageUrl}
                    alt={viewingCustomer.name}
                    width={44}
                    height={44}
                    unoptimized
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700 shrink-0"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white dark:bg-emerald-600 shrink-0">
                    {viewingCustomer.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {viewingCustomer.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Joined {new Date(viewingCustomer.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Account Status Card */}
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Account Verification
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {getStatusBadge(viewingCustomer)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Access State
                  </div>
                  <div className="mt-1">
                    {viewingCustomer.isBlocked ? (
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Restricted</span>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Active Access</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Purchase Overview 4-Stat Grid */}
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <ShoppingBag className="h-4 w-4 text-slate-400" />
                  <span>Purchasing Metrics</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Total Placed Orders</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {viewingCustomer.orders}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Completed Orders</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {viewingCustomer.completedOrders}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 col-span-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Lifetime Gross Spend</div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      ₱{viewingCustomer.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    {viewingCustomer.lastOrderStatus && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Latest order status: <span className="font-semibold text-slate-700 dark:text-slate-300">{viewingCustomer.lastOrderStatus}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <User className="h-4 w-4 text-slate-400" />
                  <span>Contact Information</span>
                </div>

                <div className="space-y-2.5 pt-1 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">Email Address</div>
                    <a
                      href={`mailto:${viewingCustomer.email}`}
                      className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1.5 mt-0.5"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span>{viewingCustomer.email}</span>
                    </a>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">Phone Number</div>
                    {viewingCustomer.phone ? (
                      <a
                        href={`tel:${viewingCustomer.phone}`}
                        className="text-sm font-semibold text-slate-800 dark:text-slate-200 hover:underline inline-flex items-center gap-1.5 mt-0.5"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{viewingCustomer.phone}</span>
                      </a>
                    ) : (
                      <div className="text-sm text-slate-400 mt-0.5">No phone number recorded</div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">Address</div>
                    {viewingCustomer.address ? (
                      <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{viewingCustomer.address}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 mt-0.5">No address saved</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-slate-200 p-4 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const cust = viewingCustomer;
                  setViewingCustomer(null);
                  openEditCustomer(cust);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cust = viewingCustomer;
                    setViewingCustomer(null);
                    setBlockingCustomer(cust);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    viewingCustomer.isBlocked
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-rose-600 text-white hover:bg-rose-700"
                  }`}
                >
                  {viewingCustomer.isBlocked ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Unblock</span>
                    </>
                  ) : (
                    <>
                      <Ban className="h-3.5 w-3.5" />
                      <span>Block</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setViewingCustomer(null)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* MODAL 2: Edit Customer Profile Dialog */}
      {editingCustomer && (
        <AdminModalPortal>
        <div className={`${ADMIN_MODAL_BACKDROP_CLASS} overflow-y-auto`}>
          <div
            className={`${ADMIN_MODAL_PANEL_CLASS} w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Edit Customer Details
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Update profile info for {editingCustomer.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCustomer}>
              <div className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="e.g. +63 912 345 6789"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Address
                  </label>
                  <textarea
                    rows={3}
                    value={formData.address}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="Barangay, Municipality, Province..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 leading-relaxed"
                  />
                </div>

                {/* Verification Toggle */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center gap-3 cursor-pointer select-none rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 transition">
                    <input
                      type="checkbox"
                      checked={formData.emailVerified}
                      onChange={(e) => setFormData((prev) => ({ ...prev, emailVerified: e.target.checked }))}
                      className="h-4 w-4 rounded accent-emerald-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Email Verified</span>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Check to mark this customer&apos;s email address as verified in the database.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition shadow-xs"
                >
                  {saving ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-slate-900" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* MODAL 3: Modern Block / Unblock Confirmation Modal */}
      {blockingCustomer && (
        <AdminModalPortal>
        <div className={`${ADMIN_MODAL_BACKDROP_CLASS} overflow-y-auto`}>
          <div
            className={`${ADMIN_MODAL_PANEL_CLASS} w-full max-w-md space-y-4 p-6 animate-in zoom-in-95 duration-200`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${
                  blockingCustomer.isBlocked
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                    : "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                }`}
              >
                {blockingCustomer.isBlocked ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {blockingCustomer.isBlocked ? "Unblock Customer Account" : "Block Customer Account"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {blockingCustomer.name} ({blockingCustomer.email})
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              {blockingCustomer.isBlocked
                ? "Unblocking this customer will restore their ability to log in, browse products, and submit orders."
                : "Blocking this customer will immediately prevent them from placing new orders and restrict account access until re-enabled."}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBlockingCustomer(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void handleToggleBlock()}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 ${
                  blockingCustomer.isBlocked
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {actionLoading ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>{blockingCustomer.isBlocked ? "Confirm Unblock" : "Confirm Block"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      )}
    </div>
  );
}
