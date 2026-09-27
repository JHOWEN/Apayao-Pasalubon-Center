"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  Globe,
  Mail,
  MapPin,
  Phone,
  SearchX,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  TimerReset,
} from "lucide-react";
import { ProductCard } from "@/components/ecommerce/product-card";
import { ProductGroupCard } from "@/components/ecommerce/product-group-card";
import { fetchWithTimeout, getResponseErrorMessage, getUserFacingErrorMessage } from "@/lib/client-fetch";

type ProductItem = {
  id: string;
  name: string;
  description?: string | null;
  price?: string | number | null;
  imageUrl?: string | null;
  stock?: string | number | null;
  averageRating?: string | number | null;
  reviewCount?: string | number | null;
  soldCount?: string | number | null;
  latestReview?: string | null;
  variants?: Array<{
    id: string;
    sku: string;
    price: number;
    stock: number;
    attributes?: Record<string, string>;
    imageUrls?: string[];
  }>;
  category?: {
    name?: string;
  };
  productGroup?: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    optionType: string;
    optionName: string | null;
    unit: string | null;
    parentProduct?: {
      id: string;
      name: string;
      sku: string;
      description: string | null;
      imageUrl: string | null;
      price: number;
      stock: number;
      minStock: number;
      category?: { id: string; name: string };
      optionValue?: string;
    };
    items: Array<{
      id: string;
      optionValue: string;
      sortOrder: number;
      assignedProductId?: string;
      inventoryProduct?: {
        id: string;
        name: string;
        sku: string;
        description: string | null;
        imageUrl: string | null;
        price: number;
        stock: number;
        minStock: number;
        category?: { id: string; name: string };
      };
    }>;
  };
};

type CategoryItem = {
  id: string;
  name: string;
};

function EcommerceHomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalCount, setCatalogTotalCount] = useState(0);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const searchQuery = searchParams.get("search")?.trim() ?? "";
  const categoryQuery = searchParams.get("category")?.trim() ?? "";
  const isTimeoutError = (catalogError ?? "").toLowerCase().includes("timed out");

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      setCatalogError(null);
      setLoadMoreError(null);

      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim());
        }
        if (categoryQuery.trim()) {
          params.set("categoryId", categoryQuery.trim());
        }
        params.set("limit", "24");

        params.set("page", "1");
        const response = await fetchWithTimeout(
          `/api/public/products${params.toString() ? `?${params.toString()}` : ""}`,
          {},
          15000,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(getResponseErrorMessage(data, response.status, "Products are temporarily unavailable. Please try again."));
        }

        const fetchedProducts = (Array.isArray(data?.products) ? data.products : []) as ProductItem[];
        setCatalogPage(1);
        setCatalogTotalCount(Number(data?.pagination?.totalCount ?? fetchedProducts.length));
        setHasMoreProducts(Boolean(data?.pagination?.hasNextPage));
        const normalizedProducts = await Promise.all(
          fetchedProducts.map(async (product) => {
            if (!product.productGroup?.items?.length) {
              return product;
            }

            const items = await Promise.all(
              product.productGroup.items.map(async (item) => {
                if (item.inventoryProduct) {
                  return item;
                }

                try {
                  const childResponse = await fetch(
                    `/api/public/products?id=${encodeURIComponent(item.assignedProductId ?? item.id)}`,
                    { cache: "force-cache" },
                  );
                  const childData = await childResponse.json();
                  const child = childData?.product;

                  if (!child) {
                    return null;
                  }

                  return {
                    ...item,
                    inventoryProduct: {
                      id: String(child.id),
                      name: String(child.name ?? "Product"),
                      sku: String(child.sku ?? ""),
                      description: child.description ?? null,
                      imageUrl: child.imageUrl ?? null,
                      price: Number(child.price ?? 0),
                      stock: Number(child.stock ?? 0),
                      minStock: Number(child.minStock ?? 0),
                      category: child.category,
                    },
                  };
                } catch {
                  return null;
                }
              }),
            );

            return {
              ...product,
              productGroup: {
                ...product.productGroup,
                id: product.productGroup.id || product.id,
                name: product.productGroup.name || product.name,
                parentProduct: product.productGroup.parentProduct ?? {
                  id: String(product.id),
                  name: String(product.name ?? "Product"),
                  sku: String((product as ProductItem & { sku?: string }).sku ?? ""),
                  description: product.description ?? null,
                  imageUrl: product.imageUrl ?? null,
                  price: Number(product.price ?? 0),
                  stock: Number(product.stock ?? 0),
                  minStock: 0,
                  category: product.category?.name ? { id: "", name: product.category.name } : undefined,
                },
                items: items.filter((item): item is NonNullable<typeof item> => item !== null),
              },
            };
          }),
        );

        setProducts(normalizedProducts);
      } catch (error) {
        setProducts([]);
        setCatalogPage(1);
        setCatalogTotalCount(0);
        setHasMoreProducts(false);
        setCatalogError(getUserFacingErrorMessage(error, "Products are temporarily unavailable. Please try again."));
      } finally {
        setLoading(false);
      }
    }

    void loadProducts();
  }, [searchQuery, categoryQuery]);

  async function loadMoreProducts() {
    if (isLoadingMore || !hasMoreProducts) return;

    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const params = new URLSearchParams({ page: String(catalogPage + 1), limit: "24" });
      if (searchQuery) params.set("search", searchQuery);
      if (categoryQuery) params.set("categoryId", categoryQuery);
      const response = await fetchWithTimeout(`/api/public/products?${params.toString()}`, {}, 15000);
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(getResponseErrorMessage(data, response.status, "Products are temporarily unavailable. Please try again."));
      }

      const nextProducts = Array.isArray(data.products) ? (data.products as ProductItem[]) : [];
      setProducts((current) => {
        const existingIds = new Set(current.map((product) => product.id));
        return [...current, ...nextProducts.filter((product) => !existingIds.has(product.id))];
      });
      setCatalogPage(Number(data?.pagination?.page ?? catalogPage + 1));
      setHasMoreProducts(Boolean(data?.pagination?.hasNextPage));
      setCatalogTotalCount(Number(data?.pagination?.totalCount ?? catalogTotalCount));
    } catch (error) {
      setLoadMoreError(getUserFacingErrorMessage(error, "Unable to load more products. Please try again."));
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetchWithTimeout("/api/public/categories", { cache: "no-store" }, 15000);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || "Unable to load categories.");
        }

        setCategories(Array.isArray(data) ? data : []);
      } catch {
        setCategories([]);
      }
    }

    void loadCategories();
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest("[data-category-menu]")) {
        setIsCategoryMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function applyCategorySelection(nextCategory: string) {
    const params = new URLSearchParams();

    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    }

    if (nextCategory) {
      params.set("category", nextCategory);
    }

    router.replace(`/?${params.toString()}#catalog`);
    setIsCategoryMenuOpen(false);
  }

  const activeCategory = categories.find((c) => c.id === categoryQuery);

  return (
    <main className="storefront-home min-h-screen bg-[#0a0d14] text-slate-100 pb-16">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .product-skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.6s infinite linear;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-5 sm:space-y-10 sm:px-6 sm:py-7 lg:space-y-12 lg:px-8">
        
        {/* Hero Section */}
        <section className="storefront-hero relative overflow-hidden rounded-3xl border border-white/10 bg-[#12141c] shadow-2xl">
          <div className="absolute inset-0 z-0">
            <Image
              src="/uploads/banner.png"
              alt="Apayao Pasalubong Center banner"
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover object-center opacity-90"
              unoptimized
            />
            <div className="storefront-hero-overlay absolute inset-0 bg-linear-to-r from-[#17213A]/72 via-[#17213A]/30 to-transparent" />
          </div>

          <div className="relative z-10 flex max-w-none flex-col justify-center px-5 py-9 sm:px-10 sm:py-14 lg:pr-107.5 lg:px-14 lg:py-20 xl:pr-115">
            <div className="storefront-hero-badge inline-flex items-center gap-2 rounded-full border border-[#ff8a1e]/30 bg-[#ff8a1e]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#ffb36f] backdrop-blur-sm w-fit">
              <span>Authentic Apayao Goods</span>
            </div>

            <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-5xl">
              Authentic handcrafted goods from Apayao.
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-200 sm:text-base lg:text-lg">
              Local snacks, native delicacies, handwoven textiles, and artisan souvenirs freshly prepared and reserved for convenient store pickup.
            </p>

            {/* Redesigned CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <a
                href="#catalog"
                className="group relative inline-flex h-12 min-w-44 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-linear-to-r from-[#ff8a1e] via-amber-500 to-orange-500 px-7 text-sm font-bold text-slate-950 shadow-[0_10px_25px_-5px_rgba(255,138,30,0.45)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_14px_32px_-4px_rgba(255,138,30,0.6)] active:scale-[0.98]"
              >
                <span>Shop Products</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </a>

              <a
                href="#how-to-order"
                className="inline-flex h-12 min-w-40 items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-md shadow-xs transition-all duration-200 hover:border-white/35 hover:bg-white/15 hover:text-amber-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                How It Works
              </a>
            </div>

            {/* Quick Trust Highlights */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓
                </span>
                <span>Reserve Online & Pick Up</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓
                </span>
                <span>Cash, GCash & Maya</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓
                </span>
                <span>San isidro sur, Luna, Apayao.</span>
              </span>
            </div>

          </div>
        </section>

        {/* Value Proposition Strip */}
        <section className="rounded-2xl border border-white/10 bg-[#12141c]/60 p-4 sm:p-5 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
            {[
              { icon: ShieldCheck, title: "Authentic Goods", desc: "100% genuine local products" },
              { icon: Store, title: "Store Pickup", desc: "Quick & convenient reservation" },
              { icon: CircleDollarSign, title: "Flexible Payment", desc: "Cash, GCash & Maya accepted" },
              { icon: ShoppingBag, title: "Fresh Inventory", desc: "Regularly restocked crafts" },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.title} className="flex items-center gap-3.5 p-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ff8a1e]/20 bg-[#ff8a1e]/10 text-[#ff8a1e]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-white">{item.title}</h2>
                    <p className="text-[11px] text-slate-400">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Product Catalog Section */}
        <section id="catalog" className="storefront-catalog scroll-mt-20 space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
                Explore Collection
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Store Catalog
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                Discover local favorites crafted with care by Apayao artisans.
              </p>
            </div>

            {/* Filter / Search summary */}
            <div className="flex flex-wrap items-center gap-2.5">
              {searchQuery && (
                <div className="flex items-center gap-1.5 rounded-lg border border-[#ff8a1e]/30 bg-[#ff8a1e]/10 px-3 py-1.5 text-xs font-semibold text-[#ffb36f]">
                  <span>Search: &ldquo;{searchQuery}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (categoryQuery) params.set("category", categoryQuery);
                      router.replace(`/?${params.toString()}#catalog`);
                    }}
                    className="ml-1 rounded p-0.5 hover:bg-white/10 text-white"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Category Dropdown (for desktop/tablet quick jump) */}
              <div className="relative hidden md:block" data-category-menu>
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen((open) => !open)}
                  className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#12141c] px-3.5 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-[#181b24]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                  <span className="max-w-36 truncate">
                    {activeCategory ? activeCategory.name : "All Categories"}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isCategoryMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {isCategoryMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-white/10 bg-[#12141c] p-1.5 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => applyCategorySelection("")}
                      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                        !categoryQuery ? "bg-[#ff8a1e]/15 text-[#ff8a1e] font-semibold" : "text-slate-200 hover:bg-white/5"
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => applyCategorySelection(cat.id)}
                        className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                          categoryQuery === cat.id ? "bg-[#ff8a1e]/15 text-[#ff8a1e] font-semibold" : "text-slate-200 hover:bg-white/5"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category filters */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar md:hidden">
              <button
                type="button"
                onClick={() => applyCategorySelection("")}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                  !categoryQuery
                    ? "bg-[#ff8a1e] text-slate-950 shadow-sm"
                    : "border border-white/10 bg-[#12141c] text-slate-300 hover:border-white/20 hover:text-white"
                }`}
              >
                All Products ({products.length})
              </button>
              {categories.map((cat) => {
                const isSelected = categoryQuery === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => applyCategorySelection(cat.id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                      isSelected
                        ? "bg-[#ff8a1e] text-slate-950 shadow-sm"
                        : "border border-white/10 bg-[#12141c] text-slate-300 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Catalog summary */}
          <div className="flex flex-col items-start gap-1 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {products.length} of {catalogTotalCount} products</span>
            <span className="font-semibold text-slate-200">{catalogTotalCount} products available</span>
          </div>

          {/* Products */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 sm:gap-4 lg:gap-5">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-[#12141c]">
                  <div className="product-skeleton aspect-square w-full" />
                  <div className="space-y-3 p-4">
                    <div className="product-skeleton h-3 w-16 rounded" />
                    <div className="product-skeleton h-4 w-3/4 rounded" />
                    <div className="product-skeleton h-3 w-full rounded" />
                    <div className="flex items-center justify-between pt-2">
                      <div className="product-skeleton h-5 w-20 rounded" />
                      <div className="product-skeleton h-8 w-20 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#12141c] px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
                {isTimeoutError ? <TimerReset className="h-6 w-6" /> : <SearchX className="h-6 w-6" />}
              </div>
              <h3 className="text-xl font-bold text-white">
                {catalogError ? (isTimeoutError ? "Connection timed out" : "Catalog unavailable") : "No products found"}
              </h3>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
                {catalogError
                  ? catalogError
                  : searchQuery || categoryQuery
                  ? "We couldn't find any products matching your active filters. Try clearing your search or category."
                  : "No products are currently available in the catalog."}
              </p>
              {catalogError && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
                >
                  {isTimeoutError ? "Retry Now" : "Try Again"}
                </button>
              )}
              {(searchQuery || categoryQuery) && (
                <button
                  type="button"
                  onClick={() => router.replace("/#catalog")}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 sm:gap-4 lg:gap-5">
              {products.map((product, productIndex) => {
                if (product.productGroup?.items?.length) {
                  return (
                    <ProductGroupCard
                      key={product.id}
                      group={{ ...product.productGroup, priority: productIndex < 4 }}
                      soldCount={Number(product.soldCount ?? 0)}
                    />
                  );
                }

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    description={product.description}
                    price={Number(product.price ?? 0)}
                    imageUrl={product.imageUrl}
                    stock={Number(product.stock ?? 0)}
                    hasVariants={Boolean(product.variants?.length)}
                    variantCount={product.variants?.length ?? 0}
                    variants={product.variants}
                    categoryName={product.category?.name}
                    averageRating={Number(product.averageRating ?? 0)}
                    reviewCount={Number(product.reviewCount ?? 0)}
                    latestReview={product.latestReview}
                    priority={productIndex < 4}
                  />
                );
              })}
            </div>
          )}
          {!loading && products.length > 0 && hasMoreProducts && (
            <div className="mt-7 flex flex-col items-center gap-2">
              {loadMoreError && <p className="text-xs text-rose-300" role="status">{loadMoreError}</p>}
              <button
                type="button"
                onClick={() => void loadMoreProducts()}
                disabled={isLoadingMore}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
              >
                {isLoadingMore ? "Loading products..." : "Load more products"}
                {!isLoadingMore && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </section>

        {/* How To Order Section */}
        <section id="how-to-order" className="scroll-mt-20 rounded-3xl border border-white/10 bg-[#12141c] p-6 sm:p-8 lg:p-10">
          <div className="max-w-xl">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
              Easy Pickup Process
            </span>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              How Ordering Works
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-400">
              Browse authentic local goods, reserve in advance, and pick up your package at our Luna store.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-6">
            {[
              {
                step: "01",
                title: "Browse & Select",
                desc: "Explore handcrafted delicacies, native weaves, and souvenirs from local Apayao producers.",
              },
              {
                step: "02",
                title: "Reserve Your Order",
                desc: "Add items to your cart, set your preferred pickup date, and select cash or digital payment.",
              },
              {
                step: "03",
                title: "Pick Up In-Store",
                desc: "Visit our store in Luna, present your reservation details, and collect your freshly prepared items.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-white/10 bg-[#181b24]/60 p-5 sm:p-6 transition hover:border-white/20"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black tracking-tight text-[#ff8a1e]">
                    {item.step}
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Step
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{item.title}</h3>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Customer Support & Location Section */}
        <section id="contact-us" className="scroll-mt-20 rounded-3xl border border-white/10 bg-[#12141c] p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
                Support & Location
              </span>
              <h3 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Need Help or Visiting Us?
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              We typically reply within 1 business day.
            </p>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.1fr] items-start">
            {/* Contact Channels */}
            <div className="space-y-3">
              <a
                href="mailto:info@apayao-pasalubong.com"
                className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-[#181b24]/60 p-4 transition hover:border-white/20 hover:bg-[#181b24]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-500/10 text-orange-300">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Inquiries</div>
                  <div className="text-sm font-semibold text-white group-hover:text-[#ffb36f] transition-colors">
                    info@apayao-pasalubong.com
                  </div>
                </div>
              </a>

              <a
                href="https://www.facebook.com/apayaopasalubong"
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-[#181b24]/60 p-4 transition hover:border-white/20 hover:bg-[#181b24]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Official Facebook</div>
                  <div className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                    @apayaopasalubong
                  </div>
                </div>
              </a>

              <a
                href="tel:+639171234567"
                className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-[#181b24]/60 p-4 transition hover:border-white/20 hover:bg-[#181b24]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Hotline</div>
                  <div className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                    0917 123 4567
                  </div>
                </div>
              </a>

              <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/2 p-4 text-xs text-slate-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8a1e]" />
                <p>
                  Apayao Pasalubong Center, San Isidro Sur, Luna, Apayao. Visit our shop during standard operating hours for reservation collections and product availability inquiries.
                </p>
              </div>
            </div>

            {/* Google Maps Embed */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#181b24] shadow-md">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs font-semibold text-slate-300">
                <MapPin className="h-4 w-4 text-[#ff8a1e]" />
                <span>Store Location Map</span>
              </div>
              <iframe
                title="Apayao Pasalubong Center location"
                src="https://www.google.com/maps?q=Apayao%20Pasalubong%20Center%20Luna%20Apayao&z=14&output=embed"
                className="h-72 w-full border-0 sm:h-80"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="pt-1 text-sm text-slate-200 lg:col-start-2">
              <span className="font-semibold text-[#ffb36f]">Store hours:</span> Open daily, 7:00 AM - 8:30 PM.
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 pt-10 text-slate-300">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <div className="text-sm font-bold text-white tracking-wide uppercase">
                Apayao Pasalubong Center
              </div>
              <p className="mt-2.5 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md">
                Empowering local Apayao farmers, weavers, and small businesses by providing a premier digital reservation and pickup hub for authentic provincial goods.
              </p>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">Quick Actions</div>
              <ul className="mt-3 space-y-2 text-xs">
                <li><a href="#catalog" className="transition hover:text-[#ff8a1e]">Store Catalog</a></li>
                <li><a href="#how-to-order" className="transition hover:text-[#ff8a1e]">How Ordering Works</a></li>
                <li><a href="#contact-us" className="transition hover:text-[#ff8a1e]">Customer Support</a></li>
                <li><Link href="/orders" className="transition hover:text-[#ff8a1e]">My Orders</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">Policies</div>
              <ul className="mt-3 space-y-2 text-xs">
                <li><Link href="/terms?from=store" className="text-white transition-colors hover:text-[#ff8a1e]">Terms & Conditions</Link></li>
                <li><Link href="/privacy?from=store" className="text-white transition-colors hover:text-[#ff8a1e]">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div>© {new Date().getFullYear()} Apayao Pasalubong Center.</div>
            <div className="text-[11px] text-slate-400">Store pickup reserve system</div>
          </div>
        </footer>

      </div>
    </main>
  );
}

export default function EcommerceHomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0a0d14] px-4 py-8">
          <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-[#12141c] p-12 text-center text-slate-400 animate-pulse">
            <div className="mx-auto h-4 w-40 rounded bg-white/10" />
          </div>
        </main>
      }
    >
      <EcommerceHomeContent />
    </Suspense>
  );
}
