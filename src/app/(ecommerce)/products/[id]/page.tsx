"use client";

import Image from "@/components/safe-image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Heart,
  Minus,
  PackageSearch,
  Plus,
  ShoppingBag,
  Star,
  Tag,
  TimerReset,
  Upload,
  X,
} from "lucide-react";
import { addToCart, getStoredUser } from "@/features/cart/lib/cart";
import { getPrimaryImageUrl, parseImageUrls } from "@/features/catalog/utils/product-images";
import { isFavoriteProduct, recordRecentlyViewed, toggleFavoriteProduct } from "@/features/catalog/lib/favorites";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/client-fetch";

const formatReviewDate = (value: string) => {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  type ProductType = {
    id?: string;
    name?: string;
    sku?: string;
    description?: string | null;
    imageUrl?: string | null;
    price?: number | string;
    stock?: number;
    optionType?: string | null;
    optionValues?: string | null;
    averageRating?: number | string;
    reviewCount?: number;
    category?: { id?: string; name?: string } | null;
    productGroup?: {
      optionType?: string;
      optionName?: string;
      unit?: string;
      items?: Array<{
        optionValue: string;
        productId?: string;
        inventoryProductId?: string;
        sortOrder?: number;
        inventoryProduct?: {
          id?: string;
          name?: string;
          sku?: string;
          price?: number | string;
          stock?: number | string;
          imageUrl?: string | null;
        };
      }>;
    } | null;
    variants?: Array<{
      id: string;
      sku: string;
      attributes?: Record<string, string>;
      measurementValue?: number | null;
      measurementUnit?: string | null;
      color?: string | null;
      price: number;
      stock: number;
      minStock: number;
      imageUrls?: string[] | null;
    }>;
  };

  type VariantType = {
    id: string;
    sku: string;
    attributes?: Record<string, string>;
    measurementValue?: number | null;
    measurementUnit?: string | null;
    color?: string | null;
    price: number;
    stock: number;
    minStock: number;
    imageUrls?: string[] | null;
  };

  const [product, setProduct] = useState<ProductType | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [lookupMessage, setLookupMessage] = useState("");
  const isTimeoutLookup = lookupMessage.toLowerCase().includes("timed out");
  const [reviews, setReviews] = useState<
    Array<{
      id: string;
      rating: number;
      comment: string | null;
      imageUrls?: string[] | null;
      optionValue?: string | null;
      createdAt: string;
      user: { name: string; imageUrl: string | null };
    }>
  >([]);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<number, number>>({});
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [reviewPagination, setReviewPagination] = useState({ page: 1, limit: 10, totalCount: 0, totalPages: 1 });
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<"all" | number | "with-images">("all");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<ProductType[]>([]);
  const [selectedOptionValue, setSelectedOptionValue] = useState("");
  const [pageQuantity, setPageQuantity] = useState(1);
  const [, setModalMessage] = useState("");
  const [addedToast, setAddedToast] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [, setShowOptionsModal] = useState(false);
  const [reviewOptionValue, setReviewOptionValue] = useState("all");
  const [isFavorite, setIsFavorite] = useState(false);
  const [groupedOptionItems, setGroupedOptionItems] = useState<
    Array<{
      optionValue: string;
      assignedProductId: string;
      name: string;
      description?: string | null;
      imageUrl?: string | null;
      price: number;
      stock: number;
      sku: string;
      averageRating?: number;
      reviewCount?: number;
      sortOrder?: number;
    }>
  >([]);

  const getVariantLabel = (variant: VariantType) => {
    const attributeDetails = Object.entries(variant.attributes ?? {}).filter(([, value]) => Boolean(value));
    if (attributeDetails.length > 0) {
      return attributeDetails.map(([name, value]) => `${name}: ${value}`).join(" • ");
    }

    const attributes = Object.entries(variant.attributes ?? {}).filter(([, value]) => Boolean(value));
    if (attributes.length) return attributes.map(([name, value]) => `${name}: ${value}`).join(" • ");
    const parts: string[] = [];

    if (variant.color) {
      parts.push(variant.color);
    }

    if (variant.measurementValue != null) {
      parts.push(`${variant.measurementValue} ${variant.measurementUnit ?? ""}`.trim());
    }

    return parts.length ? parts.join(" · ") : "Variant";
  };

  const formatOptionLabel = (value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  function toggleProductFavorite() {
    if (!product?.id) return;
    setIsFavorite(
      toggleFavoriteProduct({
        id: product.id,
        name: product.name ?? "Product",
        imageUrl: getPrimaryImageUrl(product.imageUrl),
        price: Number(product.price ?? 0),
      }),
    );
  }

  useEffect(() => {
    const hashTarget = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";

    const scrollToTarget = () => {
      const element = document.getElementById(hashTarget);
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (hashTarget) {
      requestAnimationFrame(scrollToTarget);
    }

    async function loadProduct() {
      try {
        const productId = typeof params.id === "string" && params.id !== "undefined" ? params.id : "";

        if (!productId) {
          setLookupMessage(
            "This item could not be loaded from the catalog right now. You can still return to your completed orders and review your purchase history.",
          );
          setProduct(null);
          setSelectedImage(null);
          setRelatedProducts([]);
          return;
        }

        const response = await fetchWithTimeout(
          `/api/public/products?id=${encodeURIComponent(productId)}`,
          { cache: "no-store" },
          15000,
        );
        const data = await response.json();

        const productPayload = data?.product ?? null;

        if (
          !response.ok ||
          !data?.success ||
          !productPayload ||
          typeof productPayload !== "object" ||
          !("id" in productPayload)
        ) {
          setLookupMessage(
            "This item could not be loaded from the catalog right now. You can still return to your completed orders and review your purchase history.",
          );
          setProduct(null);
          setSelectedImage(null);
          setRelatedProducts([]);
        } else {
          setLookupMessage("");
          setProduct(productPayload);
          const viewedProduct = {
            id: String(productPayload.id),
            name: String(productPayload.name ?? "Product"),
            imageUrl: getPrimaryImageUrl(productPayload.imageUrl),
            price: Number(productPayload.price ?? 0),
          };
          recordRecentlyViewed(viewedProduct);
          setIsFavorite(isFavoriteProduct(viewedProduct.id));
          const preferredVariant =
            Array.isArray(productPayload.variants) && productPayload.variants.length > 0
              ? productPayload.variants.find(
                  (variant: { stock?: number | string; id?: string; imageUrls?: string[] | null }) =>
                    Number(variant.stock ?? 0) > 0,
                ) ?? productPayload.variants[0]
              : null;
          const preferredVariantId = preferredVariant?.id ?? "";
          setSelectedVariantId(preferredVariantId);
          setSelectedOptionValue("");
          setReviewOptionValue("all");
          setSelectedImage(
            preferredVariant?.imageUrls?.[0] ? getPrimaryImageUrl(preferredVariant.imageUrls[0]) ?? null : null,
          );

          const legacyOptionItems =
            productPayload.productGroup?.items?.map(
              (item: {
                optionValue: string;
                productId?: string;
                inventoryProductId?: string;
                sortOrder?: number;
                inventoryProduct?: ProductType;
              }) => ({
                optionValue: item.optionValue,
                assignedProductId: item.inventoryProduct?.id ?? item.inventoryProductId ?? item.productId ?? "",
                sortOrder: item.sortOrder ?? 0,
                inventoryProduct: item.inventoryProduct,
              }),
            ) ?? [];
          let adminOptionItems: Array<{
            optionValue: string;
            assignedProductId: string;
            sortOrder?: number;
            isParentOption?: boolean;
          }> = [];

          try {
            const parsed = JSON.parse(String(productPayload.optionValues ?? "[]"));
            if (Array.isArray(parsed)) {
              adminOptionItems = parsed
                .filter(
                  (
                    item,
                  ): item is {
                    optionValue?: string;
                    assignedProductId?: string;
                    isParentOption?: boolean;
                    sortOrder?: number;
                  } => !!item && typeof item === "object",
                )
                .map((item) => ({
                  optionValue: item.optionValue ?? "",
                  assignedProductId: item.assignedProductId ?? "",
                  sortOrder: item.sortOrder ?? 0,
                  isParentOption: item.isParentOption === true,
                }));
            }
          } catch {
            adminOptionItems = [];
          }

          const configuredOptionItems = [...adminOptionItems, ...legacyOptionItems].filter(
            (item, index, items) =>
              item.optionValue.trim() &&
              item.assignedProductId &&
              items.findIndex(
                (candidate) =>
                  candidate.assignedProductId === item.assignedProductId &&
                  candidate.optionValue === item.optionValue,
              ) === index,
          );

          if (configuredOptionItems.length > 0) {
            try {
              const optionItems = (
                await Promise.all(
                  configuredOptionItems.map(
                    async (item: {
                      optionValue: string;
                      assignedProductId: string;
                      sortOrder?: number;
                      isParentOption?: boolean;
                      inventoryProduct?: ProductType;
                    }) => {
                      const assignedProductId = String(item.assignedProductId);
                      if (!assignedProductId || !item.optionValue.trim()) return null;

                      let inventoryProduct =
                        assignedProductId === String(productPayload.id)
                          ? productPayload
                          : item.inventoryProduct;
                      if (!inventoryProduct) {
                        const response = await fetch(
                          `/api/public/products?id=${encodeURIComponent(assignedProductId)}`,
                          { cache: "no-store" },
                        );
                        const data = await response.json();
                        inventoryProduct = response.ok ? data?.product : null;
                      }

                      if (!inventoryProduct) return null;

                      return {
                        optionValue: item.optionValue.trim(),
                        assignedProductId,
                        name: String(inventoryProduct.name ?? "Product"),
                        description: inventoryProduct.description ?? null,
                        imageUrl: inventoryProduct.imageUrl ?? null,
                        price: Number(inventoryProduct.price ?? 0),
                        stock: Number(inventoryProduct.stock ?? 0),
                        sku: String(inventoryProduct.sku ?? ""),
                        averageRating: Number(inventoryProduct.averageRating ?? 0),
                        reviewCount: Number(inventoryProduct.reviewCount ?? 0),
                        sortOrder: item.sortOrder ?? 0,
                      };
                    },
                  ),
                )
              )
                .filter((item): item is NonNullable<typeof item> => item !== null)
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

              setGroupedOptionItems(optionItems);
              setSelectedOptionValue(optionItems[0]?.optionValue ?? "");
            } catch {
              setGroupedOptionItems([]);
            }
          } else {
            setGroupedOptionItems([]);
          }

          try {
            const relatedResponse = await fetch(`/api/public/products?limit=12`, { cache: "no-store" });
            const relatedData = await relatedResponse.json();

            if (relatedResponse.ok && relatedData?.success) {
              const catalogProducts = Array.isArray(relatedData.products) ? relatedData.products : [];
              const currentId = String(productPayload.id ?? "");
              const currentCategoryId = String(productPayload.category?.id ?? "");
              const filteredProducts = catalogProducts.filter(
                (item: ProductType) => String(item.id ?? "") !== currentId && Number(item.stock ?? 0) > 0,
              );
              const sameCategory = filteredProducts.filter(
                (item: ProductType) => String(item.category?.id ?? "") === currentCategoryId,
              );
              const fallbackProducts = filteredProducts.filter(
                (item: ProductType) => String(item.category?.id ?? "") !== currentCategoryId,
              );
              const nextProducts =
                sameCategory.length >= 4
                  ? sameCategory.slice(0, 4)
                  : [...sameCategory, ...fallbackProducts].slice(0, 4);

              setRelatedProducts(nextProducts);
            }
          } catch {
            setRelatedProducts([]);
          }
        }
      } catch (error) {
        setProduct(null);
        setSelectedImage(null);
        setRelatedProducts([]);
        setLookupMessage(
          error instanceof RequestTimeoutError
            ? "Connection timed out while loading this product. Please refresh and try again."
            : "This item could not be loaded from the catalog right now. You can still return to your completed orders and review your purchase history.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProduct();
  }, [params.id]);

  const selectedGroupItem = groupedOptionItems.find((item) => item.optionValue === selectedOptionValue) ?? null;
  const selectedReviewGroupItem =
    groupedOptionItems.find((item) => item.optionValue === reviewOptionValue) ?? null;
  const reviewTargetId = selectedReviewGroupItem?.assignedProductId ?? product?.id ?? "";
  const selectedVariant = product?.variants?.find((variant) => variant.id === selectedVariantId);
  const variantOptionGroups = Array.from(
    new Set((product?.variants ?? []).flatMap((variant) => Object.keys(variant.attributes ?? {}))),
  ).map((attributeName) => ({
    name: attributeName,
    values: Array.from(
      new Set(
        (product?.variants ?? [])
          .map((variant) => variant.attributes?.[attributeName])
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  }));
  const selectedGroupImage = getPrimaryImageUrl(selectedGroupItem?.imageUrl as string | undefined);
  const selectedVariantImage = selectedVariant?.imageUrls?.[0]
    ? getPrimaryImageUrl(selectedVariant.imageUrls[0])
    : null;
  const primaryImage = getPrimaryImageUrl(product?.imageUrl as string | undefined);
  const displayedImage =
    selectedImage || selectedVariantImage || selectedGroupImage || primaryImage || "/logo/apc-logo.png";

  const effectivePrice = selectedGroupItem?.price ?? selectedVariant?.price ?? Number(product?.price ?? 0);
  const effectiveStock = selectedGroupItem?.stock ?? selectedVariant?.stock ?? Number(product?.stock ?? 0);
  const effectiveSku = selectedGroupItem?.sku ?? selectedVariant?.sku ?? product?.sku ?? "N/A";
  const isVariantRequired = Boolean(product?.variants?.length);
  const averageRounded = Math.round(averageRating);

  const galleryImages = selectedVariant?.imageUrls?.length
    ? selectedVariant.imageUrls.map((url) => getPrimaryImageUrl(url)).filter((url): url is string => Boolean(url))
    : selectedGroupImage
    ? [selectedGroupImage]
    : parseImageUrls(product?.imageUrl);

  const displayProduct = selectedGroupItem
    ? {
        id: selectedGroupItem.assignedProductId,
        name: selectedGroupItem.name,
        sku: selectedGroupItem.sku,
        description: selectedGroupItem.description ?? product?.description,
        imageUrl: selectedGroupItem.imageUrl ?? product?.imageUrl,
        price: selectedGroupItem.price,
        stock: selectedGroupItem.stock,
        category: product?.category,
      }
    : selectedVariant
    ? {
        id: product?.id,
        name: product?.name,
        sku: selectedVariant.sku,
        description: product?.description,
        imageUrl: product?.imageUrl,
        price: selectedVariant.price,
        stock: selectedVariant.stock,
        category: product?.category,
      }
    : null;

  function addVariantSelection(variant: VariantType, action: "cart" | "buy" = "cart", customQuantity = 1) {
    if (!product?.id || Number(variant.stock) <= 0) return;
    if (!getStoredUser()) {
      router.push("/register");
      return;
    }

    addToCart({
      id: product.id,
      variantId: variant.id,
      variantSku: variant.sku,
      variantLabel: getVariantLabel(variant),
      variantAttributes: variant.attributes,
      name: product.name ?? "",
      price: Number(variant.price),
      stock: Number(variant.stock),
      quantity: customQuantity,
      imageUrl: getPrimaryImageUrl(variant.imageUrls?.[0] ?? product.imageUrl ?? undefined) ?? undefined,
    });
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("apc-cart-toss"));
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2000);
    if (action === "buy") router.push("/checkout");
  }

  useEffect(() => {
    if (!reviewTargetId) {
      return;
    }

    let isCurrent = true;

    async function loadSelectedProductReviews() {
      setIsLoadingReviews(true);
      try {
        const query = new URLSearchParams({
          id: reviewTargetId,
          page: String(reviewPage),
          limit: "10",
        });
        if (typeof reviewFilter === "number") query.set("rating", String(reviewFilter));
        if (reviewOptionValue !== "all") query.set("optionValue", reviewOptionValue);
        const response = await fetch(
          `/api/public/products/reviews?${query.toString()}`,
          { cache: "no-store" },
        );
        const data = await response.json();

        if (!response.ok || !data?.success) {
          if (isCurrent) {
            setReviews([]);
            setAverageRating(0);
            setReviewCount(0);
            setRatingCounts({});
            setReviewPagination({ page: 1, limit: 10, totalCount: 0, totalPages: 1 });
            setCanReview(false);
          }
          return;
        }

        if (isCurrent) {
          setReviews(data.reviews ?? []);
          setAverageRating(data.averageRating ?? 0);
          setReviewCount(data.reviewCount ?? 0);
          setRatingCounts(data.ratingCounts ?? {});
          setReviewPagination(data.pagination ?? { page: 1, limit: 10, totalCount: 0, totalPages: 1 });
          setCanReview(Boolean(data.canReview));
        }
      } catch {
        if (isCurrent) {
          setReviews([]);
          setAverageRating(0);
          setReviewCount(0);
          setRatingCounts({});
          setReviewPagination({ page: 1, limit: 10, totalCount: 0, totalPages: 1 });
          setCanReview(false);
        }
      } finally {
        if (isCurrent) setIsLoadingReviews(false);
      }
    }

    void loadSelectedProductReviews();
    return () => {
      isCurrent = false;
    };
  }, [product?.id, reviewFilter, reviewOptionValue, reviewPage, reviewRefreshKey, reviewTargetId]);

  const filteredReviews = reviews.filter((review) => {
    if (reviewOptionValue !== "all" && review.optionValue !== reviewOptionValue) {
      return false;
    }

    if (reviewFilter === "with-images") {
      return Boolean(review.imageUrls && review.imageUrls.length > 0);
    }

    if (typeof reviewFilter === "number") {
      return review.rating === reviewFilter;
    }

    return true;
  });

  const ratingBreakdown = Array.from({ length: 5 }, (_, index) => {
    const star = 5 - index; // Show 5 star at top down to 1 star
    const count = ratingCounts[star] ?? 0;
    const percent = reviewCount ? Math.round((count / reviewCount) * 100) : 0;

    return { star, count, percent };
  });

  const renderStars = (value: number, sizeClass = "h-4 w-4") => (
    <div className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={`${value}-${index}`}
          className={`${sizeClass} ${index < value ? "fill-amber-400 text-amber-400" : "text-slate-600"}`}
        />
      ))}
    </div>
  );

  function addSelectedGroupItem(action: "cart" | "buy", customQuantity = 1) {
    if (!selectedGroupItem || selectedGroupItem.stock <= 0) {
      setModalMessage("Please choose an option that is in stock.");
      return;
    }

    addToCart({
      id: selectedGroupItem.assignedProductId,
      name: selectedGroupItem.name,
      price: selectedGroupItem.price,
      stock: selectedGroupItem.stock,
      quantity: customQuantity,
      imageUrl: getPrimaryImageUrl(selectedGroupItem.imageUrl as string | undefined) ?? undefined,
      variantSku: selectedGroupItem.sku,
      variantLabel: selectedGroupItem.optionValue,
    });

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("apc-cart-toss"));
    setShowOptionsModal(false);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2000);

    if (action === "buy") {
      router.push("/checkout");
    }
  }

  function handleMainAction(action: "cart" | "buy") {
    if (!getStoredUser()) {
      router.push("/register");
      return;
    }

    const activeProductId = displayProduct?.id ?? product?.id;
    const activeProductName = displayProduct?.name ?? product?.name ?? "";
    const activeProductImage = displayProduct?.imageUrl ?? product?.imageUrl;
    const activeProductPrice = Number(displayProduct?.price ?? product?.price ?? 0);
    const activeProductStock = Number(displayProduct?.stock ?? product?.stock ?? 0);

    if (selectedVariant) {
      addVariantSelection(selectedVariant, action, pageQuantity);
      return;
    }

    if (selectedGroupItem) {
      addSelectedGroupItem(action, pageQuantity);
      return;
    }

    if (groupedOptionItems.length > 0) {
      setModalMessage("");
      setShowOptionsModal(true);
      return;
    }

    if (!isVariantRequired && activeProductId) {
      addToCart({
        id: activeProductId,
        name: activeProductName,
        price: activeProductPrice,
        stock: activeProductStock,
        quantity: pageQuantity,
        imageUrl: getPrimaryImageUrl(activeProductImage as string | undefined) ?? undefined,
      });

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("apc-cart-toss"));
      setAddedToast(true);
      setTimeout(() => setAddedToast(false), 2000);

      if (action === "buy") {
        router.push("/checkout");
      }
      return;
    }

    if (product?.variants?.length && !selectedVariantId) {
      const initialVariant =
        product.variants.find((variant) => Number(variant.stock) > 0) ?? product.variants[0];
      setSelectedVariantId(initialVariant?.id ?? "");
    }

  }

  async function handleReviewImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    const nextImages = [...reviewImages];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        continue;
      }

      if (nextImages.length >= 5) {
        break;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(typeof reader.result === "string" ? reader.result : "");
        };
        reader.onerror = () => reject(new Error("Failed to read selected image."));
        reader.readAsDataURL(file);
      });

      nextImages.push(dataUrl);
    }

    setReviewImages(nextImages.slice(0, 5));
    event.target.value = "";
  }

  async function submitReview() {
    if (!reviewTargetId) {
      return;
    }

    if (!getStoredUser()) {
      router.push("/register");
      return;
    }

    setIsSubmittingReview(true);
    setReviewMessage("");

    try {
      const response = await fetch("/api/public/products/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: reviewTargetId,
          rating: ratingValue,
          comment: reviewComment,
          imageUrls: reviewImages,
          optionValue: reviewOptionValue === "all" ? undefined : reviewOptionValue,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setReviewMessage(data.message ?? "Unable to save review.");
        return;
      }

      setReviewComment("");
      setReviewImages([]);
      setRatingValue(5);
      setReviewMessage("✓ Thanks for your review!");
      window.dispatchEvent(new Event("apc-order-review-updated"));
      setReviewPage(1);
      setReviewRefreshKey((value) => value + 1);
    } catch {
      setReviewMessage("Unable to save review.");
    } finally {
      setIsSubmittingReview(false);
    }
  }

  if (loading) {
    return (
      <main className="storefront-page-product min-h-screen bg-[#0a0d14] px-4 py-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-6 w-32 rounded-lg bg-white/10" />
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="aspect-square w-full rounded-2xl bg-[#12141c]" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 rounded-lg bg-white/10" />
              <div className="h-4 w-1/3 rounded-lg bg-white/10" />
              <div className="h-10 w-40 rounded-lg bg-white/10" />
              <div className="h-24 w-full rounded-xl bg-[#12141c]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="storefront-page-product min-h-screen bg-[#0a0d14] px-4 py-16 text-center text-slate-100">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#12141c] p-8 shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
            {isTimeoutLookup ? <TimerReset className="h-6 w-6" /> : <PackageSearch className="h-6 w-6" />}
          </div>
          <h1 className="text-xl font-bold text-white">
            {isTimeoutLookup ? "Connection timed out" : "Product Not Available"}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400">
            {lookupMessage || "This item is no longer available in the store catalog."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {isTimeoutLookup ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
              >
                Retry Now
              </button>
            ) : (
              <Link
                href="/#catalog"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ff8a1e] px-5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316]"
              >
                Browse Catalog
              </Link>
            )}
            <Link
              href="/orders"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              View My Orders
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="storefront-page-product min-h-screen bg-[#0a0d14] text-slate-100 pb-16">
      {/* Cart success */}
      {addedToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-[#12141c] px-4 py-3 text-sm text-white shadow-2xl animate-fadeUp">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span>Added to cart successfully!</span>
          <Link href="/cart" className="ml-2 font-bold text-[#ff8a1e] hover:underline">
            View Cart
          </Link>
        </div>
      )}

      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-10 sm:space-y-12">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Link href="/" className="inline-flex items-center gap-1.5 transition hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Store Catalog</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          <span className="text-slate-200 truncate max-w-50 sm:max-w-none">
            {product.category?.name ?? "Products"}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          <span className="text-slate-400 truncate max-w-37.5 sm:max-w-xs">
            {displayProduct?.name ?? product.name}
          </span>
        </div>

        {/* Product details */}
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-12 items-start">
          
          {/* Gallery */}
          <div className="space-y-3.5">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-[#12141c] shadow-md">
              <Image
                src={displayedImage}
                alt={product.name ?? "Product image"}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>

            {/* Thumbnails */}
            {galleryImages.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => {
                      setActiveGalleryIndex(index);
                      setSelectedImage(image);
                    }}
                    className={`relative h-18 w-18 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl border transition-all ${
                      activeGalleryIndex === index
                        ? "border-[#ff8a1e] ring-2 ring-[#ff8a1e]/30 shadow-md"
                        : "border-white/10 bg-[#12141c] opacity-70 hover:opacity-100 hover:border-white/20"
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`Gallery thumbnail ${index + 1}`}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & actions */}
          <div className="flex flex-col space-y-5">
            {/* Category Pill & SKU */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#ffb36f]">
                {product.category?.name ?? "Local Goods"}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-slate-400">SKU: {effectiveSku}</span>
                <button
                  type="button"
                  onClick={toggleProductFavorite}
                  aria-label={isFavorite ? "Remove product from favorites" : "Save product to favorites"}
                  aria-pressed={isFavorite}
                  className="storefront-favorite inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:scale-105"
                >
                  <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
                </button>
              </div>
            </div>

            {/* 2. Product Name */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
              {displayProduct?.name ?? product.name}
            </h1>

            {/* 3. Rating / Reviews Summary */}
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-0.5 text-amber-400">
                {renderStars(averageRounded, "h-4 w-4")}
              </div>
              <span className="font-bold text-white">{averageRating.toFixed(1)}</span>
              <a
                href="#reviews"
                className="text-xs text-slate-400 hover:text-[#ff8a1e] underline underline-offset-4"
              >
                ({reviewCount} customer reviews)
              </a>
            </div>

            {/* 4. Price & 7. Stock Information */}
            <div className="space-y-2 border-y border-white/10 py-4">
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                ₱{effectivePrice.toFixed(2)}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    effectiveStock > 0
                      ? effectiveStock <= 5
                        ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
                        : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                      : "border-rose-400/30 bg-rose-500/15 text-rose-200"
                  }`}
                >
                  {effectiveStock > 0 ? `${effectiveStock} in stock` : "Out of Stock"}
                </span>
              </div>
            </div>

            {/* 6. Variants / Options Selector */}
            {(groupedOptionItems.length > 0 || variantOptionGroups.length > 0) && (
              <div className="space-y-5 border-t border-white/10 pt-4">
                {groupedOptionItems.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-white/5 bg-[#12141c]/35 p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff8a1e]/10 text-[#ffb36f]">
                          <Tag className="h-3.5 w-3.5" />
                        </span>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          {formatOptionLabel(product.productGroup?.optionType ?? product.optionType ?? "Option")}
                        </label>
                      </div>
                      <span className="text-xs font-semibold text-[#ffb36f]">
                        {selectedOptionValue || "Select an option"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {groupedOptionItems.map((item) => {
                        const isSelected = selectedOptionValue === item.optionValue;
                        const isAvailable = item.stock > 0;

                        return (
                          <button
                            key={item.optionValue}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => {
                              setSelectedOptionValue(item.optionValue);
                              setSelectedImage(item.imageUrl ? getPrimaryImageUrl(item.imageUrl) ?? null : null);
                            }}
                            className={`min-w-20 rounded-lg border px-4 py-2.5 text-xs font-semibold transition ${
                              isSelected
                                ? "border-[#ff8a1e] bg-[#ff8a1e]/15 text-[#ff8a1e] shadow-sm"
                                : "border-white/10 bg-[#12141c] text-slate-300 hover:border-white/20 hover:text-white"
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <span>{item.optionValue}</span>
                            <span className="ml-1.5 text-[10px] text-slate-400">₱{item.price.toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {variantOptionGroups.map((group) => (
                  <div key={group.name} className="space-y-3 rounded-xl border border-white/5 bg-[#12141c]/35 p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff8a1e]/10 text-[#ffb36f]">
                          <Tag className="h-3.5 w-3.5" />
                        </span>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          {formatOptionLabel(group.name)}
                        </label>
                      </div>
                      <span className="text-xs font-semibold text-[#ffb36f]">
                        {selectedVariant?.attributes?.[group.name] ?? `Select ${formatOptionLabel(group.name).toLowerCase()}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {group.values.map((value) => {
                        const matchingVariants = (product?.variants ?? []).filter(
                          (variant) => variant.attributes?.[group.name] === value,
                        );
                        const isAvailable = matchingVariants.some((variant) => variant.stock > 0);
                        const isSelected = selectedVariant?.attributes?.[group.name] === value;

                        return (
                          <button
                            key={`${group.name}-${value}`}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => {
                              const nextVariant = matchingVariants.find((variant) => variant.stock > 0) ?? matchingVariants[0];
                              if (!nextVariant) return;
                              setSelectedVariantId(nextVariant.id);
                              setSelectedImage(
                                nextVariant.imageUrls?.[0]
                                  ? getPrimaryImageUrl(nextVariant.imageUrls[0]) ?? null
                                  : null,
                              );
                            }}
                            className={`min-w-20 rounded-lg border px-4 py-2.5 text-xs font-semibold transition ${
                              isSelected
                                ? "border-[#ff8a1e] bg-[#ff8a1e]/15 text-[#ff8a1e] shadow-sm"
                                : "border-white/10 bg-[#12141c] text-slate-300 hover:border-white/20 hover:text-white"
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 8. Quantity Selector & 9. Main Action Buttons */}
            <div className="space-y-4 border-t border-white/10 pt-5">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quantity</span>
                <div className="flex items-center rounded-xl border border-white/10 bg-[#12141c]">
                  <button
                    type="button"
                    onClick={() => setPageQuantity((q) => Math.max(1, q - 1))}
                    disabled={pageQuantity <= 1}
                    className="flex h-10 w-10 items-center justify-center text-slate-300 transition hover:text-white disabled:opacity-30"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-10 text-center text-sm font-bold text-white">
                    {pageQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPageQuantity((q) => Math.min(effectiveStock || 99, q + 1))}
                    disabled={pageQuantity >= effectiveStock}
                    className="flex h-10 w-10 items-center justify-center text-slate-300 transition hover:text-white disabled:opacity-30"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-slate-400">
                  {effectiveStock > 0 ? `Max ${effectiveStock} units` : "Out of stock"}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleMainAction("cart")}
                  disabled={effectiveStock <= 0}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff8a1e] px-6 text-sm font-bold text-slate-950 transition hover:bg-[#f97316] hover:shadow-[0_8px_24px_rgba(255,138,30,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>Add to Cart</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleMainAction("buy")}
                  disabled={effectiveStock <= 0}
                  className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10 hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Buy Now
                </button>
              </div>

              <div className="storefront-mobile-product-cta fixed inset-x-3 bottom-3 z-30 hidden items-center gap-2 rounded-2xl border border-white/15 bg-[#12141c]/95 p-2 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => handleMainAction("cart")}
                  disabled={effectiveStock <= 0}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff8a1e] px-3 text-xs font-bold text-slate-950 transition hover:bg-[#f97316] disabled:opacity-50"
                >
                  <ShoppingBag className="h-4 w-4" /> Add to cart
                </button>
                <button
                  type="button"
                  onClick={() => handleMainAction("buy")}
                  disabled={effectiveStock <= 0}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
                >
                  Buy now
                </button>
              </div>
            </div>

            {/* 5. Description */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">About this item</h2>
              <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                {displayProduct?.description ?? product.description ?? "Authentic handcrafted product from the province of Apayao."}
              </p>
            </div>

          </div>
        </div>

        {/* Customer Reviews Section */}
        <section id="reviews" className="scroll-mt-24 rounded-3xl border border-white/10 bg-[#12141c] p-6 sm:p-8 lg:p-10 space-y-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
                Verified Buyer Feedback
              </span>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Customer Reviews
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              {renderStars(averageRounded, "h-4 w-4")}
              <span className="text-white font-bold">{averageRating.toFixed(1)} out of 5</span>
              <span className="text-slate-400">({reviewCount} verified)</span>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] items-start">
            {/* Left: Review Breakdown & Write Form */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-[#181b24] p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Rating Breakdown
                </div>
                <div className="space-y-2.5">
                  {ratingBreakdown.map((item) => (
                    <div key={item.star} className="grid grid-cols-[36px_1fr_36px] items-center gap-3 text-xs">
                      <span className="font-semibold text-white">{item.star}★</span>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[#ff8a1e] transition-all duration-500"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                      <span className="text-right text-slate-400">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Write Review Form */}
              <div className="rounded-2xl border border-white/10 bg-[#181b24] p-5">
                <div className="text-sm font-bold text-white mb-2">Write a Review</div>
                {!canReview ? (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Review access is available exclusively to verified customers who have ordered and received this product.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Rating</label>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, index) => {
                          const starNum = index + 1;
                          const active = starNum <= ratingValue;

                          return (
                            <button
                              key={starNum}
                              type="button"
                              onClick={() => setRatingValue(starNum)}
                              className="p-1 transition-transform hover:scale-110"
                              aria-label={`Rate ${starNum} stars`}
                            >
                              <Star
                                className={`h-6 w-6 ${active ? "fill-amber-400 text-amber-400" : "text-slate-600"}`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Your Feedback</label>
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        rows={3}
                        placeholder="What did you like about this local item? Was it fresh and well packaged?"
                        className="w-full rounded-xl border border-white/10 bg-[#12141c] p-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#ff8a1e]/60"
                      />
                    </div>

                    <div>
                      <label className="inline-flex items-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                        <Upload className="h-3.5 w-3.5 text-[#ff8a1e]" />
                        <span>Upload Photos ({reviewImages.length}/5)</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleReviewImageSelection}
                          className="hidden"
                        />
                      </label>
                      {reviewImages.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {reviewImages.map((img, idx) => (
                            <div key={idx} className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/10">
                              <Image src={img} alt="Upload preview" fill sizes="56px" className="object-cover" unoptimized />
                              <button
                                type="button"
                                onClick={() => setReviewImages((imgs) => imgs.filter((_, i) => i !== idx))}
                                className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-rose-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {reviewMessage && (
                      <div className="text-xs font-semibold text-emerald-400">{reviewMessage}</div>
                    )}

                    <button
                      type="button"
                      onClick={() => void submitReview()}
                      disabled={isSubmittingReview}
                      className="w-full rounded-xl bg-[#ff8a1e] py-2.5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316] disabled:opacity-50"
                    >
                      {isSubmittingReview ? "Submitting..." : "Submit Verified Review"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Reviews List & Filter */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs">
                <span className="font-semibold text-slate-300">
                  Showing {reviewPagination.totalCount === 0 ? 0 : (reviewPagination.page - 1) * reviewPagination.limit + 1}–{Math.min(reviewPagination.page * reviewPagination.limit, reviewPagination.totalCount)} of {reviewPagination.totalCount} reviews
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Filter:</span>
                  <select
                    value={String(reviewFilter)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "with-images" || val === "all") {
                        setReviewFilter(val);
                      } else {
                        setReviewFilter(Number(val));
                      }
                      setReviewPage(1);
                    }}
                    className="rounded-lg border border-white/10 bg-[#181b24] px-2.5 py-1 text-xs font-medium text-white outline-none focus:border-[#ff8a1e]/60"
                  >
                    <option value="all">All ratings</option>
                    <option value="5">5 stars only</option>
                    <option value="4">4 stars only</option>
                    <option value="3">3 stars only</option>
                    <option value="2">2 stars only</option>
                    <option value="1">1 star only</option>
                    <option value="with-images">With photos</option>
                  </select>
                </div>
              </div>

              {isLoadingReviews ? (
                <div className="space-y-3.5" aria-label="Loading reviews">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="animate-pulse rounded-2xl border border-white/10 bg-[#181b24] p-4">
                      <div className="h-4 w-32 rounded bg-white/10" />
                      <div className="mt-4 h-3 w-full rounded bg-white/10" />
                      <div className="mt-2 h-3 w-2/3 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
              ) : filteredReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">
                  No customer reviews match your active filter.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredReviews.map((rev) => (
                    <article
                      key={rev.id}
                      className="rounded-2xl border border-white/10 bg-[#181b24] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                            {rev.user.name?.slice(0, 2).toUpperCase() || "CU"}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">{rev.user.name}</div>
                            <div className="text-[10px] text-slate-400">{formatReviewDate(rev.createdAt)}</div>
                          </div>
                        </div>
                        {renderStars(rev.rating, "h-3.5 w-3.5")}
                      </div>

                      {rev.optionValue && (
                        <div className="inline-block rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          Option: {rev.optionValue}
                        </div>
                      )}

                      {rev.comment && (
                        <p className="text-xs leading-relaxed text-slate-200">{rev.comment}</p>
                      )}

                      {rev.imageUrls && rev.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {rev.imageUrls.map((img, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightboxImage(img)}
                              className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 hover:opacity-80 transition"
                            >
                              <Image src={img} alt="Review attachment" fill sizes="56px" className="object-cover" unoptimized />
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {reviewPagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs">
                  <span className="text-slate-400">Page {reviewPagination.page} of {reviewPagination.totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                      disabled={reviewPage <= 1 || isLoadingReviews}
                      className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-200 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewPage((page) => Math.min(reviewPagination.totalPages, page + 1))}
                      disabled={reviewPage >= reviewPagination.totalPages || isLoadingReviews}
                      className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-200 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* You May Also Like Section */}
        {relatedProducts.length > 0 && (
          <section className="space-y-4 border-t border-white/10 pt-10">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#ff8a1e]">
                Related Products
              </span>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
                You May Also Like
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-4 lg:gap-5">
              {relatedProducts.map((item) => {
                const itemImage =
                  getPrimaryImageUrl(item.imageUrl as string | undefined) ||
                  "/logo/apc-logo.png";

                return (
                  <div
                    key={item.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12141c] transition hover:border-[#ff8a1e]/40 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <Link href={`/products/${item.id}`} className="relative aspect-square w-full bg-[#181b24]">
                      <Image
                        src={itemImage}
                        alt={item.name ?? "Related product"}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover transition group-hover:scale-105"
                      />
                    </Link>
                    <div className="flex flex-1 flex-col p-3.5">
                      <Link href={`/products/${item.id}`}>
                        <h3 className="line-clamp-1 text-xs sm:text-sm font-semibold text-white group-hover:text-[#ffb36f] transition-colors">
                          {item.name}
                        </h3>
                      </Link>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="font-bold text-[#ff8a1e]">
                          ₱{Number(item.price ?? 0).toFixed(2)}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${
                            Number(item.stock ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {Number(item.stock ?? 0) > 0 ? `${item.stock} in stock` : "Out of stock"}
                        </span>
                      </div>
                      <div className="mt-auto pt-3">
                        <Link
                          href={`/products/${item.id}`}
                          className="flex h-9 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>

      {/* Lightbox Modal for Review Images */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          data-ecommerce-modal="true"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#12141c] p-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/70 p-2 text-white hover:bg-white/20 transition"
              aria-label="Close image preview"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative h-[70vh] w-[80vw] max-w-3xl">
              <Image src={lightboxImage} alt="Review attachment preview" fill className="object-contain" unoptimized />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
