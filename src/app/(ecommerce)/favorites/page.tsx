"use client";

import Image from "@/components/safe-image";
import Link from "next/link";
import { ArrowLeft, Clock3, Heart, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getFavoriteProducts,
  getFavoritesUpdatedEventName,
  getRecentlyViewedProducts,
  toggleFavoriteProduct,
  type FavoriteProduct,
} from "@/features/catalog/lib/favorites";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";

function SavedProductCard({
  product,
  onRemove,
}: {
  product: FavoriteProduct;
  onRemove: (product: FavoriteProduct) => void;
}) {
  return (
    <article className="storefront-product-card group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-[var(--storefront-surface)]">
      <Link href={`/products/${product.id}`} className="relative block aspect-square overflow-hidden bg-[var(--storefront-surface-soft)]">
        <Image
          src={getPrimaryImageUrl(product.imageUrl) || "/logo/apc-logo.png"}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <button
        type="button"
        onClick={() => onRemove(product)}
        aria-label={`Remove ${product.name} from favorites`}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border bg-black/45 text-white backdrop-blur-md transition hover:scale-105"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link href={`/products/${product.id}`} className="line-clamp-2 text-sm font-bold text-[var(--storefront-ink)] transition hover:text-[var(--storefront-accent)]">
          {product.name}
        </Link>
        {typeof product.price === "number" && (
          <span className="text-sm font-bold text-[var(--storefront-accent)]">₱{product.price.toFixed(2)}</span>
        )}
        <Link
          href={`/products/${product.id}`}
          className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--storefront-accent)] px-3 text-xs font-bold text-[var(--storefront-accent-contrast)] transition hover:brightness-95"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          View product
        </Link>
      </div>
    </article>
  );
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<FavoriteProduct[]>([]);

  useEffect(() => {
    const refresh = () => {
      setFavorites(getFavoriteProducts());
      setRecentlyViewed(getRecentlyViewedProducts());
    };

    refresh();
    window.addEventListener(getFavoritesUpdatedEventName(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(getFavoritesUpdatedEventName(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function removeFavorite(product: FavoriteProduct) {
    toggleFavoriteProduct(product);
    setFavorites(getFavoriteProducts());
  }

  return (
    <main className="storefront-subpage min-h-screen pb-20">
      <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--storefront-muted)] transition hover:text-[var(--storefront-accent)]">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to store
            </Link>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--storefront-accent)]">
              <Heart className="h-3.5 w-3.5" /> Saved for later
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[var(--storefront-ink)] sm:text-4xl">Your favorites</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--storefront-muted)]">Keep the products you want to come back to, then add them to your pickup reservation when you are ready.</p>
          </div>
          <span className="text-xs font-semibold text-[var(--storefront-muted)]">{favorites.length} saved item{favorites.length === 1 ? "" : "s"}</span>
        </div>

        {favorites.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {favorites.map((product) => <SavedProductCard key={product.id} product={product} onRemove={removeFavorite} />)}
          </div>
        ) : (
          <section className="rounded-3xl border bg-[var(--storefront-surface)] px-6 py-20 text-center shadow-[var(--storefront-shadow)]">
            <Heart className="mx-auto h-10 w-10 text-[var(--storefront-accent)]" />
            <h2 className="mt-4 text-xl font-bold text-[var(--storefront-ink)]">Nothing saved yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--storefront-muted)]">Tap the heart on any product to keep it close for your next visit.</p>
            <Link href="/#catalog" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[var(--storefront-accent)] px-5 text-sm font-bold text-[var(--storefront-accent-contrast)] transition hover:brightness-95">Browse products</Link>
          </section>
        )}

        {recentlyViewed.length > 0 && (
          <section className="border-t pt-8">
            <div className="flex items-center gap-2 text-[var(--storefront-accent)]">
              <Clock3 className="h-4 w-4" />
              <h2 className="text-sm font-bold uppercase tracking-[0.18em]">Recently viewed</h2>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {recentlyViewed.map((product) => (
                <Link key={product.id} href={`/products/${product.id}`} className="flex w-56 shrink-0 items-center gap-3 rounded-2xl border bg-[var(--storefront-surface)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--storefront-accent)]">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--storefront-surface-soft)]">
                    <Image src={getPrimaryImageUrl(product.imageUrl) || "/logo/apc-logo.png"} alt={product.name} fill sizes="56px" className="object-cover" />
                  </div>
                  <span className="line-clamp-2 text-xs font-bold text-[var(--storefront-ink)]">{product.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
