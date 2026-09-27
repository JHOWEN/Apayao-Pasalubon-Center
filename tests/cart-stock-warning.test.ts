import assert from "node:assert/strict";
import test from "node:test";
import { addToCart, type CartItem } from "../src/features/cart/lib/cart";

function installCartEnvironment(initialItems: CartItem[] = []) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const warnings: string[] = [];
  let storedCart = JSON.stringify(initialItems);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent(event: Event) {
        if (event.type === "apc-cart-stock-warning") {
          warnings.push((event as CustomEvent<{ message: string }>).detail.message);
        }
        return true;
      },
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return key === "apc-cart" ? storedCart : null;
      },
      setItem(key: string, value: string) {
        if (key === "apc-cart") storedCart = value;
      },
    },
  });

  return {
    warnings,
    getCart: () => JSON.parse(storedCart) as CartItem[],
    restore() {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
      else Reflect.deleteProperty(globalThis, "localStorage");
    },
  };
}

test("clamps and warns when the first cart addition exceeds stock", () => {
  const environment = installCartEnvironment();

  try {
    addToCart({ id: "product-1", name: "Apayao Basket", price: 100, stock: 3, quantity: 5 });

    assert.equal(environment.getCart()[0]?.quantity, 3);
    assert.match(environment.warnings[0] ?? "", /Only 3 units are available/);
  } finally {
    environment.restore();
  }
});

test("warns and clamps when an addition exceeds remaining stock", () => {
  const environment = installCartEnvironment([
    { productId: "product-1", name: "Apayao Basket", price: 100, stock: 3, quantity: 2 },
  ]);

  try {
    addToCart({ id: "product-1", name: "Apayao Basket", price: 100, stock: 3, quantity: 2 });

    assert.equal(environment.getCart()[0]?.quantity, 3);
    assert.match(environment.warnings[0] ?? "", /Only 3 units are available/);
  } finally {
    environment.restore();
  }
});