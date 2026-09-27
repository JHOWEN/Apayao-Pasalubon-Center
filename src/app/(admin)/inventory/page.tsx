"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers3,
  Package,
  Pencil,
  Plus,
  Search,
  TrendingDown,
  UploadCloud,
  Warehouse,
  X,
  Trash2,
  RefreshCw,
  Info,
  ArrowDownRight,
  ArrowUpRight,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AttributeManager, { type Attribute } from "@/components/admin/AttributeManager";
import VariantGenerator, { type Variant } from "@/components/admin/VariantGenerator";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import {
  ADMIN_MODAL_BACKDROP_CLASS,
  ADMIN_MODAL_PANEL_CLASS,
} from "@/utils/admin-modal";

interface ProductRecord {
  id: string;
  name: string;
  sku: string;
  price: number | string;
  cost: number | string;
  stock: number | string;
  minStock: number | string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
  isActive?: boolean;
  variants?: Array<{
    id: string;
    sku: string;
    price: number | string;
    cost: number | string;
    stock: number | string;
    minStock: number | string;
    attributes?: Record<string, string>;
    imageUrls?: string[];
  }>;
  category?: {
    id: string;
    name: string;
  };
}

interface CategoryRecord {
  id: string;
  name: string;
}

interface ProductFormState {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: string;
  cost: string;
  stock: string;
  minStock: string;
  categoryId: string;
  isActive: boolean;
  imageUrls?: string[];
}

