export type CartItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  stock?: number;
  quantity: number;
  variantId?: string;
  variantSku?: string;
  variantLabel?: string;
  variantAttributes?: Record<string, string>;
};

const CART_KEY = "apc-cart";
const ORDERS_KEY = "apc-orders";

export function getCartItems(): CartItem[] {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as CartItem[];
  } catch {
    return [];
  }
}

export function saveCartItems(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function dispatchStockWarning(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("apc-cart-stock-warning", { detail: { message } }));
}

export function addToCart(product: {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  stock?: number;
  quantity?: number;
  variantId?: string;
  variantSku?: string;
  variantLabel?: string;
  variantAttributes?: Record<string, string>;
}) {
  const items = getCartItems();
  const parsedStock = Number(product.stock ?? 0);
  const stock = Number.isFinite(parsedStock) ? Math.max(0, Math.floor(parsedStock)) : 0;
  const parsedQuantity = Number(product.quantity ?? 1);
  const quantity = Number.isFinite(parsedQuantity) ? Math.max(1, Math.floor(parsedQuantity)) : 1;

  if (stock <= 0) {
    dispatchStockWarning(`${product.name} is out of stock and could not be added.`);
    return items;
  }

  const existing = items.find((item) => {
    const sameProduct = item.productId === product.id;
    const sameVariant = product.variantId
      ? item.variantId === product.variantId
      : !item.variantId;

    return sameProduct && sameVariant;
  });
  const existingQuantity = Math.max(0, Math.floor(Number(existing?.quantity ?? 0)));
  const requestedTotal = existingQuantity + quantity;
  const nextQuantity = Math.min(stock, requestedTotal);

  if (existing) {
    existing.quantity = nextQuantity;
    existing.name = product.name;
    existing.price = Number(product.price ?? 0);
    existing.imageUrl = product.imageUrl ?? null;
    existing.stock = stock;
    existing.variantSku = product.variantSku;
    existing.variantLabel = product.variantLabel;
    existing.variantAttributes = product.variantAttributes;
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      price: Number(product.price ?? 0),
      imageUrl: product.imageUrl ?? null,
      stock,
      quantity: nextQuantity,
      variantId: product.variantId,
      variantSku: product.variantSku,
      variantLabel: product.variantLabel,
      variantAttributes: product.variantAttributes,
    });
  }

  saveCartItems(items);
  if (requestedTotal > stock) {
    dispatchStockWarning(
      `Only ${stock} ${stock === 1 ? "unit is" : "units are"} available for ${product.name}. Your cart quantity was limited to available stock.`,
    );
  }
  return items;
}

export function updateCartQuantity(productId: string, quantity: number, variantId?: string) {
  const items = getCartItems().map((item) =>
    item.productId === productId && item.variantId === variantId
      ? { ...item, quantity: Math.max(0, quantity) }
      : item
  );

  saveCartItems(items.filter((item) => item.quantity > 0));
}

export function removeFromCart(productId: string, variantId?: string) {
  saveCartItems(getCartItems().filter((item) => !(item.productId === productId && item.variantId === variantId)));
}

export function clearCart() {
  saveCartItems([]);
}

export function getCartCount() {
  return getCartItems().reduce((sum, item) => sum + item.quantity, 0);
}

export function getRecentOrders() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRecentOrder(order: unknown) {
  if (typeof window === "undefined") return;

  const current = getRecentOrders();
  localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...current].slice(0, 10)));
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(localStorage.getItem("apc-user") ?? "null");
  } catch {
    return null;
  }
}

export function saveStoredUser(user: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem("apc-user", JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("apc-user");
}
