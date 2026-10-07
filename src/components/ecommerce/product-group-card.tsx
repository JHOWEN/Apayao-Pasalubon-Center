"use client";

import Image from "@/components/safe-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Star, X } from "lucide-react";
import { addToCart, getStoredUser } from "@/features/cart/lib/cart";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";
import { useState } from "react";

interface ProductItem {
  id: string;
  name: string;
  sku: string;
  optionValue?: string;
  description: string | null;
  imageUrl: string | null;
  price: number | string;
  stock: number;
  minStock: number;
  averageRating?: number;
  reviewCount?: number;
  category?: {
    id: string;
    name: string;
  };
}

interface GroupItem {
  id: string;
  optionValue: string;
  sortOrder: number;
  inventoryProduct?: ProductItem;
}

interface ProductGroupProps {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  optionType: string;
  optionName: string | null;
  unit: string | null;
  parentProduct?: ProductItem;
  items: GroupItem[];
  priority?: boolean;
}

export function ProductGroupCard({
  group,
  soldCount = 0,
}: {
  group: ProductGroupProps;
  soldCount?: number;
}) {
  const router = useRouter();
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  const groupId =
    group.id && group.id !== "undefined"
      ? group.id
      : group.parentProduct?.id && group.parentProduct.id !== "undefined"
      ? group.parentProduct.id
      : null;

  const validItems = group.items.filter(
    (item): item is GroupItem & { inventoryProduct: ProductItem } =>
      Boolean(item?.inventoryProduct && item.optionValue?.trim()),
  );

  const optionItems = validItems.filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.inventoryProduct.id === item.inventoryProduct.id &&
          candidate.optionValue === item.optionValue,
      ) === index,
  );

  const selectedProduct = optionItems[0]?.inventoryProduct ?? null;
  const selectedOption =
    optionItems.find((item) => item.inventoryProduct.id === selectedOptionId)?.inventoryProduct ??
    selectedProduct;

  const totalAvailableStock = optionItems.reduce(
    (sum, item) => sum + Number(item.inventoryProduct.stock ?? 0),
    0,
  );

  const selectedImageUrl =
    getPrimaryImageUrl(selectedOption?.imageUrl ?? selectedProduct?.imageUrl ?? group.imageUrl) ||
    "/logo/apc-logo.png";

  function addSelectedProduct() {
    if (!selectedOption || selectedOption.stock <= 0) {
      return;
    }

    if (!getStoredUser()) {
      router.push("/register");
      return;
    }

    addToCart({
      id: selectedOption.id,
      name: selectedOption.name,
      price: Number(selectedOption.price ?? 0),
      imageUrl:
        getPrimaryImageUrl(selectedOption.imageUrl as string | undefined) ??
        getPrimaryImageUrl(selectedProduct?.imageUrl as string | undefined) ??
        undefined,
      stock: Number(selectedOption.stock ?? 0),
      quantity: selectedQuantity,
      variantLabel: optionItems.find((item) => item.inventoryProduct.id === selectedOption.id)?.optionValue,
      variantSku: selectedOption.sku,
    });

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("apc-cart-toss"));
    setIsOptionModalOpen(false);
  }

  function handleAddToCart() {
    if (!selectedProduct || selectedProduct.stock <= 0) return;

    if (optionItems.length > 1) {
      setSelectedOptionId(selectedProduct.id);
      setSelectedQuantity(1);
      setIsOptionModalOpen(true);
      return;
    }

    addSelectedProduct();
  }

  if (!selectedProduct || optionItems.length === 0) {
    return null;
  }

  const imageUrl = selectedImageUrl;
  const isInStock = totalAvailableStock > 0;
  const displayPrice = Number(optionItems[0]?.inventoryProduct.price ?? selectedProduct.price);
  const roundedRating = Math.round(Number(selectedProduct.averageRating ?? 0));

  return (
    <>
      <article
        role="link"
        tabIndex={0}
        onClick={() => groupId && router.push(`/products/${groupId}`)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (groupId) router.push(`/products/${groupId}`);
          }
        }}
        className="group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#12141c] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-[#ff8a1e]"
      >
        {/* Product Group Image */}
        <div className="relative aspect-square w-full overflow-hidden bg-[#181b24]">
          <Image
            src={imageUrl}
            alt={group.name || selectedProduct.name || "Product group"}
            fill
            priority={group.priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(event) => {
              event.currentTarget.src = "/logo/apc-logo.png";
            }}
          />

          {/* Floating Top Badges */}
          <div className="absolute left-2.5 top-2.5 right-2.5 flex items-start justify-between gap-1.5 pointer-events-none">
            <span className="storefront-image-badge max-w-[60%] truncate rounded-md border border-white/10 bg-slate-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-200 backdrop-blur-md">
              {selectedProduct.category?.name ?? "Collection"}
            </span>

            <span
              className={`storefront-status-badge rounded-md border px-2 py-1 text-[10px] font-semibold backdrop-blur-md ${
                isInStock
                  ? totalAvailableStock <= 5
                    ? "border-amber-400/30 bg-amber-500/20 text-amber-200"
                    : "border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
                  : "border-rose-400/30 bg-rose-500/20 text-rose-200"
              }`}
            >
              {isInStock ? (totalAvailableStock <= 5 ? `${totalAvailableStock} left` : `${totalAvailableStock} in stock`) : "Sold out"}
            </span>
          </div>

          {!isInStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
              <span className="rounded-lg border border-white/10 bg-[#12141c]/90 px-3 py-1.5 text-xs font-bold text-white shadow-md">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        {/* Product Group Info */}
        <div className="flex flex-1 flex-col p-3.5 sm:p-4">
          <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-white transition-colors group-hover:text-[#ffb36f] sm:text-base leading-snug">
            {group.name}
          </h3>

          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
            {selectedProduct.description ?? "Quality handcrafted product from Apayao."}
          </p>

          {/* Rating */}
          <div className="mt-2.5 flex items-center gap-1.5 text-xs">
            <div className="flex items-center gap-0.5 text-[#ff8a1e]">
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={`${selectedProduct.id}-rating-${index}`}
                  className={`h-3 w-3 ${
                    index < roundedRating ? "fill-[#ff8a1e] text-[#ff8a1e]" : "text-slate-600"
                  }`}
                />
              ))}
            </div>
            <span className="font-semibold text-slate-200">
              {Number(selectedProduct.averageRating ?? 0).toFixed(1)}
            </span>
            <span className="text-slate-400 text-[11px]">
              ({Number(selectedProduct.reviewCount ?? 0)})
            </span>
            <span className="ml-auto text-[11px] font-medium text-slate-400">
              {soldCount > 0 ? `${soldCount} sold` : "New"}
            </span>
          </div>

          {/* Price & Stocks Badge */}
          <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-bold text-white sm:text-lg">
              ₱{displayPrice.toFixed(2)}
            </span>

            {/* Stocks Badge visible on catalog */}
            <span
              className={`inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:w-auto sm:py-0.5 ${
                isInStock
                  ? totalAvailableStock <= 5
                    ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                    : "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                  : "border-rose-400/30 bg-rose-500/15 text-rose-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isInStock
                    ? totalAvailableStock <= 5
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                    : "bg-rose-400"
                }`}
              />
              {isInStock
                ? totalAvailableStock <= 5
                  ? `${totalAvailableStock} left`
                  : `${totalAvailableStock} in stock`
                : "Out of stock"}
            </span>
          </div>

          {/* Options / Variants - separated from the price */}
          {optionItems.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#ff8a1e]/30 bg-[#ff8a1e]/10 px-2 py-0.5 text-[10px] font-medium text-[#ffb36f]">
                {optionItems.length} {optionItems.length === 1 ? "option" : "options"} available
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-auto pt-3.5">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={groupId ? `/products/${groupId}` : "/"}
                onClick={(event) => event.stopPropagation()}
                className="flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2 text-center text-xs font-semibold text-slate-200 transition-colors hover:border-[#ff8a1e]/50 hover:bg-[#ff8a1e]/10 hover:text-[#ffb36f]"
              >
                Details
              </Link>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleAddToCart();
                }}
                disabled={!isInStock}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ff8a1e] px-2 text-center text-xs font-bold text-slate-950 transition hover:bg-[#f97316] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Option Selection Modal (Fixed Dark Theme) */}
      {isOptionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setIsOptionModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="choose-group-option-title"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12141c] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#ff8a1e]">
                  Select {group.optionType || "Option"}
                </p>
                <h2 id="choose-group-option-title" className="mt-0.5 text-base font-semibold text-white truncate max-w-75">
                  {group.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOptionModalOpen(false)}
                aria-label="Close option modal"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-4 space-y-4">
              {selectedOption && (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#181b24] p-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#242834]">
                    <Image
                      src={
                        getPrimaryImageUrl(selectedOption.imageUrl) ||
                        getPrimaryImageUrl(selectedProduct.imageUrl) ||
                        "/logo/apc-logo.png"
                      }
                      alt={selectedOption.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">{selectedOption.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">SKU: {selectedOption.sku}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="font-bold text-[#ff8a1e]">₱{Number(selectedOption.price).toFixed(2)}</span>
                      <span className={selectedOption.stock > 0 ? "text-emerald-400" : "text-rose-400"}>
                        {selectedOption.stock > 0 ? `${selectedOption.stock} available` : "Out of stock"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Options Grid (Consistent Dark Palette) */}
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Available Choices
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {optionItems.map((item, index) => {
                    const optionProduct = item.inventoryProduct;
                    const isSelected = optionProduct.id === selectedOption?.id;
                    const isItemInStock = optionProduct.stock > 0;

                    return (
                      <button
                        key={`${optionProduct.id}-${item.optionValue}-${index}`}
                        type="button"
                        disabled={!isItemInStock}
                        onClick={() => {
                          setSelectedOptionId(optionProduct.id);
                          setSelectedQuantity(1);
                        }}
                        className={`rounded-xl border p-2.5 text-left transition ${
                          isSelected
                            ? "border-[#ff8a1e] bg-[#ff8a1e]/15 shadow-sm"
                            : "border-white/10 bg-[#181b24] hover:border-white/25"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        <span className="block truncate text-xs font-semibold text-white">
                          {item.optionValue}
                        </span>
                        <span className={`mt-0.5 block text-[10px] ${isItemInStock ? "text-emerald-400" : "text-rose-400"}`}>
                          {isItemInStock ? `${optionProduct.stock} left` : "Out of stock"}
                        </span>
                        <span className="mt-1 block text-xs font-bold text-slate-200">
                          ₱{Number(optionProduct.price).toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity Stepper */}
              {selectedOption && (
                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                  <div>
                    <span className="text-xs font-medium text-white">Quantity</span>
                    <span className="block text-[10px] text-slate-400">Max {selectedOption.stock} units</span>
                  </div>
                  <div className="flex items-center rounded-xl border border-white/10 bg-[#181b24]">
                    <button
                      type="button"
                      onClick={() => setSelectedQuantity((q) => Math.max(1, q - 1))}
                      disabled={selectedQuantity <= 1}
                      className="flex h-9 w-9 items-center justify-center text-slate-300 transition hover:text-white disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-8 text-center text-xs font-bold text-white">
                      {selectedQuantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedQuantity((q) => Math.min(selectedOption.stock, q + 1))}
                      disabled={selectedQuantity >= selectedOption.stock}
                      className="flex h-9 w-9 items-center justify-center text-slate-300 transition hover:text-white disabled:opacity-30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 p-4">
              <button
                type="button"
                onClick={addSelectedProduct}
                disabled={!selectedOption || selectedOption.stock <= 0}
                className="w-full rounded-xl bg-[#ff8a1e] py-3 text-xs font-bold text-slate-950 transition hover:bg-[#f97316] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Option to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
