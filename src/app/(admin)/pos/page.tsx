"use client";

import Image from "@/components/safe-image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise as RotateCcw,
  Check,
  CircleNotch,
  List,
  MagnifyingGlass as Search,
  Minus,
  Money as Banknote,
  Package,
  Plus,
  Printer,
  ShoppingBag,
  ShoppingCart,
  SquaresFour as LayoutGrid,
  Trash as Trash2,
  Warning as AlertTriangle,
  X,
} from "@phosphor-icons/react";
import { getPrimaryImageUrl } from "@/features/catalog/utils/product-images";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import { ADMIN_MODAL_BACKDROP_CLASS } from "@/utils/admin-modal";
import { printEscPosReceipt } from "@/utils/escpos-usb";

interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  sku: string;
  variantLabel?: string;
  variantValueLabel?: string;
  availableStock: number;
}

interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  stock: number;
  color?: string | null;
  measurementValue?: number | null;
  measurementUnit?: string | null;
  attributes?: Record<string, string>;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  imageUrl: string;
  stock: number;
  hasVariants?: boolean;
  variants?: ProductVariant[];
}

function escapeReceiptHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

const defaultReceiptHeader = {
  registeredBusinessName: "APAYAO PASALUBONG CENTER",
  businessAddress: "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region",
  tinNumber: "",
};

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [selectedVariantIds, setSelectedVariantIds] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<"CASH">("CASH");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tenderAmount, setTenderAmount] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSubtotal, setCompletedSubtotal] = useState<number | null>(null);
  const [completedTender, setCompletedTender] = useState<number | null>(null);
  const [completedItems, setCompletedItems] = useState<CartItem[]>([]);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [currentDate, setCurrentDate] = useState("");
  const [productView, setProductView] = useState<"grid" | "list">("list");
  const [cashierName, setCashierName] = useState("");
  const [terminalNumber, setTerminalNumber] = useState("");
  const [receiptHeader, setReceiptHeader] = useState(defaultReceiptHeader);
  const [isUsbPrinting, setIsUsbPrinting] = useState(false);
  const [usbPrintMessage, setUsbPrintMessage] = useState("");
  const [usbPrintError, setUsbPrintError] = useState("");

  useEffect(() => {
    const terminalStorageKey = "apc-pos-terminal-number";
    const storedTerminalNumber = window.localStorage.getItem(terminalStorageKey);
    if (storedTerminalNumber) {
      window.setTimeout(() => setTerminalNumber(storedTerminalNumber), 0);
    } else {
      const generatedTerminalNumber = `POS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      window.localStorage.setItem(terminalStorageKey, generatedTerminalNumber);
      window.setTimeout(() => setTerminalNumber(generatedTerminalNumber), 0);
    }

    const updateClock = () => {
      setCurrentDate(
        new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    };

    updateClock();
    const clockInterval = window.setInterval(updateClock, 30000);

    async function loadProducts() {
      try {
        const response = await fetch("/api/admin/products");
        const data = await response.json();
        setProducts(Array.isArray(data) ? data : []);
      } catch {
        // Retain empty list on error
      } finally {
        setIsLoadingProducts(false);
      }
    }

    async function loadCashierProfile() {
      try {
        const response = await fetch("/api/auth/profile");
        const data = await response.json();
        if (response.ok && typeof data?.user?.name === "string") {
          setCashierName(data.user.name);
        }
      } catch {
        // Fallback to default
      }
    }

    async function loadReceiptHeader() {
      try {
        const response = await fetch("/api/admin/receipt-settings", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.settings) {
          setReceiptHeader({
            registeredBusinessName: data.settings.registeredBusinessName || defaultReceiptHeader.registeredBusinessName,
            businessAddress: data.settings.businessAddress || defaultReceiptHeader.businessAddress,
            tinNumber: data.settings.tinNumber || "",
          });
        }
      } catch {
        // Keep the standard receipt header if settings cannot be loaded.
      }
    }

    void loadProducts();
    void loadCashierProfile();
    void loadReceiptHeader();

    return () => {
      window.clearInterval(clockInterval);
    };
  }, []);

  // Periodic refresh to keep POS stocks synchronized
  useEffect(() => {
    if (isSubmitting || showReceipt || showSuccessOverlay) return;

    let mounted = true;
    const id = window.setInterval(async () => {
      try {
        const r = await fetch("/api/admin/products");
        if (!r.ok) return;
        const data = await r.json();
        if (!mounted) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [isSubmitting, showReceipt, showSuccessOverlay]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  function getSelectedVariant(product: Product) {
    const variantId = selectedVariantIds[product.id];
    return product.variants?.find((variant) => variant.id === variantId) ?? null;
  }

  function getVariantLabel(variant: ProductVariant) {
    const attributeDetails = getVariantAttributes(variant).map(([name, value]) => `${name}: ${value}`);

    const legacyDetails = [
      variant.color,
      variant.measurementValue ? `${variant.measurementValue}${variant.measurementUnit ?? ""}` : null,
    ].filter(Boolean) as string[];

    const details = attributeDetails.length > 0 ? attributeDetails : legacyDetails;
    return details.length > 0 ? `${details.join(" • ")} (${variant.sku})` : variant.sku;
  }

  function getVariantValueLabel(variant: ProductVariant) {
    const attributeValues = getVariantAttributes(variant).map(([, value]) => value);
    const legacyValues = [
      variant.color,
      variant.measurementValue ? `${variant.measurementValue}${variant.measurementUnit ?? ""}` : null,
    ].filter(Boolean) as string[];
    return (attributeValues.length > 0 ? attributeValues : legacyValues).join(" / ");
  }

  function getVariantAttributes(variant: ProductVariant) {
    return variant.attributes
      ? Object.entries(variant.attributes).filter(([, value]) => Boolean(value))
      : [];
  }

  function renderVariantOption(variant: ProductVariant) {
    const attributes = getVariantAttributes(variant);
    return attributes.length > 0 ? (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {attributes.map(([name, value]) => (
          <span key={name}>{value}</span>
        ))}
      </span>
    ) : (
      variant.sku
    );
  }

  function getVariantAttributeNames(variants: ProductVariant[]) {
    return (
      Array.from(new Set(variants.flatMap((variant) => getVariantAttributes(variant).map(([name]) => name)))).join(
        " / "
      ) || "Variant"
    );
  }

  function addToCart(product: Product, useVariant = true) {
    const selectedVariant = useVariant ? getSelectedVariant(product) : null;
    const hasVariants = Boolean(product.variants?.length);
    if (hasVariants && useVariant && !selectedVariant) {
      setStatusMessage("Please select an option before adding to cart.");
      return;
    }
    const activePrice = selectedVariant?.price ?? product.price;
    const activeSku = selectedVariant?.sku ?? product.sku;
    const variantLabel = selectedVariant ? getVariantLabel(selectedVariant) : undefined;
    const itemId = selectedVariant ? `${product.id}-${selectedVariant.id}` : product.id;
    const stockAvailable = selectedVariant ? selectedVariant.stock : product.stock;

    if (stockAvailable <= 0) {
      setStatusMessage("Selected item is out of stock.");
      return;
    }

    setStatusMessage("");

    setCart((current) => {
      const existing = current.find((item) => item.id === itemId);

      if (existing) {
        const nextQuantity = Math.min(existing.quantity + 1, existing.availableStock);
        return current.map((item) =>
          item.id === itemId ? { ...item, quantity: nextQuantity } : item
        );
      }

      return [
        ...current,
        {
          id: itemId,
          productId: product.id,
          variantId: selectedVariant?.id,
          name: product.name,
          price: Number(activePrice ?? 0),
          quantity: 1,
          sku: activeSku,
          variantLabel,
          variantValueLabel: selectedVariant ? getVariantValueLabel(selectedVariant) : undefined,
          availableStock: stockAvailable,
        },
      ];
    });
  }

  function selectCartVariant(itemId: string, product: Product, variantId: string) {
    const variant = product.variants?.find((option) => option.id === variantId);
    if (!variant || variant.stock <= 0) return;

    const nextItemId = `${product.id}-${variant.id}`;
    setCart((current) => {
      const existingVariant = current.find((item) => item.id === nextItemId);
      if (existingVariant && existingVariant.id !== itemId) {
        return current
          .filter((item) => item.id !== itemId)
          .map((item) =>
            item.id === nextItemId
              ? { ...item, quantity: Math.min(item.quantity + 1, variant.stock), availableStock: variant.stock }
              : item
          );
      }

      return current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              id: nextItemId,
              variantId: variant.id,
              price: variant.price,
              sku: variant.sku,
              variantLabel: getVariantLabel(variant),
              variantValueLabel: getVariantValueLabel(variant),
              availableStock: variant.stock,
            }
          : item
      );
    });
  }

  function changeQuantity(id: string, quantity: number) {
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    setCart((current) =>
      current.flatMap((item) => {
        if (item.id !== id) return [item];

        if (quantity <= 0) return [];

        const maxQty = Math.max(0, item.availableStock ?? 0);
        if (maxQty <= 0) return [];

        const nextQuantity = Math.min(Math.max(1, quantity), maxQty);
        return [{ ...item, quantity: nextQuantity }];
      })
    );
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const totalCartUnits = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );
  const tender = useMemo(() => Number(tenderAmount) || 0, [tenderAmount]);
  const change = useMemo(() => (tender > subtotal ? tender - subtotal : 0), [tender, subtotal]);

  const generateOrderNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `POS-${timestamp}`;
  };

  const printReceipt = (receiptOrderNumber = orderNumber) => {
    const receiptWindow = window.open("", "_blank", "width=400,height=600");
    if (!receiptWindow) return false;

    const receiptItems = completedItems.length > 0 ? completedItems : cart;
    const receiptSubtotal = completedSubtotal ?? subtotal;
    const receiptTender = completedTender ?? tender;
    const receiptChange = receiptTender > receiptSubtotal ? receiptTender - receiptSubtotal : 0;
    const receiptDate = completedAt ?? new Date();
    const separator = "-".repeat(42);
    const registeredBusinessName = receiptHeader.registeredBusinessName.trim() || defaultReceiptHeader.registeredBusinessName;
    const businessAddress = receiptHeader.businessAddress.trim() || defaultReceiptHeader.businessAddress;
    const tinNumber = receiptHeader.tinNumber.trim();

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt</title>
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            margin: 0;
            padding: 3mm;
            color: #111;
            font-size: 11px;
            line-height: 1.35;
          }
          .header {
            text-align: center;
            margin-bottom: 8px;
          }
          .header h2 {
            margin: 0 0 4px;
            font-size: 14px;
            letter-spacing: 0.2px;
          }
          .header div {
            margin: 2px 0;
          }
          .business-address { white-space: pre-line; overflow-wrap: anywhere; }
          .rule {
            overflow: hidden;
            margin: 6px 0;
            text-align: center;
            white-space: nowrap;
            letter-spacing: 0.15px;
          }
          .meta-row {
            display: grid;
            grid-template-columns: 86px minmax(0, 1fr);
            gap: 3px;
            margin: 3px 0;
            align-items: baseline;
            overflow-wrap: anywhere;
            font-size: 10px;
          }
          .items-header,
          .item {
            display: grid;
            grid-template-columns: 30px minmax(0, 1fr) 84px;
            gap: 4px;
            align-items: start;
          }
          .items-header {
            margin: 7px 0 4px;
            font-weight: bold;
          }
          .item-name {
            min-width: 0;
            overflow-wrap: anywhere;
          }
          .item-amount,
          .items-header span:last-child {
            text-align: right;
          }
          .item-unit {
            grid-column: 2 / 4;
            margin: 1px 0 4px;
            color: #444;
            font-size: 9px;
          }
          .totals {
            margin: 7px 0;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 3px 0;
          }
          .grand-total {
            border-top: 1px solid #111;
            padding-top: 5px;
            font-size: 12px;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            margin-top: 8px;
          }
          .footer strong { display: block; font-size: 12px; margin-bottom: 3px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${escapeReceiptHtml(registeredBusinessName)}</h2>
          <div class="business-address">${escapeReceiptHtml(businessAddress)}</div>
          ${tinNumber ? `<div>TIN: ${escapeReceiptHtml(tinNumber)}</div>` : ""}
        </div>

        <div class="rule">${separator}</div>
        <div class="meta-row"><strong>DATE:</strong><span>${receiptDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span></div>
        <div class="meta-row"><strong>TIME:</strong><span>${receiptDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span></div>
        <div class="meta-row"><strong>ORDER NO.:</strong><span>${escapeReceiptHtml(receiptOrderNumber)}</span></div>
        <div class="meta-row"><strong>CASHIER:</strong><span>${escapeReceiptHtml(cashierName || "Unknown user")}</span></div>
        <div class="meta-row"><strong>TERMINAL:</strong><span>${escapeReceiptHtml(terminalNumber || "POS-LOCAL")}</span></div>

        <div class="rule">${separator}</div>
        <div class="items-header"><span>QTY</span><span>ITEM</span><span>AMOUNT</span></div>
        <div class="items">
          ${receiptItems
            .map(
              (item) =>
                `<div class="item">
              <span>${item.quantity}</span>
              <span class="item-name">${escapeReceiptHtml(item.name)}${item.variantValueLabel ? ` (${escapeReceiptHtml(item.variantValueLabel)})` : ""}</span>
              <span class="item-amount">PHP ${(item.price * item.quantity).toFixed(2)}</span>
              <span class="item-unit">PHP ${item.price.toFixed(2)} each</span>
            </div>`
            )
            .join("")}
        </div>

        <div class="rule">${separator}</div>
        <div class="totals">
          <div class="total-row">
            <span>SUBTOTAL</span><span>PHP ${receiptSubtotal.toFixed(2)}</span>
          </div>
          <div class="total-row grand-total"><span>TOTAL</span><span>PHP ${receiptSubtotal.toFixed(2)}</span></div>
        </div>

        <div class="rule">${separator}</div>
        <div class="meta-row"><strong>PAYMENT:</strong><span>${escapeReceiptHtml(paymentMethod)}</span></div>
        <div class="meta-row"><strong>TENDERED:</strong><span>PHP ${receiptTender.toFixed(2)}</span></div>
        <div class="meta-row"><strong>CHANGE:</strong><span>PHP ${receiptChange.toFixed(2)}</span></div>

        <div class="footer">
          <strong>THANK YOU!</strong>
          <div>This serves as your official receipt.</div>
        </div>
      </body>
      </html>
    `;

    receiptWindow.document.write(receiptHTML);
    receiptWindow.document.close();
    setTimeout(() => {
      receiptWindow.print();
    }, 250);
    return true;
  };

  const handleBrowserReceiptPrint = () => {
    setUsbPrintError("");
    if (printReceipt()) {
      setUsbPrintMessage("The browser print dialog is ready. Select your receipt printer to continue.");
    } else {
      setUsbPrintMessage("");
      setUsbPrintError("The browser blocked the print window. Allow pop-ups for this site, then try browser printing again.");
    }
  };

  const handleUsbReceiptPrint = async () => {
    setUsbPrintMessage("");
    setUsbPrintError("");
    setIsUsbPrinting(true);

    const receiptItems = completedItems.length > 0 ? completedItems : cart;
    const receiptSubtotal = completedSubtotal ?? subtotal;
    const receiptTender = completedTender ?? tender;

    try {
      const printerName = await printEscPosReceipt({
        createdAt: completedAt ?? new Date(),
        orderNumber,
        registeredBusinessName: receiptHeader.registeredBusinessName || defaultReceiptHeader.registeredBusinessName,
        businessAddress: receiptHeader.businessAddress || defaultReceiptHeader.businessAddress,
        tinNumber: receiptHeader.tinNumber,
        cashier: cashierName || "Unknown user",
        terminal: terminalNumber || "POS-LOCAL",
        paymentMethod,
        subtotal: receiptSubtotal,
        tender: receiptTender,
        change: Math.max(receiptTender - receiptSubtotal, 0),
        items: receiptItems.map((item) => ({
          name: item.name,
          variant: item.variantValueLabel,
          quantity: item.quantity,
          price: item.price,
        })),
      });
      setUsbPrintMessage(`Receipt sent to ${printerName}.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The browser could not communicate with the printer.";
      const guidance = /browser printing/i.test(reason)
        ? ""
        : " Check that the printer is connected, then choose it in the browser prompt. You can also use browser printing.";
      setUsbPrintError(`${reason}${guidance}`);
    } finally {
      setIsUsbPrinting(false);
    }
  };

  async function handleSubmit() {
    if (!cart.length) {
      setStatusMessage("Add at least one item to the cart.");
      return;
    }

    if (
      cart.some(
        (item) =>
          !item.variantId &&
          products.some((product) => product.id === item.productId && product.variants?.length)
      )
    ) {
      setStatusMessage("Select an option for every variant product in the cart.");
      return;
    }

    if (paymentMethod === "CASH" && tender < subtotal) {
      setStatusMessage("Tender amount must be at least equal to the total.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("");
    setShowSuccessOverlay(false);

    const newOrderNumber = generateOrderNumber();
    setOrderNumber(newOrderNumber);

    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          isWalkIn: true,
          items: cart.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.price,
          })),
        }),
      });

      const data = await response.json();
      setIsSubmitting(false);

      if (!response.ok) {
        if (typeof data.message === "string" && data.message.includes("Not enough stock")) {
          const productId = data.message.match(/Not enough stock for ([^.]+)\.?/)?.[1];
          const productName = productId ? products.find((product) => product.id === productId)?.name : null;
          setWarningMessage(productName ? `Not enough stock for ${productName}.` : data.message);
          setStatusMessage("");
        } else {
          setStatusMessage(data.message ?? "Unable to create order.");
        }
        return;
      }

      setShowSuccessOverlay(true);
      setCompletedSubtotal(subtotal);
      setCompletedTender(tender);
      setCompletedItems(cart);
      setCompletedAt(new Date());

      // Decrement local product/variant stocks immediately
      setProducts((current) =>
        current.map((p) => {
          const matching = cart.filter((ci) => ci.productId === p.id);
          if (!matching.length) return p;

          const next: Product = {
            ...p,
            variants: Array.isArray(p.variants) ? p.variants.map((v) => ({ ...v })) : undefined,
          };

          if (Array.isArray(next.variants) && next.variants.length) {
            const variants: ProductVariant[] = next.variants.map((v) => ({ ...v }));

            for (const ci of matching) {
              if (ci.variantId) {
                const idx = variants.findIndex((v) => v.id === ci.variantId);
                if (idx > -1) {
                  variants[idx].stock = Math.max(0, Number(variants[idx].stock ?? 0) - Number(ci.quantity ?? 0));
                }
              } else {
                next.stock = Math.max(0, Number(next.stock ?? 0) - Number(ci.quantity ?? 0));
              }
            }

            next.variants = variants;
            next.stock = variants.reduce((s, v) => s + Number(v.stock ?? 0), 0);
            return next;
          }

          for (const ci of matching) {
            next.stock = Math.max(0, Number(next.stock ?? 0) - Number(ci.quantity ?? 0));
          }

          return next;
        })
      );

      // Refresh product list from server in background
      try {
        const refreshed = await fetch("/api/admin/products");
        const refreshedData = await refreshed.json();
        if (refreshed.ok) {
          setProducts(Array.isArray(refreshedData) ? refreshedData : []);
        }
      } catch {
        // ignore background refresh errors
      }

      window.setTimeout(() => {
        setShowSuccessOverlay(false);
        setCart([]);
        setQuantityDrafts({});
        setShowReceipt(true);
      }, 1200);
    } catch {
      setIsSubmitting(false);
      setStatusMessage("An unexpected error occurred. Please try again.");
    }
  }

  function resetCart() {
    setCart([]);
    setQuantityDrafts({});
    setPaymentMethod("CASH");
    setTenderAmount("");
    setStatusMessage("");
    setShowReceipt(false);
    setShowSuccessOverlay(false);
    setOrderNumber("");
    setCompletedSubtotal(null);
    setCompletedTender(null);
    setCompletedItems([]);
    setCompletedAt(null);
    setUsbPrintMessage("");
    setUsbPrintError("");
  }

  const receiptItemsToShow = completedItems.length > 0 ? completedItems : cart;
  const receiptSubtotalToShow = completedSubtotal ?? subtotal;
  const receiptTenderToShow = completedTender ?? tender;
  const receiptDateToShow = completedAt ?? new Date();
  const receiptSeparator = "-".repeat(42);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 text-slate-800 dark:text-slate-100">
      {/* 1. Header Toolbar */}
      <header className="flex flex-row items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Point of Sale
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Terminal Ready
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Cashier: <strong className="font-semibold text-slate-700 dark:text-slate-200">{cashierName || "Active User"}</strong>
              </span>
              <span>•</span>
              <span>
                Terminal: <strong className="font-semibold text-slate-700 dark:text-slate-200">{terminalNumber || "POS-01"}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 text-xs">
          <div className="text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span>{currentDate || "Loading clock..."}</span>
          </div>
        </div>
      </header>

      {/* 2. Processing Spinner Overlay */}
      {isSubmitting && (
        <AdminModalPortal>
        <div
          className={`${ADMIN_MODAL_BACKDROP_CLASS} px-4`}
          data-admin-modal="true"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-xs rounded-lg border border-slate-200 bg-white p-6 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">Processing Sale</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recording transaction and updating stocks...</p>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* 3. Clean Order Complete Success Overlay */}
      {showSuccessOverlay && (
        <AdminModalPortal>
        <div
          className={`${ADMIN_MODAL_BACKDROP_CLASS} px-4`}
          data-admin-modal="true"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Check className="h-6 w-6 stroke-3" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sale Completed</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The sale was recorded and inventory was deducted.</p>

            <div className="mt-4 grid grid-cols-2 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-left dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Order No.</span>
                <span className="mt-0.5 block font-mono text-xs font-bold text-slate-900 dark:text-white">{orderNumber}</span>
              </div>
              <div className="p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Paid</span>
                <span className="mt-0.5 block text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ₱{(completedSubtotal ?? subtotal).toFixed(2)}
                </span>
              </div>
            </div>

            <p className="mt-4 text-[11px] text-slate-400">Opening printable receipt confirmation...</p>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* 4. Not Enough Stock Alert Dialog */}
      {warningMessage && (
        <AdminModalPortal>
        <div
          className={`${ADMIN_MODAL_BACKDROP_CLASS} px-4`}
          data-admin-modal="true"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-lg border border-rose-200 bg-white p-5 text-center shadow-xl dark:border-rose-900/60 dark:bg-slate-900">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">Insufficient Stock</h3>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{warningMessage}</p>
            <button
              type="button"
              onClick={() => setWarningMessage("")}
              className="mt-4 w-full rounded-md bg-slate-900 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Acknowledge & Close
            </button>
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* 5. Printable Receipt Modal */}
      {showReceipt && (
        <AdminModalPortal>
        <div
          className={`${ADMIN_MODAL_BACKDROP_CLASS} overflow-y-auto`}
          data-admin-modal="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-receipt-title"
        >
          <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h2 id="pos-receipt-title" className="text-base font-bold text-slate-900 dark:text-white">Order Confirmation</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receipt preview - 80 mm</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                aria-label="Close receipt preview"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              <div
                role="region"
                aria-label="Scrollable 80 millimeter receipt preview"
                tabIndex={0}
                className="mx-auto max-h-[min(56dvh,34rem)] w-full max-w-[80mm] overflow-y-auto overscroll-contain border border-slate-200 bg-white p-[3mm] font-mono text-[10px] leading-[1.4] text-slate-900 shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <header className="mb-2 text-center">
                  <h3 className="break-words text-[12px] font-bold leading-tight">
                    {receiptHeader.registeredBusinessName.trim() || defaultReceiptHeader.registeredBusinessName}
                  </h3>
                  <p className="mt-1 whitespace-pre-line break-words">
                    {receiptHeader.businessAddress.trim() || defaultReceiptHeader.businessAddress}
                  </p>
                  {receiptHeader.tinNumber.trim() && <p className="mt-1">TIN: {receiptHeader.tinNumber.trim()}</p>}
                </header>

                <div aria-hidden="true" className="my-1.5 overflow-hidden whitespace-nowrap">{receiptSeparator}</div>
                <dl className="space-y-0.5">
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>DATE:</dt><dd className="break-words">{receiptDateToShow.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</dd></div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>TIME:</dt><dd>{receiptDateToShow.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</dd></div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>ORDER NO.:</dt><dd className="break-all">{orderNumber}</dd></div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>CASHIER:</dt><dd className="break-words">{cashierName || "Unknown user"}</dd></div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>TERMINAL:</dt><dd className="break-words">{terminalNumber || "POS-LOCAL"}</dd></div>
                </dl>

                <div aria-hidden="true" className="my-1.5 overflow-hidden whitespace-nowrap">{receiptSeparator}</div>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-1 font-bold">
                  <span>QTY</span><span>ITEM</span><span className="text-right">AMOUNT</span>
                </div>
                <div className="mt-1 space-y-2">
                  {receiptItemsToShow.map((item) => (
                    <div key={item.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-1">
                      <span>{item.quantity}</span>
                      <span className="break-words font-semibold">
                        {item.name}{item.variantValueLabel ? ` (${item.variantValueLabel})` : ""}
                      </span>
                      <span className="text-right">PHP {(item.price * item.quantity).toFixed(2)}</span>
                      <span className="col-start-2 col-end-4 text-[9px] text-slate-600">PHP {item.price.toFixed(2)} each</span>
                    </div>
                  ))}
                </div>

                <div aria-hidden="true" className="my-1.5 overflow-hidden whitespace-nowrap">{receiptSeparator}</div>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-2"><span>SUBTOTAL</span><span>PHP {receiptSubtotalToShow.toFixed(2)}</span></div>
                  <div className="flex justify-between gap-2 border-t border-dashed border-slate-500 pt-1 text-[11px] font-bold"><span>TOTAL</span><span>PHP {receiptSubtotalToShow.toFixed(2)}</span></div>
                </div>
                <div aria-hidden="true" className="my-1.5 overflow-hidden whitespace-nowrap">{receiptSeparator}</div>
                <dl className="space-y-0.5">
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>PAYMENT:</dt><dd>{paymentMethod}</dd></div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>TENDERED:</dt><dd>PHP {receiptTenderToShow.toFixed(2)}</dd></div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1"><dt>CHANGE:</dt><dd>PHP {Math.max(receiptTenderToShow - receiptSubtotalToShow, 0).toFixed(2)}</dd></div>
                </dl>
                <div aria-hidden="true" className="my-1.5 overflow-hidden whitespace-nowrap">{receiptSeparator}</div>
                <footer className="text-center">
                  <strong className="block text-[11px]">THANK YOU!</strong>
                  <span>This serves as your official receipt.</span>
                </footer>
              </div>
            </div>

            <p className="mb-2 shrink-0 text-center text-[11px] text-slate-600 dark:text-slate-300">
              USB printing requires Chrome or Edge on HTTPS. Choose your compatible ESC/POS printer when the browser prompts you.
            </p>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleUsbReceiptPrint()}
                disabled={isUsbPrinting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-900 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {isUsbPrinting ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                <span>{isUsbPrinting ? "Printing..." : "Print"}</span>
              </button>
              <button
                type="button"
                onClick={resetCart}
                disabled={isUsbPrinting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-700 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-800 shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Start New Sale</span>
              </button>
            </div>
            {usbPrintMessage && <p className="mt-2 text-center text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">{usbPrintMessage}</p>}
            {usbPrintError && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">USB printing failed</p>
                    <p className="mt-1 break-words">{usbPrintError}</p>
                    <button
                      type="button"
                      onClick={handleBrowserReceiptPrint}
                      className="mt-2 rounded border border-amber-700 px-2.5 py-1.5 font-semibold text-amber-950 underline underline-offset-2 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 dark:border-amber-300 dark:text-amber-100 dark:hover:bg-amber-900/50"
                    >
                      Print from browser
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </AdminModalPortal>
      )}

      {/* 6. Main Register Layout (Catalog & Cart Workspace) */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.8fr)] xl:gap-6">
        {/* Left Column: Product Catalog */}
        <section className="min-w-0">
          <div className="rounded-md border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">Product catalog</h2>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {isLoadingProducts ? "Loading…" : `${filteredProducts.length} items`}
              </span>
            </div>
            {/* Catalog Controls (Search, View Toggle, Item Counter) */}
            <div className="mb-4 flex flex-row items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search products by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-900 outline-hidden placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:bg-slate-900"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-800">
                  <button
                    type="button"
                    title="List view"
                    onClick={() => setProductView("list")}
                    className={`flex h-7 w-7 items-center justify-center rounded-sm transition ${
                      productView === "list"
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Grid view"
                    onClick={() => setProductView("grid")}
                    className={`flex h-7 w-7 items-center justify-center rounded-sm transition ${
                      productView === "grid"
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>

              </div>
            </div>

            {/* Scrollable Product List / Grid */}
            <div
              aria-busy={isLoadingProducts}
              className={`max-h-[min(68vh,760px)] overflow-y-auto pr-1 ${
                productView === "list" ? "space-y-2" : "grid gap-3 md:grid-cols-2"
              }`}
            >
              {isLoadingProducts ? (
                <div
                  role="status"
                  aria-label="Loading products"
                  className={productView === "list" ? "space-y-2" : "col-span-full grid gap-3 md:grid-cols-2"}
                >
                  <span className="sr-only">Loading products…</span>
                  {Array.from({ length: productView === "list" ? 6 : 4 }, (_, index) =>
                    productView === "list" ? (
                      <div
                        key={`pos-product-skeleton-${index}`}
                        aria-hidden="true"
                        className="flex animate-pulse items-center justify-between gap-3 border-b border-slate-200 px-1 py-3 first:border-t dark:border-slate-800"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="h-10 w-10 shrink-0 rounded-md bg-slate-200 dark:bg-slate-700" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
                          <div className="h-8 w-8 rounded-md bg-slate-200 dark:bg-slate-700" />
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`pos-product-skeleton-${index}`}
                        aria-hidden="true"
                        className="animate-pulse rounded-md border border-slate-200 p-3 dark:border-slate-800"
                      >
                        <div className="mb-2.5 h-32 w-full rounded-md bg-slate-200 dark:bg-slate-700" />
                        <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="mt-2 h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
                          <div className="h-8 w-8 rounded-md bg-slate-200 dark:bg-slate-700" />
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const selectedVariant = getSelectedVariant(product);
                  const variantOptions = product.variants ?? [];
                  const activeStock =
                    variantOptions.length > 0
                      ? selectedVariant?.stock ??
                        variantOptions.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0)
                      : product.stock;
                  const activePrice = selectedVariant
                    ? selectedVariant.price
                    : variantOptions.length > 0
                      ? null
                      : product.price;
                  const activeSku = selectedVariant?.sku ?? (variantOptions.length > 0 ? "Select option" : product.sku);
                  const inStock = activeStock > 0;

                  if (productView === "list") {
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center justify-between gap-3 border-b px-1 py-3 transition-colors first:border-t ${
                          inStock
                            ? "border-slate-200 hover:bg-emerald-50/40 dark:border-slate-800 dark:hover:bg-emerald-950/15"
                            : "border-slate-200 opacity-55 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
                            <Image
                              src={getPrimaryImageUrl(product.imageUrl) || "/logo/apc-logo.png"}
                              alt={product.name}
                              width={40}
                              height={40}
                              className="h-full w-full object-cover"
                            />
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-xs font-bold text-slate-900 dark:text-white">
                              {product.name}
                            </h3>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>SKU: {activeSku}</span>
                              <span>•</span>
                              <span
                                className={`font-semibold ${
                                  inStock
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {inStock ? `${activeStock} in stock` : "Sold out"}
                              </span>
                            </div>

                            {/* Variants selection pills if applicable */}
                            {variantOptions.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {variantOptions.map((variant) => (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedVariantIds((current) => ({
                                        ...current,
                                        [product.id]: variant.id,
                                      }))
                                    }
                                    disabled={variant.stock <= 0}
                                    className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold transition ${
                                      selectedVariant?.id === variant.id
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                    } disabled:cursor-not-allowed disabled:opacity-40`}
                                  >
                                    {renderVariantOption(variant)} ({variant.stock})
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <span className="block text-sm font-bold text-slate-900 dark:text-white">
                              {activePrice === null ? "Select option" : `₱${activePrice.toFixed(2)}`}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            disabled={!inStock || (variantOptions.length > 0 && !selectedVariant)}
                            className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-700 text-white transition-colors hover:bg-emerald-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-800"
                            title="Add to cart"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Grid View Card
                  return (
                    <div
                      key={product.id}
                      className={`flex flex-col justify-between rounded-md border p-3 transition-colors ${
                        inStock
                          ? "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800"
                          : "border-slate-200 bg-slate-50 opacity-55 dark:border-slate-800 dark:bg-slate-950/40"
                      }`}
                    >
                      <div>
                        <div className="relative mb-2.5 h-32 w-full overflow-hidden rounded-md border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
                          <Image
                            src={getPrimaryImageUrl(product.imageUrl) || "/logo/apc-logo.png"}
                            alt={product.name}
                            fill
                            sizes="(max-width: 768px) 100vw, 250px"
                            className="object-cover"
                          />
                          <span
                            className={`absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow-xs ${
                              inStock
                                ? "bg-white/95 text-emerald-700 dark:bg-slate-900/95 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950/90 dark:text-rose-400"
                            }`}
                          >
                            {inStock ? `${activeStock} left` : "Out of stock"}
                          </span>
                        </div>

                        <h3 className="line-clamp-2 text-xs font-bold text-slate-900 dark:text-white" title={product.name}>
                          {product.name}
                        </h3>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          SKU: {activeSku}
                        </p>

                        {/* Variants selection pills if applicable */}
                        {variantOptions.length > 0 && (
                          <div className="mt-2">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              {getVariantAttributeNames(variantOptions)}
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {variantOptions.map((variant) => (
                                <button
                                  key={variant.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedVariantIds((current) => ({
                                      ...current,
                                      [product.id]: variant.id,
                                    }))
                                  }
                                  disabled={variant.stock <= 0}
                                  className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                                    selectedVariant?.id === variant.id
                                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  } disabled:cursor-not-allowed disabled:opacity-40`}
                                >
                                  {renderVariantOption(variant)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <div>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {activePrice === null ? "Select option" : `₱${activePrice.toFixed(2)}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          disabled={!inStock || (variantOptions.length > 0 && !selectedVariant)}
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-700 text-white transition-colors hover:bg-emerald-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-800"
                          title="Add to cart"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full py-12 text-center text-xs text-slate-400">
                  <Package className="mx-auto mb-2 h-7 w-7 text-slate-300 dark:text-slate-600" />
                  No matching products found. Try a different search term.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Register & Cart Workspace */}
        <aside className="min-w-0 xl:sticky xl:top-4">
          <div className="flex h-full flex-col rounded-md border border-slate-200 border-t-2 border-t-emerald-600 bg-white p-4 sm:p-5 dark:border-slate-800 dark:border-t-emerald-500 dark:bg-slate-900">
            {/* Cart Header */}
            <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Current Order</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {totalCartUnits} items
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={resetCart}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title="Clear current cart"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cart Items List */}
            <div className="max-h-[38vh] min-h-35 flex-1 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400 dark:border-slate-800">
                  <ShoppingBag className="mb-2 h-7 w-7 text-slate-300 dark:text-slate-600" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">Cart is empty</p>
                  <p className="mt-0.5 text-[11px]">Select items from the catalog to build an order.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cart.map((item) => {
                    const maxQty = Math.max(0, item.availableStock ?? 0);

                    return (
                      <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">
                              {item.name}
                            </span>
                            {item.variantLabel && (
                              <span className="block text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                {item.variantLabel}
                              </span>
                            )}
                            <span className="block text-[11px] text-slate-400">
                              ₱{item.price.toFixed(2)} each • Max: {maxQty}
                            </span>

                            {/* Unselected variant selector in cart if needed */}
                            {!item.variantId &&
                              (() => {
                                const product = products.find((entry) => entry.id === item.productId);
                                const options = product?.variants ?? [];
                                return product && options.length > 0 ? (
                                  <div className="mt-1">
                                    <span className="block text-[10px] font-semibold text-amber-600">
                                      Select option:
                                    </span>
                                    <div className="mt-0.5 flex flex-wrap gap-1">
                                      {options.map((variant) => (
                                        <button
                                          key={variant.id}
                                          type="button"
                                          onClick={() => selectCartVariant(item.id, product, variant.id)}
                                          disabled={variant.stock <= 0}
                                          className="rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 disabled:opacity-40"
                                        >
                                          {renderVariantOption(variant)} ({variant.stock})
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : null;
                              })()}
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="block text-xs font-bold text-slate-900 dark:text-white">
                              ₱{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Stepper Controls */}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => changeQuantity(item.id, item.quantity - 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              title="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={maxQty}
                              value={quantityDrafts[item.id] ?? String(item.quantity)}
                              onChange={(event) => {
                                const value = event.target.value;
                                setQuantityDrafts((current) => ({ ...current, [item.id]: value }));
                                if (value) {
                                  const nextValue = Math.min(Number(value), maxQty || 1);
                                  if (nextValue > 0) changeQuantity(item.id, nextValue);
                                }
                              }}
                              onBlur={() => {
                                const value = quantityDrafts[item.id];
                                if (!value || Number(value) <= 0) {
                                  setQuantityDrafts((current) => {
                                    const next = { ...current };
                                    delete next[item.id];
                                    return next;
                                  });
                                } else {
                                  const clamped = Math.min(Number(value), maxQty || 1);
                                  setQuantityDrafts((current) => ({
                                    ...current,
                                    [item.id]: String(Math.max(1, clamped)),
                                  }));
                                }
                              }}
                              className="h-7 w-11 rounded-md border border-slate-200 bg-slate-50 text-center font-mono text-xs font-bold text-slate-900 outline-hidden focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => changeQuantity(item.id, item.quantity + 1)}
                              disabled={item.quantity >= maxQty}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              title="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => changeQuantity(item.id, 0)}
                            className="rounded-md p-1 text-slate-400 transition hover:text-rose-600 dark:hover:text-rose-400"
                            title="Remove from cart"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payment & Checkout Section */}
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              {/* Subtotal Banner */}
              <div className="mb-3 flex items-center justify-between border-y border-slate-200 py-3 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Total Due
                </span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">
                  ₱{subtotal.toFixed(2)}
                </span>
              </div>

              {/* Payment Method Selector */}
              <div className="mb-3">
                <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("CASH")}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-white py-2 text-xs font-semibold text-slate-900 ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600"
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    <span>Cash</span>
                  </button>
                </div>
              </div>

              {/* Cash Tender Controls */}
              {paymentMethod === "CASH" && (
                <div className="mb-3 space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Tender Amount
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tenderAmount}
                      onChange={(e) => setTenderAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-base font-semibold tabular-nums text-slate-950 outline-hidden transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500"
                    />
                  </div>

                  {/* Quick Cash Presets */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setTenderAmount(subtotal > 0 ? subtotal.toFixed(2) : "0")}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
                    >
                      Exact
                    </button>
                    {[100, 200, 500, 1000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTenderAmount(String(val))}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
                      >
                        ₱{val}
                      </button>
                    ))}
                  </div>

                  {/* Insufficient or Change Due Card */}
                  {tender > 0 && tender < subtotal && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      <span className="font-bold">Insufficient Amount:</span> Need ₱{(subtotal - tender).toFixed(2)} more
                    </div>
                  )}

                  {tender >= subtotal && subtotal > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <span>Change Due:</span>
                      <span className="text-sm">₱{change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Status Message */}
              {statusMessage && (
                <div
                  role="alert"
                  className={`mb-3 rounded-md p-2 text-xs font-medium ${
                    statusMessage.includes("successfully")
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                  }`}
                >
                  {statusMessage}
                </div>
              )}

              {/* Primary Complete Sale CTA */}
              <button
                type="button"
                disabled={
                  isSubmitting ||
                  cart.length === 0 ||
                  (paymentMethod === "CASH" && tender > 0 && tender < subtotal)
                }
                onClick={handleSubmit}
                className="w-full rounded-md bg-emerald-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
              >
                {isSubmitting
                  ? "Processing..."
                  : subtotal > 0
                  ? `Charge ₱${subtotal.toFixed(2)}`
                  : "Complete Sale"}
              </button>
            </div>
          </div>
        </aside>
      </div>

    </div>
  );
}