type InventoryMovementAction = "stock-in" | "stock-out" | "threshold-adjustment";

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [movementProducts, setMovementProducts] = useState<ProductRecord[]>([]);
  const [hasLoadedMovementProducts, setHasLoadedMovementProducts] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isDeletingProductId, setIsDeletingProductId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<ProductRecord | null>(null);
  const [variantToDelete, setVariantToDelete] = useState<{ id: string; sku: string; productName: string } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [productFormMessage, setProductFormMessage] = useState("");
  const [activeInventorySection, setActiveInventorySection] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [formImageUrl, setFormImageUrl] = useState<string>("");
  const [productType, setProductType] = useState<"simple" | "variant">("simple");
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [showVariantBuilder, setShowVariantBuilder] = useState(false);
  const [variantDrafts, setVariantDrafts] = useState<Record<string, { sku: string; cost: string; price: string; minStock: string; imageUrls: string[] }>>({});
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [existingOptionName, setExistingOptionName] = useState("");
  const [newVariantDraft, setNewVariantDraft] = useState({
    sku: "",
    optionName: "",
    optionValue: "",
    cost: "",
    price: "",
    stock: "0",
    minStock: "5",
    imageUrls: [] as string[],
  });
  const [productForm, setProductForm] = useState<ProductFormState>({
    id: "",
    name: "",
    sku: "",
    description: "",
    price: "",
    cost: "",
    stock: "",
    minStock: "0",
    categoryId: "",
    isActive: true,
    imageUrls: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState<"ALL" | "SIMPLE" | "VARIANT">("ALL");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpInput, setJumpInput] = useState("");
  const [userRole, setUserRole] = useState<"ADMIN" | "STAFF" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalCount: 0, totalPages: 1 });
  const [typeCounts, setTypeCounts] = useState({ ALL: 0, SIMPLE: 0, VARIANT: 0 });
  const [inventorySummary, setInventorySummary] = useState({ totalProducts: 0, totalStockUnits: 0, totalStockValue: 0, lowStockCount: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const inventoryRequestSequence = useRef(0);
  const [movementProductId, setMovementProductId] = useState("");
  const [isLoadingMovementProducts, setIsLoadingMovementProducts] = useState(false);
  const [movementVariantId, setMovementVariantId] = useState("");
  const [movementProductSearch, setMovementProductSearch] = useState("");
  const [movementCategoryFilter, setMovementCategoryFilter] = useState("");
  const [movementQuantity, setMovementQuantity] = useState("1");
  const [movementRemarks, setMovementRemarks] = useState("");
  const [movementMinStock, setMovementMinStock] = useState("5");
  const [movementError, setMovementError] = useState("");
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);

  const isAdmin = userRole === "ADMIN";

  const loadData = useCallback(async () => {
    const requestSequence = ++inventoryRequestSequence.current;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        search: searchQuery.trim(),
        categoryId: categoryFilter,
        type: productTypeFilter,
      });
      const [productsResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/admin/categories", { cache: "no-store" }),
      ]);
      const productData = await productsResponse.json();
      const categoriesData = await categoriesResponse.json();
      if (requestSequence !== inventoryRequestSequence.current) return;
      const nextPagination = productData?.pagination ?? { page: 1, limit: pageSize, totalCount: 0, totalPages: 1 };
      if (currentPage > nextPagination.totalPages) {
        setCurrentPage(nextPagination.totalCount === 0 ? 1 : nextPagination.totalPages);
        return;
      }
      setProducts(Array.isArray(productData?.products) ? productData.products : []);
      setPagination(nextPagination);
      setTypeCounts(productData?.typeCounts ?? { ALL: 0, SIMPLE: 0, VARIANT: 0 });
      setInventorySummary(productData?.summary ?? { totalProducts: 0, totalStockUnits: 0, totalStockValue: 0, lowStockCount: 0 });
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch {
      // Kept silent
    } finally {
      if (requestSequence === inventoryRequestSequence.current) setIsLoading(false);
    }
  }, [categoryFilter, currentPage, pageSize, productTypeFilter, searchQuery]);

  async function loadMovementProducts() {
    setIsLoadingMovementProducts(true);
    try {
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      const data = await response.json();
      setMovementProducts(Array.isArray(data) ? data : []);
      setHasLoadedMovementProducts(true);
    } catch {
      setMovementProducts([]);
    } finally {
      setIsLoadingMovementProducts(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadUserRole() {
      try {
        const response = await fetch("/api/auth/profile");
        const data = await response.json();
        if (isMounted && (data?.user?.role === "ADMIN" || data?.user?.role === "STAFF")) {
          setUserRole(data.user.role);
        }
      } catch {
        // Kept silent
      }
    }

    const syncActiveInventorySection = () => {
      if (typeof window === "undefined") return;
      setActiveInventorySection(window.location.hash.replace("#", ""));
    };

    const handleSseEvent = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as { type?: string };
        if (message?.type === "inventory-updated" || message?.type === "order-created" || message?.type === "order-updated") {
          setRefreshKey((value) => value + 1);
        }
      } catch {
        // Ignore invalid SSE payloads.
      }
    };

    const eventSource = new EventSource("/api/admin/live");
    eventSource.addEventListener("inventory-updated", handleSseEvent);
    eventSource.addEventListener("order-created", handleSseEvent);
    eventSource.addEventListener("order-updated", handleSseEvent);

    void loadUserRole();
    syncActiveInventorySection();
    window.addEventListener("hashchange", syncActiveInventorySection);

    return () => {
      isMounted = false;
      window.removeEventListener("hashchange", syncActiveInventorySection);
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadData();
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [loadData, refreshKey]);

  function triggerSuccessToast(message: string) {
    setSuccessMessage(message);
    setShowSuccessToast(true);
    window.setTimeout(() => setShowSuccessToast(false), 3000);
  }

  function openMovementSection(action: InventoryMovementAction, target?: { productId?: string; variantId?: string } | null) {
    if (!hasLoadedMovementProducts) {
      void loadMovementProducts();
    }
    setMovementProductId(target?.productId ?? "");
    setMovementVariantId(target?.variantId ?? "");
    setMovementError("");
    window.location.hash = action;
    setActiveInventorySection(action);
  }

  function handleMovementProductSelect(product: ProductRecord) {
    setMovementProductId(product.id);
    setMovementProductSearch("");
    setMovementError("");

    if (product.variants?.length) {
      const firstVariant = product.variants[0];
      setMovementVariantId(firstVariant.id);
      setMovementMinStock(String(firstVariant.minStock ?? 5));
    } else {
      setMovementVariantId("");
      setMovementMinStock(String(product.minStock ?? 5));
    }
  }

  function clearMovementSelection() {
    setMovementProductId("");
    setMovementVariantId("");
    setMovementProductSearch("");
    setMovementQuantity("1");
    setMovementRemarks("");
    setMovementError("");
  }

  async function handleMovementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMovementError("");

    const action = activeInventorySection as InventoryMovementAction;
    const selectedProduct = movementProducts.find((product) => product.id === movementProductId);
    const hasVariants = Boolean(selectedProduct?.variants?.length);
    const selectedVariant = hasVariants ? selectedProduct?.variants?.find((variant) => variant.id === movementVariantId) : null;
    const currentStock = hasVariants ? Number(selectedVariant?.stock ?? 0) : Number(selectedProduct?.stock ?? 0);
    const quantity = Math.max(0, Number(movementQuantity || 0));
    const minStock = Math.max(0, Number(movementMinStock || 0));
    const isThreshold = action === "threshold-adjustment";

    if (!movementProductId) {
      setMovementError("Please select a target product first.");
      return;
    }
    if (hasVariants && !movementVariantId) {
      setMovementError("Please select a specific variant option for this product.");
      return;
    }
    if (!isThreshold && quantity <= 0) {
      setMovementError("Please enter a valid quantity greater than 0.");
      return;
    }
    if (action === "stock-out" && quantity > currentStock) {
      setMovementError(`Cannot remove ${quantity} units. Available stock for this item is only ${currentStock} units.`);
      return;
    }

    setIsSubmittingMovement(true);
    try {
      const payload = isThreshold
        ? {
            productId: movementProductId,
            variantId: hasVariants ? movementVariantId || undefined : undefined,
            type: "ADJUSTMENT" as const,
            quantity: 0,
            remarks: movementRemarks.trim() || "Updated minimum stock threshold",
            minStock,
          }
        : {
            productId: movementProductId,
            variantId: hasVariants ? movementVariantId || undefined : undefined,
            type: action === "stock-out" ? ("STOCK_OUT" as const) : ("STOCK_IN" as const),
            quantity,
            remarks: movementRemarks.trim() || (action === "stock-out" ? "Stock out entry" : "Stock in entry"),
          };
      const response = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMovementError(data?.message ?? "Unable to process inventory update.");
        return;
      }

      await loadData();
      if (hasLoadedMovementProducts) {
        await loadMovementProducts();
      }
      triggerSuccessToast(
        isThreshold
          ? `Minimum stock threshold updated to ${minStock} units.`
          : action === "stock-in"
          ? `Successfully added ${quantity} units to stock.`
          : `Successfully removed ${quantity} units from stock.`
      );
      setMovementQuantity("1");
      setMovementRemarks("");
    } catch {
      setMovementError("An unexpected error occurred while saving the inventory update.");
    } finally {
      setIsSubmittingMovement(false);
    }
  }

  function openEditProductModal(product: ProductRecord) {
    const productImageUrls = product.imageUrl
      ? JSON.parse(product.imageUrl).filter((url: unknown): url is string => typeof url === "string")
      : [];
    const primaryImage = productImageUrls[0] || "";
    const productVariants = (product.variants ?? []).map((variant) => ({
      id: variant.id,
      attributes: variant.attributes ?? {},
      price: String(variant.price ?? ""),
      cost: String(variant.cost ?? ""),
      stock: String(variant.stock ?? "0"),
      minStock: String(variant.minStock ?? "5"),
      sku: String(variant.sku ?? ""),
      imageUrls: variant.imageUrls ?? [],
    }));
    setFormImageUrl(primaryImage);
    setProductType(product.variants?.length ? "variant" : "simple");
    setVariants(productVariants);
    setVariantDrafts(
      Object.fromEntries(
        productVariants.map((variant) => [
          variant.id,
          {
            sku: variant.sku,
            cost: variant.cost,
            price: variant.price,
            minStock: variant.minStock,
            imageUrls: variant.imageUrls,
          },
        ])
      )
    );
    setShowAddVariant(false);
    setExistingOptionName("");
    setNewVariantDraft({ sku: "", optionName: "", optionValue: "", cost: "", price: "", stock: "0", minStock: "5", imageUrls: [] });
    setProductForm({
      id: product.id,
      name: product.name ?? "",
      sku: product.sku ?? "",
      description: product.description ?? "",
      price: String(product.price ?? 0),
      cost: String(product.cost ?? 0),
      stock: String(product.stock ?? 0),
      minStock: String(product.minStock ?? 5),
      categoryId: product.categoryId ?? categories[0]?.id ?? "",
      isActive: product.isActive ?? true,
      imageUrls: productImageUrls,
    });
    setProductFormMessage("");
    setShowProductModal(true);
  }

  function openCreateProductModal() {
    setFormImageUrl("");
    setProductType("simple");
    setAttributes([]);
    setVariants([]);
    setShowVariantBuilder(false);
    setVariantDrafts({});
    setExistingOptionName("");
    setProductForm({
      id: "",
      name: "",
      sku: "",
      description: "",
      price: "",
      cost: "",
      stock: "",
      minStock: "0",
      categoryId: categories[0]?.id ?? "",
      isActive: true,
      imageUrls: [],
    });
    setProductFormMessage("");
    setShowProductModal(true);
  }

  async function uploadVariantGallery(variantId: string, files: FileList | null) {
    const selectedFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!selectedFiles.length) return;
    const uploadFormData = new FormData();
    selectedFiles.forEach((file) => uploadFormData.append("files", file));
    const response = await fetch("/api/admin/products/upload", { method: "POST", body: uploadFormData, credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data?.urls)) {
      setProductFormMessage(data?.message ?? "Unable to upload variant images.");
      return;
    }
    setVariantDrafts((current) => ({
      ...current,
      [variantId]: { ...current[variantId], imageUrls: [...(current[variantId]?.imageUrls ?? []), ...data.urls] },
    }));
  }

  async function addVariantOption() {
    const optionName = existingOptionName || newVariantDraft.optionName.trim();
    if (!editingProduct || !newVariantDraft.sku.trim() || !optionName || !newVariantDraft.optionValue.trim()) {
      setProductFormMessage("Product code, option name, and option value are required.");
      return;
    }
    try {
      const response = await fetch("/api/admin/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: editingProduct.id,
          sku: newVariantDraft.sku,
          cost: Number(newVariantDraft.cost || 0),
          price: Number(newVariantDraft.price || 0),
          stock: Number(newVariantDraft.stock || 0),
          minStock: Number(newVariantDraft.minStock || 5),
          attributes: { [optionName]: newVariantDraft.optionValue.trim() },
          imageUrls: newVariantDraft.imageUrls,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to add product option.");
      await loadData();
      setShowAddVariant(false);
      setExistingOptionName("");
      setNewVariantDraft({ sku: "", optionName: "", optionValue: "", cost: "", price: "", stock: "0", minStock: "5", imageUrls: [] });
      setProductFormMessage("Product option added successfully.");
    } catch (error) {
      setProductFormMessage(error instanceof Error ? error.message : "Unable to add product option.");
    }
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files?.length) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setProductFormMessage("Please choose an image file.");
      return;
    }

    setIsUploadingImage(true);
    setProductFormMessage("Uploading image...");

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const uploadResponse = await fetch("/api/admin/products/upload", {
        method: "POST",
        credentials: "same-origin",
        body: uploadFormData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData?.url) {
        throw new Error(uploadData?.message ?? "Image upload failed.");
      }

      setFormImageUrl(uploadData.url);
      setProductForm((current) => ({
        ...current,
        imageUrls: [uploadData.url],
      }));
      setProductFormMessage("Image uploaded successfully.");
    } catch (error) {
      setProductFormMessage(error instanceof Error ? error.message : "Unable to upload image.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  function removeImage() {
    setFormImageUrl("");
    setProductForm((current) => ({
      ...current,
      imageUrls: [],
    }));
  }

  async function handleProductSubmit() {
    const hasVariants = Boolean(productForm.id) && productType === "variant";
    const creatingVariants = !productForm.id && productType === "variant";
    const usesVariants = hasVariants || creatingVariants;

    if (!productForm.name.trim() || !productForm.categoryId || (!usesVariants && !productForm.sku.trim())) {
      setProductFormMessage(usesVariants ? "Product name and category are required." : "Name, SKU, and category are required.");
      return;
    }

    if (!usesVariants && (productForm.price === "" || productForm.cost === "" || productForm.stock === "")) {
      setProductFormMessage("Price, cost, and stock are required.");
      return;
    }

    const variantRowsForSubmit = productForm.id && editingProduct?.variants?.length
      ? editingProduct.variants.map((variant) => ({
          sku: String(variantDrafts[variant.id]?.sku ?? variant.sku ?? ""),
          price: String(variantDrafts[variant.id]?.price ?? variant.price ?? ""),
          cost: String(variantDrafts[variant.id]?.cost ?? variant.cost ?? ""),
        }))
      : variants;

    if (
      usesVariants &&
      (variantRowsForSubmit.length === 0 ||
        variantRowsForSubmit.some((variant) => !String(variant.sku).trim() || String(variant.price).trim() === "" || String(variant.cost).trim() === ""))
    ) {
      setProductFormMessage("Generate variants and complete every variant SKU, price, and cost.");
      return;
    }

    if (!usesVariants && (Number(productForm.price) < 0 || Number(productForm.cost) < 0 || Number(productForm.stock) < 0 || Number(productForm.minStock) < 0)) {
      setProductFormMessage("Price, cost, stock, and minimum stock must be zero or greater.");
      return;
    }

    setIsSavingProduct(true);
    setProductFormMessage("");

    const payload = {
      ...(productForm.id ? { id: productForm.id } : {}),
      name: productForm.name.trim(),
      sku: usesVariants ? "" : productForm.sku.trim(),
      categoryId: productForm.categoryId,
      isActive: productForm.isActive,
      price: Number(productForm.price || 0),
      cost: Number(productForm.cost || 0),
      stock: Number(productForm.stock || 0),
      minStock: Number(productForm.minStock || 5),
      hasVariants: usesVariants,
      variants:
        productForm.id && editingProduct?.variants?.length
          ? editingProduct.variants.map((variant) => ({
              id: variant.id,
              sku: variantDrafts[variant.id]?.sku ?? variant.sku,
              price: Number(variantDrafts[variant.id]?.price ?? variant.price),
              cost: Number(variantDrafts[variant.id]?.cost ?? variant.cost),
              minStock: Number(variantDrafts[variant.id]?.minStock ?? variant.minStock),
              imageUrls: variantDrafts[variant.id]?.imageUrls ?? variant.imageUrls ?? [],
            }))
          : usesVariants
          ? variants.map((variant) => ({
              sku: variant.sku,
              price: Number(variant.price),
              cost: Number(variant.cost),
              stock: Number(variant.stock),
              minStock: Number(variant.minStock),
              attributeValues: variant.attributes,
              imageUrls: variant.imageUrls ?? [],
            }))
          : [],
      ...(formImageUrl && { imageUrls: [formImageUrl] }),
    };

    const response = await fetch("/api/admin/products", {
      method: productForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setIsSavingProduct(false);

    if (!response.ok) {
      setProductFormMessage(data.message ?? "Unable to save product.");
      return;
    }

    if (productForm.id || currentPage === 1) {
      await loadData();
    } else {
      setCurrentPage(1);
    }
    setShowProductModal(false);
    setProductFormMessage("");
    triggerSuccessToast(productForm.id ? "Product updated successfully." : "Product created successfully.");
  }

  async function confirmDeleteProduct() {
    if (!productToDelete) return;

    try {
      setIsDeletingProductId(productToDelete.id);
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(productToDelete.id)}`, { method: "DELETE" });
      const data = await res.json();
      setIsDeletingProductId(null);
      if (!res.ok) {
        setProductFormMessage(data?.message ?? "Unable to delete product.");
        return;
      }
      setProductToDelete(null);
      await loadData();
      triggerSuccessToast("Product deleted successfully.");
    } catch {
      setIsDeletingProductId(null);
      setProductFormMessage("Unable to delete product.");
    }
  }

  async function confirmDeleteVariant() {
    if (!variantToDelete) return;
    try {
      const response = await fetch(`/api/admin/variants/${variantToDelete.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to remove variant.");
      setVariantToDelete(null);
      await loadData();
      triggerSuccessToast("Variant removed from active product options.");
    } catch (error) {
      setProductFormMessage(error instanceof Error ? error.message : "Unable to remove variant.");
    }
  }

  const totalStockValue = inventorySummary.totalStockValue;
  const totalStockUnits = inventorySummary.totalStockUnits;
  const lowStockCount = inventorySummary.lowStockCount;

  const isInventorySubSectionView =
    activeInventorySection === "stock-in" ||
    activeInventorySection === "stock-out" ||
    activeInventorySection === "threshold-adjustment";

  const filteredProducts = products;

  const editingProduct = productForm.id ? products.find((product) => product.id === productForm.id) : null;
  const movementAction = activeInventorySection as InventoryMovementAction;
  const movementProduct = movementProducts.find((product) => product.id === movementProductId) ?? null;
  const movementHasVariants = Boolean(movementProduct?.variants?.length);
  const movementVariant = movementHasVariants
    ? movementProduct?.variants?.find((variant) => variant.id === movementVariantId) ?? null
    : null;
  const movementCurrentStock = movementHasVariants
    ? Number(movementVariant?.stock ?? 0)
    : Number(movementProduct?.stock ?? 0);
  const movementCurrentMinStock = movementHasVariants
    ? Number(movementVariant?.minStock ?? 5)
    : Number(movementProduct?.minStock ?? 5);
  const movementQuantityNumber = Math.max(0, Number(movementQuantity || 0));
  const movementMinStockNumber = Math.max(0, Number(movementMinStock || 0));
  const movementProjectedStock = movementAction === "stock-in"
    ? movementCurrentStock + movementQuantityNumber
    : movementAction === "stock-out"
    ? movementCurrentStock - movementQuantityNumber
    : movementCurrentStock;
  const movementFilteredProducts = movementProducts.filter((product) => {
    const query = movementProductSearch.trim().toLowerCase();
    const matchesCategory = !movementCategoryFilter || product.categoryId === movementCategoryFilter;
    const matchesSearch = !query || [product.name, product.sku, product.category?.name ?? ""].some((value) =>
      String(value).toLowerCase().includes(query)
    ) || product.variants?.some((variant) =>
      `${variant.sku} ${JSON.stringify(variant.attributes ?? "")}`.toLowerCase().includes(query)
    );
    return matchesCategory && matchesSearch;
  });

  const totalPages = Math.max(1, pagination.totalPages);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const visibleRangeStart = pagination.totalCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const visibleRangeEnd = Math.min(safeCurrentPage * pageSize, pagination.totalCount);

  function getPageNumbers() {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
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

  function handleJumpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetPage = Number.parseInt(jumpInput, 10);

    if (!Number.isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
      setCurrentPage(targetPage);
      setJumpInput("");
    }
  }

  return (
    <div className="flex flex-1 flex-col space-y-6">
      {/* Toast Notification */}
      {showSuccessToast && (
        <div className="fixed left-1/2 top-20 z-70 flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-200 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Delete Product Confirmation Dialog */}
      {productToDelete && (
        <AdminModalPortal>
        <div className={ADMIN_MODAL_BACKDROP_CLASS} role="presentation">
          <div
            className={`${ADMIN_MODAL_PANEL_CLASS} relative z-10 w-full max-w-md p-6`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 id="delete-product-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  Delete product?
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  This permanently removes the product from active inventory. Historic transaction records will be retained.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                disabled={Boolean(isDeletingProductId)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 truncate">
              {productToDelete.name}
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                disabled={Boolean(isDeletingProductId)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteProduct()}
                disabled={Boolean(isDeletingProductId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {isDeletingProductId ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  "Delete product"
                )}
              </button>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* Delete Variant Confirmation Dialog */}
      {variantToDelete && (
        <AdminModalPortal>
        <div className={ADMIN_MODAL_BACKDROP_CLASS} role="presentation">
          <div
            className={`${ADMIN_MODAL_PANEL_CLASS} relative z-10 w-full max-w-md p-6`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-variant-title"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="delete-variant-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  Delete option variant?
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  This variant will no longer be available for sales or movements.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {variantToDelete.productName} · <span className="font-mono text-xs">{variantToDelete.sku}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setVariantToDelete(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteVariant()}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Delete option
              </button>
            </div>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* Page Header */}
      <div className="flex flex-row items-center justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Inventory
            </h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {inventorySummary.totalProducts} {inventorySummary.totalProducts === 1 ? "item" : "items"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor stock health, record movements, and adjust low-stock warning thresholds.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 self-center">
          <button
            type="button"
            onClick={() => {
              window.location.hash = "";
              setActiveInventorySection("");
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              !isInventorySubSectionView
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => {
              openMovementSection("stock-in");
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeInventorySection === "stock-in"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <ArrowDownRight className="h-3.5 w-3.5" />
            <span>Stock In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              openMovementSection("stock-out");
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeInventorySection === "stock-out"
                ? "bg-rose-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Stock Out</span>
          </button>
          <button
            type="button"
            onClick={() => {
              openMovementSection("threshold-adjustment");
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeInventorySection === "threshold-adjustment"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Thresholds</span>
          </button>
        </div>
      </div>

      {!isInventorySubSectionView ? (
        <>
          {/* KPI Metrics Grid */}
          <div id="inventory-summary" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Products</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Package className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {inventorySummary.totalProducts}
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Active catalog items</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Stock Units</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Warehouse className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {totalStockUnits.toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">In-store physical units</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Inventory Valuation</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                  <TrendingDown className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white truncate">
                ₱{totalStockValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Based on unit cost value</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Low Stock Alerts</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                {lowStockCount}
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">At or below reorder threshold</p>
            </div>
          </div>

          {/* Stock Overview Table Card */}
          <div id="stock-overview" className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {/* Table Header & Controls */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Stock Overview</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Live balance across single products and variants.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    title="Refresh data"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCreateProductModal}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                    <span>Add Product</span>
                  </button>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="grid items-center gap-3 grid-cols-[1.5fr_1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by product name, SKU, or category..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setCurrentPage(1);
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Product type filter">
                  {(
                    [
                      ["ALL", "All", typeCounts.ALL],
                      ["SIMPLE", "Single", typeCounts.SIMPLE],
                      ["VARIANT", "Variants", typeCounts.VARIANT],
                    ] as const
                  ).map(([value, label, count]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setProductTypeFilter(value);
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        productTypeFilter === value
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      }`}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="w-16 px-4 py-3 font-semibold whitespace-nowrap">Photo</th>
                    <th className="min-w-52 px-4 py-3 font-semibold">Product</th>
                    <th className="w-20 px-3 py-3 text-center font-semibold whitespace-nowrap">Stock</th>
                    <th className="w-20 px-3 py-3 text-center font-semibold whitespace-nowrap">Min</th>
                    <th className="w-24 px-3 py-3 text-right font-semibold whitespace-nowrap">Cost</th>
                    <th className="w-24 px-3 py-3 text-right font-semibold whitespace-nowrap">Price</th>
                    <th className="w-28 px-3 py-3 text-center font-semibold whitespace-nowrap">Status</th>
                    <th className="w-20 px-4 py-3 text-center font-semibold whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={`inventory-skeleton-${index}`} className="animate-pulse">
                        <td className="px-4 py-3"><div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-3 text-center"><div className="mx-auto h-4 w-10 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-3 text-center"><div className="mx-auto h-4 w-10 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-3 text-right"><div className="ml-auto h-4 w-12 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-3 text-right"><div className="ml-auto h-4 w-12 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-3 text-center"><div className="mx-auto h-6 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-4 py-3 text-center"><div className="mx-auto h-8 w-8 rounded bg-slate-200 dark:bg-slate-700" /></td>
                      </tr>
                    ))
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="text-sm font-medium">No products match your criteria</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            Try adjusting your search query or category filter.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => {
                      const stock = Number(product.stock ?? 0);
                      const minStock = Number(product.minStock ?? 0);
                      const status =
                        stock <= 0
                          ? "Out of stock"
                          : stock <= minStock
                          ? "Low stock"
                          : "In stock";
                      const productImageUrls = product.imageUrl
                        ? JSON.parse(product.imageUrl).filter((url: unknown): url is string => typeof url === "string")
                        : [];
                      const primaryImage = productImageUrls[0];

                      return (
                        <Fragment key={product.id}>
                          <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                            <td className="w-16 px-4 py-3 whitespace-nowrap">
                              {primaryImage ? (
                                <Image
                                  src={primaryImage}
                                  alt={product.name}
                                  width={48}
                                  height={48}
                                  className="h-10 w-10 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-lg border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                            </td>

                            <td className="min-w-52 px-4 py-3">
                              <div className="font-semibold text-slate-900 dark:text-white truncate">
                                {product.name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                <span className="truncate">{product.category?.name ?? "Uncategorized"}</span>
                                <span>•</span>
                                {product.variants?.length ? (
                                  <span className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                                    <Layers3 className="h-3 w-3" />
                                    {product.variants.length} options
                                  </span>
                                ) : (
                                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                    SKU: {product.sku}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="w-20 px-3 py-3 text-center whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                              {product.variants?.length ? (
                                <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                              ) : (
                                stock
                              )}
                            </td>

                            <td className="w-20 px-3 py-3 text-center whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                              {product.variants?.length ? "—" : minStock}
                            </td>

                            <td className="w-24 px-3 py-3 text-right whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                              {product.variants?.length ? "Per option" : `₱${Number(product.cost ?? 0).toLocaleString("en-PH")}`}
                            </td>

                            <td className="w-24 px-3 py-3 text-right whitespace-nowrap text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {product.variants?.length ? "Per option" : `₱${Number(product.price ?? 0).toLocaleString("en-PH")}`}
                            </td>

                            <td className="w-28 px-3 py-3 text-center whitespace-nowrap">
                              {product.variants?.length ? (
                                <span className="inline-flex items-center rounded-md border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                                  See options
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                    status === "Low stock"
                                      ? "border border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                                      : status === "Out of stock"
                                      ? "border border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                                      : "border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  }`}
                                >
                                  {status}
                                </span>
                              )}
                            </td>

                            <td className="w-20 px-4 py-3 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openMovementSection("stock-in", { productId: product.id })}
                                  title="Quick Stock In"
                                  aria-label={`Quick stock in for ${product.name}`}
                                  className="rounded p-1 text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                >
                                  <ArrowDownRight className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openMovementSection("stock-out", { productId: product.id })}
                                  title="Quick Stock Out"
                                  aria-label={`Quick stock out for ${product.name}`}
                                  className="rounded p-1 text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openMovementSection("threshold-adjustment", { productId: product.id })}
                                  title="Quick Threshold Adjustment"
                                  aria-label={`Quick threshold adjustment for ${product.name}`}
                                  className="rounded p-1 text-amber-600 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                >
                                  <SlidersHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => openEditProductModal(product)}
                                    title="Edit product"
                                    aria-label={`Edit product ${product.name}`}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setProductToDelete(product)}
                                  disabled={isDeletingProductId === product.id}
                                  title="Delete product"
                                  aria-label={`Delete product ${product.name}`}
                                  className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Nested Variant Rows */}
                          {Boolean(product.variants?.length) && (
                            <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                              <td colSpan={8} className="px-4 py-3 border-y border-slate-100 dark:border-slate-800">
                                <div className="ml-6 rounded-lg border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                                    <div className="flex items-center gap-1.5">
                                      <Layers3 className="h-3.5 w-3.5 text-indigo-500" />
                                      <span>Product Options ({product.variants?.length})</span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                                      Total variant stock: {product.variants?.reduce((sum, v) => sum + Number(v.stock ?? 0), 0)}
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead className="border-b border-slate-100 bg-slate-50/40 text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
                                        <tr>
                                          <th className="px-3 py-2 font-medium">Option</th>
                                          <th className="px-3 py-2 font-medium">Product Code</th>
                                          <th className="px-3 py-2 font-medium text-center">Stock</th>
                                          <th className="px-3 py-2 font-medium text-center">Min</th>
                                          <th className="px-3 py-2 font-medium text-right">Cost</th>
                                          <th className="px-3 py-2 font-medium text-right">Price</th>
                                          <th className="px-3 py-2 font-medium text-center">Status</th>
                                          <th className="px-3 py-2 font-medium text-center">Quick Movement</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {product.variants?.map((variant) => {
                                          const vStock = Number(variant.stock ?? 0);
                                          const vMin = Number(variant.minStock ?? 0);
                                          const vStatus =
                                            vStock <= 0 ? "Out of stock" : vStock <= vMin ? "Low stock" : "In stock";
                                          return (
                                            <tr key={variant.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                                              <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                                                {variant.attributes && Object.keys(variant.attributes).length
                                                  ? Object.entries(variant.attributes)
                                                      .map(([name, value]) => `${name}: ${value}`)
                                                      .join(" • ")
                                                  : "Variant"}
                                              </td>
                                              <td className="px-3 py-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                                {variant.sku}
                                              </td>
                                              <td className="px-3 py-2 text-center font-semibold text-slate-800 dark:text-slate-200">
                                                {variant.stock}
                                              </td>
                                              <td className="px-3 py-2 text-center text-slate-500 dark:text-slate-400">
                                                {variant.minStock}
                                              </td>
                                              <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                                                ₱{Number(variant.cost).toLocaleString("en-PH")}
                                              </td>
                                              <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-200">
                                                ₱{Number(variant.price).toLocaleString("en-PH")}
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                <span
                                                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                                    vStatus === "Out of stock"
                                                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                                      : vStatus === "Low stock"
                                                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                  }`}
                                                >
                                                  {vStatus}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      openMovementSection("stock-in", { productId: product.id, variantId: variant.id });
                                                    }}
                                                    title="Quick Stock In"
                                                    className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 transition"
                                                  >
                                                    <ArrowDownRight className="h-3.5 w-3.5" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      openMovementSection("stock-out", { productId: product.id, variantId: variant.id });
                                                    }}
                                                    title="Quick Stock Out"
                                                    className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                                                  >
                                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      openMovementSection("threshold-adjustment", { productId: product.id, variantId: variant.id });
                                                    }}
                                                    title="Quick Threshold Adjustment"
                                                    className="rounded p-1 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40 transition"
                                                  >
                                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setVariantToDelete({ id: variant.id, sku: variant.sku, productName: product.name })}
                                                    title="Delete variant option"
                                                    className="rounded p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Pagination */}
            <div className="flex flex-col gap-4 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Showing <strong className="font-semibold text-slate-800 dark:text-slate-200">{visibleRangeStart.toLocaleString()}</strong> to{" "}
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">{visibleRangeEnd.toLocaleString()}</strong> of{" "}
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">{pagination.totalCount.toLocaleString()}</strong> products
                </span>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {[10, 25, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1 || isLoading}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="First page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <ChevronLeft className="-ml-2 h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                    disabled={safeCurrentPage <= 1 || isLoading}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="font-medium">Prev</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, index) =>
                      typeof page === "number" ? (
                        <button
                          key={page}
                          type="button"
                          disabled={isLoading}
                          onClick={() => setCurrentPage(page)}
                          className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition ${
                            page === safeCurrentPage
                              ? "bg-slate-900 text-white shadow-sm dark:bg-emerald-600 dark:text-white"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          }`}
                        >
                          {page}
                        </button>
                      ) : (
                        <span key={`dots-${index}`} className="px-1 text-slate-400 dark:text-slate-500">
                          {page}
                        </span>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
                    disabled={safeCurrentPage >= totalPages || isLoading}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Next page"
                  >
                    <span className="font-medium">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages || isLoading}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Last page"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <ChevronRight className="-ml-2 h-4 w-4" />
                  </button>
                </div>

                {totalPages > 4 && (
                  <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 border-l border-slate-200 pl-2 dark:border-slate-700">
                    <span>Go to:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpInput}
                      onChange={(event) => setJumpInput(event.target.value)}
                      placeholder={String(safeCurrentPage)}
                      className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <button
                      type="submit"
                      disabled={!jumpInput}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Go
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="w-full rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-900/60">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {movementAction === "stock-in" ? "Stock In" : movementAction === "stock-out" ? "Stock Out" : "Threshold Adjustment"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {movementAction === "stock-in"
                  ? "Receive new stock into inventory."
                  : movementAction === "stock-out"
                  ? "Record stock deductions from inventory."
                  : "Set the minimum stock level for low-stock alerts."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearMovementSelection();
                window.location.hash = "";
                setActiveInventorySection("");
              }}
              className="self-start text-xs font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Back to Stock Overview
            </button>
          </div>

          <form onSubmit={handleMovementSubmit} className="grid gap-6 p-6 grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="space-y-5">
              {movementError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {movementError}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Target Product <span className="text-rose-500">*</span>
                  </label>
                  {movementProduct ? (
                    <button type="button" onClick={clearMovementSelection} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                      Change product
                    </button>
                  ) : null}
                </div>

                {movementProduct ? (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{movementProduct.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {movementProduct.category?.name ?? "Uncategorized"} · {movementHasVariants ? `${movementProduct.variants?.length} variants` : `SKU: ${movementProduct.sku}`}
                      </div>
                    </div>
                    <button type="button" onClick={clearMovementSelection} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Deselect product">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid gap-2 grid-cols-[1.4fr_1fr]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          value={movementProductSearch}
                          onChange={(event) => setMovementProductSearch(event.target.value)}
                          placeholder="Search product name, SKU, or variant..."
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <select
                        value={movementCategoryFilter}
                        onChange={(event) => setMovementCategoryFilter(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="">All categories</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </div>
                    <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-1.5 dark:border-slate-800 dark:bg-slate-950/40">
                      {isLoadingMovementProducts ? (
                        <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">Loading products...</div>
                      ) : movementFilteredProducts.length ? movementFilteredProducts.map((product) => {
                        const stock = product.variants?.length
                          ? product.variants.reduce((sum, variant) => sum + Number(variant.stock ?? 0), 0)
                          : Number(product.stock ?? 0);
                        return (
                          <button key={product.id} type="button" onClick={() => handleMovementProductSelect(product)} className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left transition hover:border-slate-200 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-800/80">
                            <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{product.name}</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{product.category?.name ?? "Uncategorized"} · {product.variants?.length ? `${product.variants.length} variants` : `SKU: ${product.sku}`}</span></span>
                            <span className="shrink-0 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-200">Stock: {stock}</span>
                          </button>
                        );
                      }) : <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">No products match your search.</div>}
                    </div>
                  </div>
                )}
              </div>

              {movementHasVariants ? (
                <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Select Variant Option <span className="text-rose-500">*</span></label>
                  <div className="grid gap-2 grid-cols-2">
                    {movementProduct?.variants?.map((variant) => {
                      const stock = Number(variant.stock ?? 0);
                      const min = Number(variant.minStock ?? 0);
                      return (
                        <button key={variant.id} type="button" onClick={() => { setMovementVariantId(variant.id); setMovementMinStock(String(min)); setMovementError(""); }} className={`rounded-lg border p-3 text-left transition ${movementVariantId === variant.id ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900 dark:border-slate-100 dark:bg-slate-800 dark:ring-slate-100" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"}`}>
                          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-900 dark:text-white">{variant.sku}</span><span className="text-[10px] text-slate-500">Stock: {stock}</span></div>
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Min threshold: {min}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Movement Details</label>
                {movementAction === "threshold-adjustment" ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">New Minimum Stock Threshold</label>
                    <input type="number" min="0" value={movementMinStock} onChange={(event) => setMovementMinStock(event.target.value)} required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{movementAction === "stock-in" ? "Quantity to Add" : "Quantity to Deduct"}</label>
                    <input type="number" min="1" max={movementAction === "stock-out" ? movementCurrentStock : undefined} value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                    {movementAction === "stock-out" ? <p className="mt-1 text-[11px] text-slate-500">Maximum available to deduct: {movementCurrentStock} units</p> : null}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Remarks / Audit Reason</label>
                  <textarea value={movementRemarks} onChange={(event) => setMovementRemarks(event.target.value)} rows={2} placeholder="Add a reason for this inventory update" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={clearMovementSelection} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Reset</button>
                <button type="submit" disabled={!movementProductId || isLoadingMovementProducts || Boolean(movementProductId && !movementProduct) || (movementHasVariants && !movementVariantId) || (!movementAction.includes("threshold") && movementQuantityNumber <= 0) || (movementAction === "stock-out" && movementQuantityNumber > movementCurrentStock) || isSubmittingMovement} className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${movementAction === "stock-in" ? "bg-emerald-600 hover:bg-emerald-700" : movementAction === "stock-out" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}>
                  {isSubmittingMovement ? "Saving update..." : movementAction === "stock-in" ? "Save Stock In" : movementAction === "stock-out" ? "Save Stock Out" : "Save Threshold"}
                </button>
              </div>
            </div>

            <aside className="h-fit rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40 sticky top-6">
              <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Transaction Preview</span><h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">Item Balance Summary</h3></div>
              {movementProduct ? (
                <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{movementProduct.name}</span><span className="text-[11px] text-slate-500">{movementProduct.category?.name ?? "Uncategorized"}</span></div>
                  <div className="flex justify-between border-b border-slate-200/60 py-1"><span>Current Stock</span><strong className="text-slate-900 dark:text-white">{movementCurrentStock} units</strong></div>
                  {movementAction === "threshold-adjustment" ? <><div className="flex justify-between border-b border-slate-200/60 py-1"><span>Current Threshold</span><span>{movementCurrentMinStock} units</span></div><div className="flex justify-between rounded-md bg-white px-2 py-1.5 font-semibold dark:bg-slate-900"><span>New Threshold</span><span className="text-amber-600">{movementMinStockNumber} units</span></div></> : <><div className="flex justify-between border-b border-slate-200/60 py-1"><span>{movementAction === "stock-in" ? "Incoming Stock" : "Deduction"}</span><span className={movementAction === "stock-in" ? "text-emerald-600" : "text-rose-600"}>{movementAction === "stock-in" ? "+" : "-"}{movementQuantityNumber} units</span></div><div className="flex justify-between rounded-md bg-white px-2 py-1.5 font-semibold dark:bg-slate-900"><span>New Balance</span><span>{movementProjectedStock} units</span></div><div className="flex justify-between py-1 text-[11px]"><span>Min Threshold</span><span>{movementCurrentMinStock} units</span></div></>}
                </div>
              ) : <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">Select a product to view stock details.</div>}
            </aside>
          </form>
        </div>
      )}

      {/* Product Create / Edit Modal */}
      {showProductModal && (
        <AdminModalPortal>
        <div className={`${ADMIN_MODAL_BACKDROP_CLASS} items-start px-4 py-6`} role="presentation">
          <div
            className={`${ADMIN_MODAL_PANEL_CLASS} relative z-10 mt-16 flex max-h-[86vh] w-full max-w-5xl flex-col border-emerald-200 shadow-none dark:border-emerald-800`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
          >
            <div className="flex items-center justify-between border-b border-emerald-100 bg-white px-6 py-4 dark:border-emerald-900/60 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="product-modal-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                    {productForm.id ? "Edit Product" : "Create Product"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {productForm.id ? "Update product attributes, pricing, and variant details." : "Add a new product with optional variants to catalog."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto bg-white p-6 dark:bg-slate-900">
              {productFormMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{productFormMessage}</div>
                </div>
              )}

              <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Product Cover Image
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Recommended: Square PNG/JPG</span>
                </div>

                <div className="flex items-center gap-4">
                  {formImageUrl ? (
                    <div className="relative group">
                      <Image
                        src={formImageUrl}
                        alt="Product cover"
                        width={80}
                        height={80}
                        className="h-20 w-20 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 p-1 text-white shadow-xs hover:bg-rose-700"
                        title="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                      <Package className="h-6 w-6" />
                    </div>
                  )}

                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                    <UploadCloud className="h-4 w-4" />
                    <span>{isUploadingImage ? "Uploading..." : "Upload Cover Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files)}
                      disabled={isUploadingImage}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Basic Details
                </span>

                <div className="grid gap-4 grid-cols-2">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Product Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={productForm.name}
                      onChange={(e) => setProductForm((curr) => ({ ...curr, name: e.target.value }))}
                      placeholder="e.g. Wireless Ergonomic Mouse"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={productForm.categoryId}
                      onChange={(e) => setProductForm((curr) => ({ ...curr, categoryId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!showVariantBuilder && productType !== "variant" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Product SKU / Code <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={productForm.sku}
                        onChange={(e) => setProductForm((curr) => ({ ...curr, sku: e.target.value }))}
                        placeholder="e.g. PRD-001"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              {!showVariantBuilder && productType !== "variant" && (
                <div className="space-y-4">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Pricing & Inventory
                  </span>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Cost (₱)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.cost}
                        onChange={(e) => setProductForm((curr) => ({ ...curr, cost: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Price (₱)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.price}
                        onChange={(e) => setProductForm((curr) => ({ ...curr, price: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Opening Stock
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={productForm.stock}
                        onChange={(e) => setProductForm((curr) => ({ ...curr, stock: e.target.value }))}
                        readOnly={Boolean(productForm.id)}
                        className={`w-full rounded-lg border px-3 py-2 outline-none text-sm ${
                          productForm.id
                            ? "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                            : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      />
                      {productForm.id && <p className="mt-1 text-[11px] text-slate-500">Managed via Stock Movements</p>}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Min Threshold
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={productForm.minStock}
                        onChange={(e) => setProductForm((curr) => ({ ...curr, minStock: e.target.value }))}
                        readOnly={Boolean(productForm.id)}
                        className={`w-full rounded-lg border px-3 py-2 outline-none text-sm ${
                          productForm.id
                            ? "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                            : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      />
                      {productForm.id && <p className="mt-1 text-[11px] text-slate-500">Managed via Thresholds</p>}
                    </div>
                  </div>
                </div>
              )}

              {!productForm.id && (
                <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                        Product Variants
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Enable if this product has size, color, flavor, or multiple options.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !showVariantBuilder;
                        setShowVariantBuilder(nextState);
                        setProductType(nextState ? "variant" : "simple");
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        showVariantBuilder
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {showVariantBuilder ? "Disable Variants" : "Enable Variants"}
                    </button>
                  </div>

                  {showVariantBuilder && (
                    <div className="space-y-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <AttributeManager attributes={attributes} onAttributesChange={setAttributes} />
                      <VariantGenerator
                        attributes={attributes}
                        onVariantsGenerate={setVariants}
                        initialVariants={variants}
                        productName={productForm.name}
                      />
                    </div>
                  )}
                </div>
              )}

              {productForm.id && Boolean(editingProduct?.variants?.length) && (
                <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                        Variant Options ({editingProduct?.variants?.length})
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Adjust individual variant pricing and SKU codes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddVariant((c) => !c)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {showAddVariant ? "Cancel New Option" : "Add Option"}
                    </button>
                  </div>

                  {showAddVariant && (
                    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 grid-cols-4">
                      <select
                        value={existingOptionName}
                        onChange={(e) => {
                          setExistingOptionName(e.target.value);
                          if (e.target.value) setNewVariantDraft((c) => ({ ...c, optionName: e.target.value }));
                        }}
                        className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="">Choose option attribute</option>
                        {Array.from(new Set((editingProduct?.variants ?? []).flatMap((v) => Object.keys(v.attributes ?? {})))).map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      {!existingOptionName && (
                        <input
                          placeholder="Attribute name (e.g. Size)"
                          value={newVariantDraft.optionName}
                          onChange={(e) => setNewVariantDraft((c) => ({ ...c, optionName: e.target.value }))}
                          className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                        />
                      )}
                      <input
                        placeholder="Value (e.g. Large)"
                        value={newVariantDraft.optionValue}
                        onChange={(e) => setNewVariantDraft((c) => ({ ...c, optionValue: e.target.value }))}
                        className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                      <input
                        placeholder="SKU"
                        value={newVariantDraft.sku}
                        onChange={(e) => setNewVariantDraft((c) => ({ ...c, sku: e.target.value }))}
                        className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Cost"
                        value={newVariantDraft.cost}
                        onChange={(e) => setNewVariantDraft((c) => ({ ...c, cost: e.target.value }))}
                        className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price"
                        value={newVariantDraft.price}
                        onChange={(e) => setNewVariantDraft((c) => ({ ...c, price: e.target.value }))}
                        className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => void addVariantOption()}
                        className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 col-span-2"
                      >
                        Save New Option
                      </button>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2 font-medium">Image</th>
                          <th className="px-3 py-2 font-medium">Option</th>
                          <th className="px-3 py-2 font-medium">SKU</th>
                          <th className="px-3 py-2 font-medium text-center">Stock</th>
                          <th className="px-3 py-2 font-medium text-right">Cost (₱)</th>
                          <th className="px-3 py-2 font-medium text-right">Price (₱)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {editingProduct?.variants?.map((variant) => (
                          <tr key={variant.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="whitespace-nowrap px-3 py-2">
                              <div className="flex flex-wrap items-center gap-1">
                                {(variantDrafts[variant.id]?.imageUrls ?? variant.imageUrls ?? []).map((url) => (
                                  <div key={url} className="relative">
                                    <Image
                                      src={url}
                                      alt="Variant"
                                      width={36}
                                      height={36}
                                      className="h-8 w-8 rounded object-cover"
                                      unoptimized
                                    />
                                    <button
                                      type="button"
                                      aria-label="Remove variant image"
                                      onClick={() =>
                                        setVariantDrafts((curr) => ({
                                          ...curr,
                                          [variant.id]: {
                                            ...curr[variant.id],
                                            imageUrls: (curr[variant.id]?.imageUrls ?? variant.imageUrls ?? []).filter((item) => item !== url),
                                          },
                                        }))
                                      }
                                      className="absolute -top-1 -right-1 rounded-full bg-rose-600 p-0.5 text-white"
                                    >
                                      <X className="h-2 w-2" />
                                    </button>
                                  </div>
                                ))}
                                <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-700">
                                  <UploadCloud className="h-3.5 w-3.5" />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(event) => {
                                      void uploadVariantGallery(variant.id, event.target.files);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                              {variant.attributes && Object.keys(variant.attributes).length
                                ? Object.entries(variant.attributes)
                                    .map(([name, value]) => `${name}: ${value}`)
                                    .join(" • ")
                                : "Variant"}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={variantDrafts[variant.id]?.sku ?? variant.sku}
                                onChange={(event) =>
                                  setVariantDrafts((curr) => ({
                                    ...curr,
                                    [variant.id]: { ...curr[variant.id], sku: event.target.value },
                                  }))
                                }
                                className="w-24 rounded border border-slate-200 px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-slate-800 dark:text-slate-200">
                              {variant.stock}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantDrafts[variant.id]?.cost ?? String(variant.cost)}
                                onChange={(event) =>
                                  setVariantDrafts((curr) => ({
                                    ...curr,
                                    [variant.id]: { ...curr[variant.id], cost: event.target.value },
                                  }))
                                }
                                className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantDrafts[variant.id]?.price ?? String(variant.price)}
                                onChange={(event) =>
                                  setVariantDrafts((curr) => ({
                                    ...curr,
                                    [variant.id]: { ...curr[variant.id], price: event.target.value },
                                  }))
                                }
                                className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200/80 px-6 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingProduct}
                onClick={handleProductSubmit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 text-sm"
              >
                {isSavingProduct ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{productForm.id ? "Update Product" : "Create Product"}</span>
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
