"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { addToCart, getStoredUser } from "@/features/cart/lib/cart";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";

interface ProductCardProps {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  stock?: number;
  categoryName?: string;
  averageRating?: number;
  reviewCount?: number;
  latestReview?: string | null;
  soldCount?: number;
  hasVariants?: boolean;
  variantCount?: number;
  variants?: Array<{
    id: string;
    sku: string;
    price: number;
    stock: number;
    attributes?: Record<string, string>;
    imageUrls?: string[];
  }>;
  priority?: boolean;
}

export function ProductCard({
  id,
  name,
  description,
  price,
  imageUrl,
  stock = 0,
  categoryName,
  averageRating = 0,
  reviewCount = 0,
  soldCount = 0,
  hasVariants = false,
  variantCount = 0,
  variants = [],
  priority = false,
}: ProductCardProps) {
  const router = useRouter();
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState("1");
  const totalAvailableStock = hasVariants
    ? variants.reduce((total, variant) => total + Math.max(0, variant.stock), 0)
    : Math.max(0, stock);
  const isAvailable = totalAvailableStock > 0;
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const primaryImage = getPrimaryImageUrl(imageUrl);
  const selectedVariantImage = getPrimaryImageUrl(selectedVariant?.imageUrls?.[0]);
  const activeVariantImage = selectedVariantImage || primaryImage;
  const variantAttributeName = variants.flatMap((variant) => Object.keys(variant.attributes ?? {}))[0] ?? "";
  const displayPrice = hasVariants && variants[0] ? variants[0].price : price;
  const roundedRating = Math.round(averageRating);

  function getVariantLabel(variant: NonNullable<ProductCardProps["variants"]>[number]) {
    return Object.entries(variant.attributes ?? {})
      .filter(([, value]) => Boolean(value))
      .map(([name, value]) => `${name}: ${value}`)
      .join(" • ") || variant.sku;
  }

  function getVariantOptionValue(variant: NonNullable<ProductCardProps["variants"]>[number]) {
    return variant.attributes?.[variantAttributeName]?.trim() || getVariantLabel(variant);
  }

  const variantOptionValues = Array.from(new Set(variants.map(getVariantOptionValue)));

  function commitQuantity(value: number) {
    const maximumQuantity = Math.max(1, selectedVariant?.stock ?? 1);
    const nextQuantity = Math.min(maximumQuantity, Math.max(1, Math.floor(value)));
    setQuantity(nextQuantity);
    setQuantityInput(String(nextQuantity));
  }

  function addSelectedToCart(goToCheckout = false, includeVariant = true) {
    if (!isAvailable) return;
    if (!getStoredUser()) {
      router.push("/register");
      return;
    }
    addToCart({
      id,
      name,
      price: includeVariant ? selectedVariant?.price ?? price : price,
      imageUrl: selectedVariantImage || primaryImage,
      stock: includeVariant ? selectedVariant?.stock ?? stock : stock,
      quantity,
      variantId: includeVariant ? selectedVariant?.id : undefined,
      variantSku: includeVariant ? selectedVariant?.sku : undefined,
      variantLabel: includeVariant && selectedVariant ? getVariantLabel(selectedVariant) : undefined,
      variantAttributes: includeVariant ? selectedVariant?.attributes : undefined,
    });
    setAdded(true);
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("apc-cart-toss"));
    if (goToCheckout) router.push("/checkout");
    setIsOptionModalOpen(false);
    setQuantity(1);
    setQuantityInput("1");
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <article className="storefront-product-card group flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#12141c] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_8px_20px_rgba(32,39,32,0.09)]">
      {/* Product Image Area */}
      <Link href={`/products/${id}`} className="relative block shrink-0 overflow-hidden bg-[#181b24]">
        <div className="relative aspect-square w-full overflow-hidden">
          <Image
            src={activeVariantImage || "/logo/apc-logo.png"}
            alt={name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        </div>

        {/* Floating Top Badges */}
        <div className="pointer-events-none absolute left-2.5 right-2.5 top-2.5 z-20 flex items-start justify-between gap-1.5">
          {categoryName ? (
            <span className="storefront-image-badge max-w-[60%] truncate rounded-md border border-white/10 bg-slate-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-200 backdrop-blur-md">
              {categoryName}
            </span>
          ) : <span />}

          <span
            className={`storefront-status-badge rounded-md border px-2 py-1 text-[10px] font-semibold backdrop-blur-md ${
              isAvailable
                ? totalAvailableStock <= 5
                  ? "border-amber-300/60 bg-amber-500/85 text-white"
                  : "border-emerald-300/60 bg-emerald-500/85 text-white"
                : "border-rose-300/60 bg-rose-500/85 text-white"
            }`}
          >
            {isAvailable ? (totalAvailableStock <= 5 ? "Limited" : "In Stock") : "Out of Stock"}
          </span>
        </div>

        {hasVariants && (
          <span
            className="storefront-option-badge pointer-events-none absolute bottom-2.5 left-2.5 z-20 inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-bold"
            style={{
              backgroundColor: "var(--storefront-ink)",
              borderColor: "var(--storefront-ink)",
              color: "var(--storefront-canvas)",
            }}
          >
            {variantCount} {variantCount === 1 ? "option" : "options"} available
          </span>
        )}

        {/* Out of Stock Dark Overlay */}
        {!isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
            <span className="rounded-lg border border-white/10 bg-[#12141c]/90 px-3 py-1.5 text-xs font-bold text-white shadow-md">
              Out of Stock
            </span>
          </div>
        )}
      </Link>

      {/* Product Details Body */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        {/* Name */}
        <Link href={`/products/${id}`} className="block">
          <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-white transition-colors group-hover:text-[#ffb36f] sm:text-base leading-snug">
            {name}
          </h3>
        </Link>

        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {description ?? "Authentic local product from Apayao."}
        </p>

        {/* Rating & Sold count */}
        <div className="mt-2.5 flex items-center gap-1.5 text-xs">
          <div className="flex items-center gap-0.5 text-[#ff8a1e]">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={`${id}-${index}`}
                className={`h-3 w-3 ${
                  index < roundedRating ? "fill-[#ff8a1e] text-[#ff8a1e]" : "text-slate-600"
                }`}
              />
            ))}
          </div>
          <span className="font-semibold text-slate-200">{averageRating.toFixed(1)}</span>
          <span className="text-slate-400 text-[11px]">({reviewCount})</span>
          <span className="ml-auto text-[11px] font-medium text-slate-400">
            {soldCount > 0 ? `${soldCount} sold` : "New"}
          </span>
        </div>

        {/* Price & Stocks Badge */}
        <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-base font-bold text-white sm:text-lg">
            ₱{Number(displayPrice).toFixed(2)}
          </span>
          <span className={`inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:w-auto sm:py-0.5 ${
            isAvailable
              ? totalAvailableStock <= 5
                ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                : "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
              : "border-rose-400/30 bg-rose-500/15 text-rose-300"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              isAvailable
                ? totalAvailableStock <= 5 ? "bg-amber-400" : "bg-emerald-400"
                : "bg-rose-400"
            }`} />
            {isAvailable
              ? totalAvailableStock <= 5 ? `${totalAvailableStock} left` : `${totalAvailableStock} in stock`
              : "Out of stock"}
          </span>
        </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => (hasVariants ? setIsOptionModalOpen(true) : addSelectedToCart(true))}
              disabled={!isAvailable}
              aria-label={hasVariants ? `Choose options to buy ${name}` : `Buy ${name} now`}
              className="inline-flex h-10 min-w-0 items-center justify-center rounded-lg border border-[#d9ded6] bg-white px-2 text-xs font-bold text-[#111111] transition hover:border-[#bfc7bd] hover:bg-[#f7f8f5] hover:text-[#111111]"
            >
              Buy now
            </button>
            <button
              type="button"
              onClick={() => (hasVariants ? setIsOptionModalOpen(true) : addSelectedToCart())}
              disabled={!isAvailable}
              aria-label={hasVariants ? `Choose options for ${name}` : `Add ${name} to cart`}
              className="inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg bg-[#ff8a1e] px-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#f97316] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            >
              <ShoppingBag className="hidden h-3.5 w-3.5 sm:block" />
              <span className="whitespace-normal text-center text-[10px] leading-tight sm:hidden">
                {hasVariants ? "Add to Cart" : added ? "Added" : "Add to Cart"}
              </span>
              <span className="hidden sm:inline">
                {hasVariants ? "Add to Cart" : added ? "Added" : "Add to Cart"}
              </span>
            </button>
          </div>

      </div>

      {/* Variant Selection Modal (if triggered) */}
      {isOptionModalOpen && hasVariants && typeof document !== "undefined" && createPortal(
        <div
          className="storefront-variant-modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
          onClick={() => setIsOptionModalOpen(false)}
        >
          <div
            className="storefront-variant-modal-panel w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-[#12141c] shadow-2xl sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
              <span className="storefront-variant-modal-handle h-1 w-10 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 sm:py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#ff8a1e]">Select Variant</p>
                <h3 className="mt-0.5 max-w-70 truncate text-base font-semibold text-white">
                  {name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOptionModalOpen(false)}
                aria-label="Close options"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedVariant && (
              <div className="storefront-variant-modal-summary flex items-center gap-4 border-b border-white/10 bg-[#181b24] p-4">
                <div className="storefront-variant-modal-image relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#242834]">
                  <Image
                    src={selectedVariantImage || primaryImage || "/logo/apc-logo.png"}
                    alt={name}
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{getVariantOptionValue(selectedVariant)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <span className="font-bold text-[#ff8a1e]">₱{selectedVariant.price.toFixed(2)}</span>
                    <span className={selectedVariant.stock > 0 ? "text-emerald-400" : "text-rose-400"}>
                      {selectedVariant.stock > 0 ? `${selectedVariant.stock} available` : "Out of stock"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 p-4">
              <h4 className="text-sm font-semibold text-white">Choose Option</h4>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {variantAttributeName || "Option"}
                </p>
                <div className="storefront-variant-modal-options flex flex-wrap gap-2">
                  {variantOptionValues.map((optionValue) => {
                    const matchingVariants = variants.filter((variant) => getVariantOptionValue(variant) === optionValue);
                    const optionVariant = matchingVariants.find((variant) => variant.stock > 0) ?? matchingVariants[0];
                    const isSelected = selectedVariant ? getVariantOptionValue(selectedVariant) === optionValue : false;
                    const isAvailableOption = matchingVariants.some((variant) => variant.stock > 0);

                    return (
                      <button
                        key={optionValue}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={!isAvailableOption}
                        onClick={() => {
                          if (!optionVariant) return;
                          setSelectedVariantId(optionVariant.id);
                          setQuantity(1);
                          setQuantityInput("1");
                        }}
                        className={`max-w-full shrink-0 whitespace-normal wrap-break-word rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                          isSelected
                            ? "border-[#ff8a1e] bg-[#ff8a1e]/15 text-[#ffb36f]"
                            : "border-white/10 bg-[#181b24] text-slate-200 hover:border-white/25"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {optionValue}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-4">
              <div className="storefront-variant-modal-quantity flex items-center rounded-xl border border-white/10 bg-[#181b24]">
                <button
                  type="button"
                  onClick={() => commitQuantity(quantity - 1)}
                  className="flex h-9 w-9 items-center justify-center text-slate-300 transition hover:text-white"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Quantity"
                  min={1}
                  max={Math.max(1, selectedVariant?.stock ?? 1)}
                  step={1}
                  value={quantityInput}
                  onChange={(event) => {
                    const inputValue = event.currentTarget.value;
                    setQuantityInput(inputValue);
                    const nextQuantity = Number(inputValue);
                    if (inputValue && Number.isFinite(nextQuantity)) {
                      const maximumQuantity = Math.max(1, selectedVariant?.stock ?? 1);
                      setQuantity(Math.min(maximumQuantity, Math.max(1, Math.floor(nextQuantity))));
                    }
                  }}
                  onBlur={() => {
                    const nextQuantity = Number(quantityInput);
                    commitQuantity(quantityInput && Number.isFinite(nextQuantity) ? nextQuantity : 1);
                  }}
                  className="h-9 w-14 appearance-none border-x border-white/10 bg-transparent text-center text-sm font-bold text-white outline-none focus:border-[#ff8a1e]/60"
                />
                <button
                  type="button"
                  onClick={() => commitQuantity(quantity + 1)}
                  className="flex h-9 w-9 items-center justify-center text-slate-300 transition hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => addSelectedToCart(false)}
                disabled={!selectedVariant || selectedVariant.stock <= 0}
                className="flex-1 rounded-xl bg-[#ff8a1e] px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-[#f97316] disabled:opacity-40"
              >
                {added ? "Added!" : "Add to cart"}
              </button>
              <button
                type="button"
                onClick={() => addSelectedToCart(true)}
                disabled={!selectedVariant || selectedVariant.stock <= 0}
                className="flex-1 rounded-xl border border-[#ff8a1e]/60 bg-transparent px-4 py-2.5 text-xs font-bold text-[#ffb36f] transition hover:bg-[#ff8a1e]/10 disabled:opacity-40"
              >
                Buy now
              </button>
            </div>
          </div>
        </div>,
        document.querySelector(".storefront-shell") ?? document.body,
      )}
    </article>
  );
}
