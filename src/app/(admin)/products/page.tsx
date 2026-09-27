"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Grid2X2,
  Image as ImageIcon,
  List,
  Loader2,
  Package,
  PackageOpen,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { parseImageUrls } from "@/features/catalog/utils/product-images";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import {
  ADMIN_MODAL_BACKDROP_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";

interface ProductRecord {
  id: string;
  name: string;
  sku: string;
  description?: string | null;
  price: number | string;
  stock: number | string;
  imageUrl?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  isActive?: boolean;
  variants?: Array<{
    id: string;
    sku: string;
    price: number | string;
    cost: number | string;
    stock: number | string;
    minStock: number | string;
    isActive?: boolean;
    attributes?: Record<string, string>;
    imageUrls?: string[];
  }>;
}

async function parseJsonResponse(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return null;
  }
}

type ProductStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
type ModalTab = "details" | "media" | "variants";

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    price: "",
    stock: "",
    description: "",
    status: "DRAFT" as ProductStatus,
  });
  const [activeModalTab, setActiveModalTab] = useState<ModalTab>("details");
  const [productView, setProductView] = useState<"grid" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ProductStatus>("");

  // Lock body scroll when manage modal is open
  useEffect(() => {
    if (isEditModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isEditModalOpen]);

  async function handleCoverUpload(productId: string, files: FileList | null) {
    if (!files?.length) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }

    const product = products.find((item) => item.id === productId);
    const currentImages = parseImageUrls(product?.imageUrl);

    setStatus("");

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const uploadResponse = await fetch("/api/admin/products/upload", {
        method: "POST",
        body: uploadFormData,
        credentials: "same-origin",
      });

      const uploadData = await parseJsonResponse(uploadResponse);

      if (!uploadResponse.ok || !uploadData?.url) {
        throw new Error(uploadData?.message ?? "Image upload failed.");
      }

      const updatedImageUrls = currentImages.length ? [uploadData.url, ...currentImages.slice(1)] : [uploadData.url];
      await saveImageUrls(productId, updatedImageUrls, "Cover image saved successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to upload cover image.");
    }
  }

  async function handleProductMediaUpload(productId: string, files: FileList | null) {
    if (!files?.length) return;

    const selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!selectedFiles.length) {
      setStatus("Please choose image files.");
      return;
    }

    const product = products.find((item) => item.id === productId);
    const currentImages = parseImageUrls(product?.imageUrl);

    setStatus("");

    try {
      const uploadFormData = new FormData();
      selectedFiles.forEach((file) => uploadFormData.append("files", file));

      const uploadResponse = await fetch("/api/admin/products/upload", {
        method: "POST",
        credentials: "same-origin",
        body: uploadFormData,
      });

      const uploadData = await parseJsonResponse(uploadResponse);

      if (!uploadResponse.ok || !Array.isArray(uploadData?.urls)) {
        throw new Error(uploadData?.message ?? "Image upload failed.");
      }

      const uploadedUrls = uploadData.urls.filter((item: unknown): item is string => typeof item === "string");
      const updatedImageUrls = [...currentImages, ...uploadedUrls];

      await saveImageUrls(productId, updatedImageUrls, "Product photos saved successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to upload product photos.");
    }
  }

  async function saveImageUrls(productId: string, imageUrls: string[], successMessage: string) {
    setStatus("");

    const response = await fetch("/api/admin/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId, imageUrls }),
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      console.error("Failed to save product images", { productId, body: imageUrls, response: data });
      setStatus(data?.message ?? "Unable to update product images.");
      return false;
    }

    await loadData();
    setStatus(successMessage);
    return true;
  }

  async function loadData() {
    const productsResponse = await fetch("/api/admin/products", { credentials: "same-origin" });
    const productData = await parseJsonResponse(productsResponse);

    if (!productsResponse.ok) {
      setProducts([]);
      setStatus(productData?.message ?? "Unable to load products.");
      return;
    }

    const normalizedProducts = Array.isArray(productData) ? productData : [];
    setProducts(normalizedProducts);
    setDescriptionDrafts((previousDrafts) => {
      const nextDrafts: Record<string, string> = {};

      normalizedProducts.forEach((product: ProductRecord) => {
        nextDrafts[product.id] = previousDrafts[product.id] ?? product.description ?? "";
      });

      return nextDrafts;
    });
  }

  useEffect(() => {
    const run = async () => {
      await loadData();
    };

    void run();
  }, []);

  useEffect(() => {
    if (!status) return;

    const timeoutId = window.setTimeout(() => {
      setStatus("");
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const activeProduct = products.find((product) => product.id === activeProductId) ?? null;
  const activeProductImages = activeProduct ? parseImageUrls(activeProduct.imageUrl) : [];
  const activeCoverImage = activeProductImages[0] ?? null;
  const productMediaImages = activeProduct ? activeProductImages.slice(1) : [];

  async function updateProductStatus(productId: string, nextStatus: ProductStatus) {
    try {
      const response = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: productId,
          status: nextStatus,
          isActive: nextStatus === "PUBLISHED",
        }),
      });

      const data = await parseJsonResponse(response);
      if (!response.ok) {
        setStatus(data?.message ?? "Unable to update product status.");
        return;
      }

      await loadData();
      setStatus(`Product marked as ${nextStatus.toLowerCase().replace(/^./, (first) => first.toUpperCase())}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update product status.");
    }
  }

  async function updateVariantStatus(productId: string, variantId: string, isActive: boolean) {
    try {
      const response = await fetch(`/api/admin/variants/${variantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });

      const data = await parseJsonResponse(response);
      if (!response.ok) {
        setStatus(data?.message ?? "Unable to update variant visibility.");
        return;
      }

      await loadData();
      setStatus(isActive ? "Variant published successfully." : "Variant unpublished successfully.");
      if (activeProductId === productId) {
        setActiveProductId(productId);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update variant visibility.");
    }
  }

  function openEditModal(productId: string) {
    const product = products.find((item) => item.id === productId);

    if (!product) return;

    setActiveProductId(productId);
    const statusFromProduct: ProductStatus =
      product.status === "DRAFT" || product.status === "UNPUBLISHED" || product.status === "PUBLISHED"
        ? product.status
        : product.isActive === false
          ? "UNPUBLISHED"
          : "PUBLISHED";

    setEditForm({
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: String(product.price ?? ""),
      stock: String(product.stock ?? ""),
      description: descriptionDrafts[product.id] ?? product.description ?? "",
      status: statusFromProduct,
    });
    setActiveModalTab("details");
    setIsEditModalOpen(true);
  }

  function closeEditModal() {
    setIsEditModalOpen(false);
    setActiveProductId(null);
    setActiveModalTab("details");
  }

  async function handleSaveEditModal() {
    if (!activeProductId) return;

    setIsSaving(true);
    setStatus("");

    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeProductId,
          description: editForm.description.trim(),
          status: editForm.status,
          isActive: editForm.status === "PUBLISHED",
        }),
      });

      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setStatus(data?.message ?? "Unable to save product details.");
        return;
      }

      setDescriptionDrafts((previousDrafts) => ({
        ...previousDrafts,
        [activeProductId]: editForm.description.trim(),
      }));

      await loadData();
      closeEditModal();
      setStatus("Product details saved successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save product details.");
    } finally {
      setIsSaving(false);
    }
  }

  // Status counts for filter tabs
  const statusCounts = useMemo(() => {
    let published = 0;
    let draft = 0;
    let unpublished = 0;

    products.forEach((p) => {
      const eff =
        p.status === "DRAFT" || p.status === "UNPUBLISHED" || p.status === "PUBLISHED"
          ? p.status
          : p.isActive === false
            ? "UNPUBLISHED"
            : "PUBLISHED";

      if (eff === "PUBLISHED") published++;
      else if (eff === "DRAFT") draft++;
      else if (eff === "UNPUBLISHED") unpublished++;
    });

    return { all: products.length, published, draft, unpublished };
  }, [products]);

  // Search and status filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const effStatus =
        product.status === "DRAFT" || product.status === "UNPUBLISHED" || product.status === "PUBLISHED"
          ? product.status
          : product.isActive === false
            ? "UNPUBLISHED"
            : "PUBLISHED";

      if (statusFilter && effStatus !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = product.name.toLowerCase().includes(query);
        const matchSku = (product.sku ?? "").toLowerCase().includes(query);
        const matchDesc = (product.description ?? "").toLowerCase().includes(query);
        const matchVariant = product.variants?.some((v) => v.sku.toLowerCase().includes(query));

        return matchName || matchSku || matchDesc || matchVariant;
      }

      return true;
    });
  }, [products, statusFilter, searchQuery]);

  return (
    <div className="space-y-5 text-slate-800 dark:text-slate-100">
      {/* Toast / Notification Banner */}
      {status ? (
        <div className="fixed left-1/2 top-20 z-80 flex -translate-x-1/2 justify-center px-4 pointer-events-none">
          <div className="w-full max-w-sm pointer-events-auto">
            <div
              className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-xs font-semibold shadow-lg transition-all ${
                status.toLowerCase().includes("success") || status.toLowerCase().includes("marked as") || status.toLowerCase().includes("saved")
                  ? "border-emerald-200 bg-emerald-600 text-white dark:border-emerald-800 dark:bg-emerald-700"
                  : "border-amber-200 bg-amber-600 text-white dark:border-amber-800 dark:bg-amber-700"
              }`}
            >
              {status.toLowerCase().includes("success") || status.toLowerCase().includes("marked as") || status.toLowerCase().includes("saved") ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1 wrap-break-words">{status}</span>
              <button
                type="button"
                onClick={() => setStatus("")}
                className="rounded p-0.5 text-white/80 hover:bg-white/20 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Page Header */}
      <div className="flex gap-1 flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-bold tracking-tight text-slate-900 dark:text-white text-2xl">
              Product Management
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {products.length} {products.length === 1 ? "product" : "products"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Manage product catalog details, storefront visibility, photography, and variant availability.
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-3 flex-row items-center justify-between">
          {/* Search Input */}
          <div className="relative min-w-65 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product name, SKU, or description..."
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50/50 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Status Filter Tabs & View Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Tabs */}
            <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                  statusFilter === ""
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                All ({statusCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("PUBLISHED")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition ${
                  statusFilter === "PUBLISHED"
                    ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Published ({statusCounts.published})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("DRAFT")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition ${
                  statusFilter === "DRAFT"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                Draft ({statusCounts.draft})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("UNPUBLISHED")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition ${
                  statusFilter === "UNPUBLISHED"
                    ? "bg-white text-amber-700 shadow-xs dark:bg-slate-900 dark:text-amber-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unpublished ({statusCounts.unpublished})
              </button>
            </div>

            {/* View Switcher (List vs Grid) */}
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
              <button
                type="button"
                title="List view"
                onClick={() => setProductView("list")}
                className={`rounded p-1.5 transition ${
                  productView === "list"
                    ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Grid view"
                onClick={() => setProductView("grid")}
                className={`rounded p-1.5 transition ${
                  productView === "grid"
                    ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                <Grid2X2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Display */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <PackageOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
            No products found
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {searchQuery || statusFilter
              ? "No products match your current search criteria. Try clearing your filters."
              : "No products in your catalog yet."}
          </p>
          {(searchQuery || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : productView === "list" ? (
        /* List / Table View */
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-3 pl-4 pr-3">Product</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Price</th>
                  <th scope="col" className="px-3 py-3">Inventory</th>
                  <th scope="col" className="px-3 py-3">Variants</th>
                  <th scope="col" className="px-3 py-3">Media</th>
                  <th scope="col" className="py-3 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map((product) => {
                  const images = parseImageUrls(product.imageUrl);
                  const coverImage = images[0] ?? null;

                  const effStatus =
                    product.status === "DRAFT" || product.status === "UNPUBLISHED" || product.status === "PUBLISHED"
                      ? product.status
                      : product.isActive === false
                        ? "UNPUBLISHED"
                        : "PUBLISHED";

                  const hasVariants = Boolean(product.variants?.length);
                  const totalVariantStock = hasVariants
                    ? product.variants!.reduce((sum, v) => sum + Number(v.stock || 0), 0)
                    : Number(product.stock ?? 0);

                  return (
                    <tr
                      key={product.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      {/* Product Thumbnail & Name */}
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                            {coverImage ? (
                              <Image
                                src={coverImage}
                                alt={product.name}
                                width={44}
                                height={44}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-400">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900 dark:text-white">
                              {product.name}
                            </span>
                            {!hasVariants && (
                              <span className="block font-mono text-[11px] text-slate-400">
                                {product.sku || "No SKU"}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {effStatus === "PUBLISHED" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Published
                          </span>
                        ) : effStatus === "UNPUBLISHED" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Unpublished
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        )}
                      </td>

                      {/* Price */}
                      <td className="px-3 py-3 whitespace-nowrap font-medium text-slate-900 dark:text-white">
                        {!hasVariants && (
                          `₱${Number(product.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        )}
                      </td>

                      {/* Inventory Stock */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {hasVariants ? (
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {totalVariantStock}
                            </span>{" "}
                            <span className="text-[11px] text-slate-500">
                              across {product.variants!.length} variants
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              Number(product.stock ?? 0) === 0
                                ? "text-rose-600 dark:text-rose-400"
                                : Number(product.stock ?? 0) < 5
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {Number(product.stock ?? 0)} in stock
                          </span>
                        )}
                      </td>

                      {/* Variants Summary */}
                      <td className="px-3 py-3">
                        {hasVariants ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {product.variants!.length} variants
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Standard item</span>
                        )}
                      </td>

                      {/* Media */}
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                        {images.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                            {images.length} {images.length === 1 ? "photo" : "photos"}
                          </span>
                        ) : (
                          <span className="text-slate-400">No photos</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(product.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Edit2 className="h-3 w-3 text-slate-500" />
                            <span>Manage</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateProductStatus(product.id, effStatus === "PUBLISHED" ? "UNPUBLISHED" : "PUBLISHED")}
                            title={effStatus === "PUBLISHED" ? "Click to unpublish from store" : "Click to publish to store"}
                            className="rounded-md border border-slate-200 bg-white p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                          >
                            {effStatus === "PUBLISHED" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          {effStatus === "PUBLISHED" && (
                            <Link
                              href={`/products/${product.id}`}
                              target="_blank"
                              title="View in storefront"
                              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const images = parseImageUrls(product.imageUrl);
            const coverImage = images[0] ?? null;

            const effStatus =
              product.status === "DRAFT" || product.status === "UNPUBLISHED" || product.status === "PUBLISHED"
                ? product.status
                : product.isActive === false
                  ? "UNPUBLISHED"
                  : "PUBLISHED";

            const hasVariants = Boolean(product.variants?.length);
            const totalVariantStock = hasVariants
              ? product.variants!.reduce((sum, v) => sum + Number(v.stock || 0), 0)
              : Number(product.stock ?? 0);

            return (
              <div
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                {/* Image Frame */}
                <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt={product.name}
                      width={300}
                      height={300}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <Package className="h-10 w-10 stroke-1" />
                    </div>
                  )}

                  {/* Status Badge in Top Left */}
                  <div className="absolute left-2.5 top-2.5">
                    {effStatus === "PUBLISHED" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-xs backdrop-blur-xs dark:border-emerald-800 dark:bg-slate-900/90 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Published
                      </span>
                    ) : effStatus === "UNPUBLISHED" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/90 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-amber-700 shadow-xs backdrop-blur-xs dark:border-amber-800 dark:bg-slate-900/90 dark:text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Unpublished
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-xs backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Draft
                      </span>
                    )}
                  </div>

                  {/* Photo Count Badge in Top Right */}
                  {images.length > 1 && (
                    <div className="absolute right-2.5 top-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                      {images.length} photos
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col p-3.5">
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-1 font-semibold text-slate-900 dark:text-white" title={product.name}>
                        {product.name}
                      </h3>
                    </div>
                    {!hasVariants && (
                      <span className="font-mono text-[11px] text-slate-400">
                        {product.sku || "No SKU"}
                      </span>
                    )}

                    {/* Price and Stock */}
                    <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      {!hasVariants && (
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          ₱{Number(product.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                      <span
                        className={`text-xs ${
                          Number(totalVariantStock) === 0
                            ? "font-semibold text-rose-600 dark:text-rose-400"
                            : Number(totalVariantStock) < 5
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {totalVariantStock} in stock
                      </span>
                    </div>

                    {hasVariants && (
                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {product.variants!.length} variants available
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-3.5 flex items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => openEditModal(product.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Edit2 className="h-3 w-3 text-slate-500" />
                      <span>Manage</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateProductStatus(product.id, effStatus === "PUBLISHED" ? "UNPUBLISHED" : "PUBLISHED")}
                      title={effStatus === "PUBLISHED" ? "Click to unpublish from store" : "Click to publish to store"}
                      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      {effStatus === "PUBLISHED" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MANAGE PRODUCT MODAL (EXCLUSIVELY RETAINED)
         ───────────────────────────────────────────────────────────── */}
      {isEditModalOpen && activeProduct ? (
        <AdminModalPortal>
        <div className={ADMIN_MODAL_BACKDROP_CLASS}>
          <div className={`${ADMIN_MODAL_PANEL_CLASS} flex max-h-[90vh] w-full max-w-2xl flex-col shadow-2xl`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Manage Product
                  </h3>
                  <p className="font-mono text-xs text-slate-500">
                    {activeProduct.name}
                    {!activeProduct.variants?.length && ` · ${activeProduct.sku || "No SKU"}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/75 px-5 dark:border-slate-800 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => setActiveModalTab("details")}
                className={`border-b-2 px-3.5 py-2.5 text-xs font-semibold transition ${
                  activeModalTab === "details"
                    ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                General & Listing
              </button>
              <button
                type="button"
                onClick={() => setActiveModalTab("media")}
                className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition ${
                  activeModalTab === "media"
                    ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <span>Media & Gallery</span>
                {activeProductImages.length > 0 && (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {activeProductImages.length}
                  </span>
                )}
              </button>
              {activeProduct.variants && activeProduct.variants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveModalTab("variants")}
                  className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition ${
                    activeModalTab === "variants"
                      ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <span>Variants & Availability</span>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {activeProduct.variants.length}
                  </span>
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
              {/* TAB 1: GENERAL & LISTING */}
              {activeModalTab === "details" && (
                <div className="space-y-4">
                  {/* Status Selection Cards */}
                  <div>
                    <label className="block font-semibold text-slate-900 dark:text-white mb-2">
                      Storefront Visibility Status
                    </label>
                    <div className="grid gap-2.5 grid-cols-3">
                      {[
                        {
                          key: "PUBLISHED" as ProductStatus,
                          label: "Published",
                          description: "Visible and purchasable in store",
                          dotColor: "bg-emerald-500",
                          activeBorder: "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300",
                        },
                        {
                          key: "DRAFT" as ProductStatus,
                          label: "Draft",
                          description: "Hidden from customer view",
                          dotColor: "bg-slate-400",
                          activeBorder: "border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white",
                        },
                        {
                          key: "UNPUBLISHED" as ProductStatus,
                          label: "Unpublished",
                          description: "Temporarily off storefront",
                          dotColor: "bg-amber-500",
                          activeBorder: "border-amber-600 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300",
                        },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setEditForm((current) => ({ ...current, status: item.key }))}
                          className={`flex flex-col items-start rounded-lg border p-3 text-left transition ${
                            editForm.status === item.key
                              ? `${item.activeBorder} ring-1 ring-emerald-500`
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span className={`h-2 w-2 rounded-full ${item.dotColor}`} />
                            <span>{item.label}</span>
                          </div>
                          <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Description */}
                  <div>
                    <label className="block font-semibold text-slate-900 dark:text-white mb-1.5">
                      Product Description
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm((s) => ({ ...s, description: e.target.value }))}
                      rows={6}
                      placeholder="Write a clear, descriptive summary of this product for customers..."
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Supports plain text with paragraphs. This description appears on the storefront product page.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: MEDIA & GALLERY */}
              {activeModalTab === "media" && (
                <div className="space-y-5">
                  {/* Primary Cover Image */}
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          Primary Cover Photo
                        </span>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Main thumbnail displayed in the catalog, POS terminal, and storefront.
                        </p>
                      </div>
                      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <UploadCloud className="h-3.5 w-3.5 text-slate-500" />
                        <span>Replace Cover</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void handleCoverUpload(activeProduct.id, e.target.files)}
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex items-center gap-4">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                        {activeCoverImage ? (
                          <Image
                            src={activeCoverImage}
                            alt="Cover"
                            width={96}
                            height={96}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-400">
                            No cover
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                        <p className="font-medium text-slate-700 dark:text-slate-300">Image specifications:</p>
                        <p>• Square aspect ratio (1:1) recommended for best results</p>
                        <p>• Supports JPG, PNG, WebP up to 5MB</p>
                      </div>
                    </div>
                  </div>

                  {/* Additional Product Photos Gallery */}
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          Additional Gallery Photos
                        </span>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Secondary angles, dimensions, and detail photos for the storefront gallery.
                        </p>
                      </div>
                      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Photos</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (!e.target.files || !activeProduct) return;
                            void handleProductMediaUpload(activeProduct.id, e.target.files);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>

                    {/* Gallery Grid */}
                    <div className="mt-3">
                      {productMediaImages.length ? (
                        <div className="grid gap-2.5 grid-cols-5">
                          {productMediaImages.map((url, idx) => (
                            <div
                              key={url + idx}
                              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                            >
                              <Image
                                src={url}
                                alt={`gallery-${idx}`}
                                width={100}
                                height={100}
                                className="h-full w-full object-cover"
                              />
                              <button
                                type="button"
                                title="Remove photo"
                                onClick={async () => {
                                  if (!activeProduct) return;
                                  const next = productMediaImages.filter((_, i) => i !== idx);
                                  await saveImageUrls(
                                    activeProduct.id,
                                    [activeCoverImage ?? "", ...next].filter(Boolean),
                                    "Product photo removed."
                                  );
                                }}
                                className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-400 dark:border-slate-800">
                          <ImageIcon className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
                          <p className="mt-1.5 text-xs">No additional photos uploaded yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: VARIANTS & AVAILABILITY */}
              {activeModalTab === "variants" && activeProduct.variants && activeProduct.variants.length > 0 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Variant Visibility & Stock
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Individually publish or hide specific variants from the storefront.
                    </p>

                    <div className="mt-3 space-y-2">
                      {activeProduct.variants.map((variant) => {
                        const variantLabel = Object.keys(variant.attributes ?? {}).length
                          ? Object.entries(variant.attributes ?? {})
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(" • ")
                          : variant.sku;

                        const isVariantActive = variant.isActive !== false;

                        return (
                          <div
                            key={variant.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                          >
                            <div className="min-w-0">
                              <span className="block truncate font-semibold text-slate-900 dark:text-white">
                                {variantLabel}
                              </span>
                              <span className="block text-[11px] text-slate-500">
                                SKU: <span className="font-mono">{variant.sku}</span> · {variant.stock} in stock · ₱{Number(variant.price ?? 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                              <button
                                type="button"
                                onClick={() => void updateVariantStatus(activeProduct.id, variant.id, true)}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                                  isVariantActive
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                                }`}
                              >
                                Publish
                              </button>
                              <button
                                type="button"
                                onClick={() => void updateVariantStatus(activeProduct.id, variant.id, false)}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                                  !isVariantActive
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                                }`}
                              >
                                Unpublish
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/75 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/90">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEditModal()}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 stroke-2.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      ) : null}
    </div>
  );
}
