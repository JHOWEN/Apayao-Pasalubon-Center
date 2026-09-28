"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FolderOpen,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import { AdminToast } from "@/components/admin/admin-toast";
import {
  ADMIN_MODAL_BACKDROP_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";

type Category = {
  id: string;
  name: string;
  description?: string | null;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ id: "", name: "", description: "" });
  const [status, setStatus] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const initialLoadDone = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Lock body scroll when delete confirmation dialog is open
  useEffect(() => {
    if (categoryToDelete) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [categoryToDelete]);

  // Auto-dismiss status toast after 3 seconds
  async function loadCategories(isManualRefresh = false) {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/categories", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Category[];
      setCategories(Array.isArray(data) ? data : []);
      if (isManualRefresh) {
        setStatus({ text: "Categories refreshed successfully.", type: "success" });
      }
    } catch {
      if (isManualRefresh) {
        setStatus({ text: "Unable to refresh categories.", type: "error" });
      }
    } finally {
      if (isManualRefresh) setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const timer = window.setTimeout(() => {
      void loadCategories();
    }, 0);

    const refreshInterval = window.setInterval(() => {
      void loadCategories();
    }, 5000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(refreshInterval);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setIsSubmitting(true);
    setStatus(null);

    const method = isEditing ? "PUT" : "POST";
    const wasEditing = isEditing;
    const payload = isEditing
      ? { id: form.id, name: form.name.trim(), description: form.description.trim() }
      : { name: form.name.trim(), description: form.description.trim() };

    try {
      const response = await fetch("/api/admin/categories", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus({
          text: data.message ?? (wasEditing ? "Unable to update category." : "Unable to create category."),
          type: "error",
        });
        return;
      }

      setForm({ id: "", name: "", description: "" });
      setIsEditing(false);
      setStatus({
        text: wasEditing ? "Category updated successfully." : "Category created successfully.",
        type: "success",
      });
      await loadCategories();
    } catch {
      setStatus({
        text: wasEditing ? "Unable to update category." : "Unable to create category.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEdit(category: Category) {
    setForm({ id: category.id, name: category.name, description: category.description ?? "" });
    setIsEditing(true);
    setStatus(null);

    // Smooth scroll to form on smaller screens if needed
    if (window.innerWidth < 1024 && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleCancelEdit() {
    setForm({ id: "", name: "", description: "" });
    setIsEditing(false);
  }

  async function confirmDelete() {
    if (!categoryToDelete) return;

    setIsDeleting(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/admin/categories?id=${categoryToDelete.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus({
          text: data.message ?? "Unable to delete category.",
          type: "error",
        });
        return;
      }

      const deletedName = categoryToDelete.name;
      setCategoryToDelete(null);
      setStatus({
        text: `Category "${deletedName}" deleted successfully.`,
        type: "success",
      });

      // If we were editing the deleted category, reset the form
      if (isEditing && form.id === categoryToDelete.id) {
        handleCancelEdit();
      }

      await loadCategories();
    } catch {
      setStatus({ text: "Unable to delete category.", type: "error" });
    } finally {
      setIsDeleting(false);
    }
  }

  // Filter categories by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const query = searchQuery.toLowerCase().trim();
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(query) ||
        (cat.description && cat.description.toLowerCase().includes(query))
    );
  }, [categories, searchQuery]);

  return (
    <div className="space-y-5 text-slate-800 dark:text-slate-100">
      {/* Toast Notification */}
      {status && (
        <AdminToast type={status.type} message={status.text} onDismiss={() => setStatus(null)} />
      )}

      {/* Page Header */}
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Category Management
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {categories.length} {categories.length === 1 ? "category" : "categories"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Organize products into clear catalog groups for storefront navigation and inventory filters.
          </p>
        </div>

        {/* Live Indicator & Manual Refresh */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Auto-syncs every 5s
          </span>
          <button
            type="button"
            onClick={() => void loadCategories(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Workbench Layout */}
      <div className="grid items-start gap-5 grid-cols-[1.15fr_0.85fr]">
        {/* Left Column: Category List & Search */}
        <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {/* Card Header & Search Bar */}
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-row items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Categories Directory
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {filteredCategories.length} of {categories.length} displayed
                </p>
              </div>

              {/* Instant Search Bar */}
              <div className="relative min-w-55 flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search categories..."
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50/60 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Categories List Items */}
          <div className="p-3">
            {categories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center dark:border-slate-800">
                <FolderOpen className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-2 text-xs font-bold text-slate-900 dark:text-white">
                  No categories yet
                </h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Create your first product category using the form on the right.
                </p>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                <Search className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-2 text-xs font-bold text-slate-900 dark:text-white">
                  No matches found
                </h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  No categories matched &quot;{searchQuery}&quot;.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCategories.map((category) => {
                  const isCurrentlyEditing = isEditing && form.id === category.id;

                  return (
                    <div
                      key={category.id}
                      className={`flex flex-row items-center justify-between gap-3 rounded-lg border p-3 transition ${
                        isCurrentlyEditing
                          ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/20"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            isCurrentlyEditing
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                          }`}
                        >
                          <Tag className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                              {category.name}
                            </span>
                            {isCurrentlyEditing && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                                Active Edit
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                            {category.description || (
                              <span className="italic text-slate-400 dark:text-slate-500">
                                No description provided
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-1.5 shrink-0 border-slate-100 pt-0 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleEdit(category)}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold shadow-xs transition ${
                            isCurrentlyEditing
                              ? "bg-emerald-600 text-white"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          <PencilLine className="h-3 w-3" />
                          <span>{isCurrentlyEditing ? "Editing" : "Edit"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryToDelete(category)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 shadow-xs transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                          title="Delete category"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Create / Edit Form Card */}
        <div className="sticky top-6">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className={`rounded-lg border bg-white p-5 shadow-xs transition dark:bg-slate-900 ${
              isEditing
                ? "border-emerald-300 ring-1 ring-emerald-500/20 dark:border-emerald-800"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            {/* Form Header */}
            <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isEditing
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    }`}
                  >
                    {isEditing ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4 stroke-2.5" />}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isEditing ? "Edit Category" : "Create New Category"}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {isEditing
                        ? "Update name and details below"
                        : "Add a category to organize products"}
                    </p>
                  </div>
                </div>

                {isEditing && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <X className="h-3 w-3" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>

              {/* Editing Banner Callout */}
              {isEditing && (
                <div className="mt-3 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="truncate">
                    Modifying: <strong className="font-semibold">{form.name || "Untitled"}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="ml-2 underline font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Form Fields */}
            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-900 dark:text-white mb-1.5">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Beverages, Snacks, Merchandise"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-900 dark:text-white mb-1.5">
                  Description <span className="text-[11px] font-normal text-slate-400">(Optional)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Short description of products categorized under this group..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting || !form.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isEditing ? (
                  <Check className="h-3.5 w-3.5 stroke-2.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 stroke-2.5" />
                )}
                <span>{isEditing ? "Update Category" : "Save Category"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {categoryToDelete && (
        <AdminModalPortal>
        <div className={ADMIN_MODAL_BACKDROP_CLASS}>
          <div className={`${ADMIN_MODAL_PANEL_CLASS} max-w-sm`}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Delete Category
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Are you sure you want to delete this category? This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Target Category Callout */}
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/75 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Target Category
                </span>
                <span className="mt-0.5 block font-bold text-xs text-slate-900 dark:text-white">
                  {categoryToDelete.name}
                </span>
                {categoryToDelete.description && (
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                    {categoryToDelete.description}
                  </span>
                )}
              </div>

              {/* Modal Actions */}
              <div className="mt-5 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCategoryToDelete(null)}
                  disabled={isDeleting}
                  className="rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-500 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>{isDeleting ? "Deleting..." : "Delete Category"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      )}
    </div>
  );
}
