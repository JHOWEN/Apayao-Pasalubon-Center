export type FavoriteProduct = {
  id: string;
  name: string;
  imageUrl?: string | null;
  price?: number;
};

const FAVORITES_KEY = "apc-favorites";
const FAVORITES_UPDATED_EVENT = "apc-favorites-updated";
const MAX_RECENTLY_VIEWED = 8;

function readFavorites(): FavoriteProduct[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function writeFavorites(items: FavoriteProduct[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(FAVORITES_UPDATED_EVENT));
}

export function getFavoriteProducts() {
  return readFavorites();
}

export function isFavoriteProduct(productId: string) {
  return readFavorites().some((product) => product.id === productId);
}

export function toggleFavoriteProduct(product: FavoriteProduct) {
  const favorites = readFavorites();
  const isAlreadyFavorite = favorites.some((item) => item.id === product.id);
  const nextFavorites = isAlreadyFavorite
    ? favorites.filter((item) => item.id !== product.id)
    : [product, ...favorites].slice(0, 50);

  writeFavorites(nextFavorites);
  return !isAlreadyFavorite;
}

export function getRecentlyViewedProducts() {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem("apc-recently-viewed") ?? "[]");
    return Array.isArray(stored) ? (stored as FavoriteProduct[]) : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(product: FavoriteProduct) {
  if (typeof window === "undefined") return;

  const nextItems = [
    product,
    ...getRecentlyViewedProducts().filter((item) => item.id !== product.id),
  ].slice(0, MAX_RECENTLY_VIEWED);
  window.localStorage.setItem("apc-recently-viewed", JSON.stringify(nextItems));
}

export function getFavoritesUpdatedEventName() {
  return FAVORITES_UPDATED_EVENT;
}
