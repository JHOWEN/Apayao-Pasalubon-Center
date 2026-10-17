import { getDirectStockOutReasonLabel } from "@/lib/direct-stock-out";

export type ReportType = "ALL" | "INVENTORY" | "SALES" | "LOW_STOCK" | "TOP_PRODUCTS" | "DIRECT_STOCK_OUT";

export type DirectStockOutRecord = {
  id: string;
  createdAt: string;
  productDisplayName: string;
  variantSku: string | null;
  reason: string;
  quantity: number;
  unitCostSnapshot: number | null;
  estimatedLossValue: number | null;
  stockBefore: number | null;
  stockAfter: number | null;
  remarks: string | null;
  performedByName: string | null;
  isArchived: boolean;
};

export type DirectStockOutSummary = {
  entries: number;
  units: number;
  estimatedValue: number;
  unvaluedEntries: number;
};

export type DirectStockOutReasonGroup = DirectStockOutSummary & { reason: string };

export type DirectStockOutReportData = {
  summary: DirectStockOutSummary;
  reasonBreakdown: DirectStockOutReasonGroup[];
  transactions: DirectStockOutRecord[];
};

export type ReportDocumentData = {
  business: {
    name: string;
    address: string;
  };
  summary: {
    totalRevenue: number;
    grossProfit: number;
    completedOrders: number;
    totalItemsSold: number;
    stockValue: number;
    retailValue: number;
    activeProducts: number;
    lowStockCount?: number;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    totalAmount: string;
    grossProfit: number;
    completedAt: string;
    itemCount: number;
    items: Array<{
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      subtotal: number;
      grossProfit: number;
    }>;
  }>;
  lowStock: Array<{ name: string; sku: string; stock: number; minStock: number }>;
  topProducts: Array<{ name: string; sku: string; unitsSold: number; revenue: number }>;
  inventoryItems: Array<{
    name: string;
    sku: string;
    stock: number;
    cost: string;
    price: string;
    stockValue: string;
  }>;
  channelBreakdown: Record<string, { count: number; revenue: number }>;
  paymentBreakdown: Record<string, { count: number; revenue: number }>;
  directStockOut?: DirectStockOutReportData;
};

export type ReportSection = {
  title: string;
  headers: string[];
  rows: string[][];
  emptyMessage: string;
};

export function isReportNumericHeader(header: string) {
  return /qty|quantity|units|on hand|minimum|stock|cost|price|value|revenue|profit|orders|collected|rank|total|restock|amount/i.test(header);
}

export const getReportTitle = (type: ReportType) => ({
  ALL: "Business Summary Report",
  INVENTORY: "Inventory Report",
  SALES: "Sales Report",
  LOW_STOCK: "Low Stock Report",
  TOP_PRODUCTS: "Top Products Report",
  DIRECT_STOCK_OUT: "Direct Stock-out Report",
})[type];

const currency = (value: number | string) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function formatReportDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getReportPeriodLabel(startDate: string, endDate: string, type: ReportType) {
  if (type === "INVENTORY" || type === "LOW_STOCK") return "Current stock snapshot";

  let period: string;
  if (startDate && endDate) {
    const start = formatReportDate(startDate);
    const end = formatReportDate(endDate);
    period = start === end ? start : `${start} to ${end}`;
  } else if (startDate) {
    period = `From ${formatReportDate(startDate)}`;
  } else if (endDate) {
    period = `Until ${formatReportDate(endDate)}`;
  } else {
    period = "All dates";
  }

  return type === "ALL" ? `Sales: ${period}; stock: current` : period;
}

export function formatReportGeneratedAt(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}

export function getReportSummaryRows(report: ReportDocumentData, type: ReportType): Array<[string, string]> {
  const inventoryUnits = report.inventoryItems.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const lowStockDeficit = report.lowStock.reduce(
    (sum, item) => sum + Math.max(Number(item.minStock) - Number(item.stock), 0),
    0,
  );
  const topProductUnits = report.topProducts.reduce((sum, item) => sum + Number(item.unitsSold || 0), 0);
  const topProductRevenue = report.topProducts.reduce((sum, item) => sum + Number(item.revenue || 0), 0);

  switch (type) {
    case "INVENTORY":
      return [
        ["Items listed", String(report.inventoryItems.length)],
        ["Units on hand", inventoryUnits.toLocaleString("en-PH")],
        ["Current stock cost value", currency(report.summary.stockValue)],
        ["Current retail value", currency(report.summary.retailValue)],
      ];
    case "SALES":
      return [
        ["Sales revenue", currency(report.summary.totalRevenue)],
        ["Estimated product cost", currency(report.summary.totalRevenue - report.summary.grossProfit)],
        ["Estimated gross profit", currency(report.summary.grossProfit)],
        ["Completed orders", report.summary.completedOrders.toLocaleString("en-PH")],
        ["Units sold", report.summary.totalItemsSold.toLocaleString("en-PH")],
      ];
    case "LOW_STOCK":
      return [
        ["Items to restock", report.lowStock.length.toLocaleString("en-PH")],
        ["Units needed to reach minimum", lowStockDeficit.toLocaleString("en-PH")],
      ];
    case "TOP_PRODUCTS":
      return [
        ["Products listed", report.topProducts.length.toLocaleString("en-PH")],
        ["Units sold", topProductUnits.toLocaleString("en-PH")],
        ["Sales revenue", currency(topProductRevenue)],
      ];
    case "DIRECT_STOCK_OUT": {
      const summary = report.directStockOut?.summary;
      return [
        ["Stock-out entries", (summary?.entries ?? 0).toLocaleString("en-PH")],
        ["Units removed", (summary?.units ?? 0).toLocaleString("en-PH")],
        ["Estimated stock loss (recorded unit costs)", currency(summary?.estimatedValue ?? 0)],
        ["Entries without cost (excluded from estimate)", (summary?.unvaluedEntries ?? 0).toLocaleString("en-PH")],
      ];
    }
    default:
      return [
        ["Sales revenue", currency(report.summary.totalRevenue)],
        ["Estimated gross profit", currency(report.summary.grossProfit)],
        ["Completed orders", report.summary.completedOrders.toLocaleString("en-PH")],
        ["Units sold", report.summary.totalItemsSold.toLocaleString("en-PH")],
        ["Current stock cost value", currency(report.summary.stockValue)],
        ["Current retail value", currency(report.summary.retailValue)],
        ["Items to restock now", (report.summary.lowStockCount ?? report.lowStock.length).toLocaleString("en-PH")],
      ];
  }
}

export function getReportSections(
  report: ReportDocumentData,
  type: ReportType,
  hasSearchFilter = false,
): ReportSection[] {
  const inventory = report.inventoryItems.map((item) => [
    item.name,
    item.sku,
    Number(item.stock).toLocaleString("en-PH"),
    currency(item.cost),
    currency(item.price),
    currency(item.stockValue),
  ]);
  const sales = report.recentOrders.flatMap((order) => order.items.map((item) => [
    order.orderNumber,
    new Date(order.completedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }),
    item.productName,
    item.sku,
    Number(item.quantity).toLocaleString("en-PH"),
    currency(item.unitPrice),
    currency(item.unitCost),
    currency(item.subtotal),
    currency(item.grossProfit),
  ]));
  const channels = Object.entries(report.channelBreakdown).map(([name, values]) => [
    name,
    values.count.toLocaleString("en-PH"),
    currency(values.revenue),
  ]);
  const payments = Object.entries(report.paymentBreakdown).map(([name, values]) => [
    name,
    values.count.toLocaleString("en-PH"),
    currency(values.revenue),
  ]);
  const lowStock = report.lowStock.map((item) => [
    item.name,
    item.sku,
    Number(item.stock).toLocaleString("en-PH"),
    Number(item.minStock).toLocaleString("en-PH"),
    Math.max(Number(item.minStock) - Number(item.stock), 0).toLocaleString("en-PH"),
  ]);
  const topProducts = report.topProducts.map((item, index) => [
    String(index + 1),
    item.name,
    item.sku,
    Number(item.unitsSold).toLocaleString("en-PH"),
    currency(item.revenue),
  ]);

  const salesSection: ReportSection = {
    title: "Sales items",
    headers: ["Order No.", "Date", "Product", "SKU", "Qty", "Price", "Cost", "Total", "Profit"],
    rows: sales,
    emptyMessage: "No sales items match the selected filters.",
  };
  const inventorySection: ReportSection = {
    title: "Inventory items",
    headers: ["Product", "SKU", "On hand", "Unit cost", "Retail price", "Stock cost value"],
    rows: inventory,
    emptyMessage: "No inventory items match the selected filters.",
  };
  const lowStockSection: ReportSection = {
    title: "Items to restock",
    headers: ["Product", "SKU", "On hand", "Minimum stock", "Units to restock"],
    rows: lowStock,
    emptyMessage: "No items need restocking for the selected filters.",
  };
  const topProductsSection: ReportSection = {
    title: "Best-selling products",
    headers: ["Rank", "Product", "SKU", "Units sold", "Sales revenue"],
    rows: topProducts,
    emptyMessage: "No product sales match the selected filters.",
  };

  const directStockOut = report.directStockOut;
  const directStockOutReasons: ReportSection = {
    title: "Stock-out by reason",
    headers: ["Reason", "Entries", "Units removed", "Estimated loss", "Unvalued entries"],
    rows: (directStockOut?.reasonBreakdown ?? []).map((group) => [
      getDirectStockOutReasonLabel(group.reason),
      group.entries.toLocaleString("en-PH"),
      group.units.toLocaleString("en-PH"),
      currency(group.estimatedValue),
      group.unvaluedEntries.toLocaleString("en-PH"),
    ]),
    emptyMessage: "No stock-out entries match the selected filters.",
  };
  const directStockOutTransactions: ReportSection = {
    title: "Direct stock-out transactions",
    headers: ["Date and time", "Product", "SKU", "Reason", "Qty", "Stock before", "Stock after", "Unit cost", "Estimated loss", "Recorded by", "Remarks"],
    rows: (directStockOut?.transactions ?? []).map((record) => [
      new Date(record.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      record.productDisplayName,
      record.variantSku ?? "—",
      getDirectStockOutReasonLabel(record.reason),
      Number(record.quantity).toLocaleString("en-PH"),
      record.stockBefore == null ? "—" : Number(record.stockBefore).toLocaleString("en-PH"),
      record.stockAfter == null ? "—" : Number(record.stockAfter).toLocaleString("en-PH"),
      record.unitCostSnapshot == null ? "Unvalued" : currency(record.unitCostSnapshot),
      record.estimatedLossValue == null ? "Unvalued" : currency(record.estimatedLossValue),
      record.performedByName || "System",
      record.remarks || "—",
    ]),
    emptyMessage: "No stock-out transactions match the selected filters.",
  };

  if (type === "INVENTORY") return [inventorySection];
  if (type === "SALES") return [salesSection];
  if (type === "LOW_STOCK") return [lowStockSection];
  if (type === "TOP_PRODUCTS") return [topProductsSection];
  if (type === "DIRECT_STOCK_OUT") return [directStockOutReasons, directStockOutTransactions];

  const sections: ReportSection[] = [];
  if (!hasSearchFilter) {
    sections.push(
      {
        title: "Sales by channel",
        headers: ["Channel", "Orders", "Sales revenue"],
        rows: channels,
        emptyMessage: "No channel sales match the selected filters.",
      },
      {
        title: "Payments",
        headers: ["Payment method", "Orders", "Amount collected"],
        rows: payments,
        emptyMessage: "No payments match the selected filters.",
      },
    );
  }
  sections.push(salesSection, inventorySection, lowStockSection, topProductsSection);
  return sections;
}

export function filterReportDocumentData<T extends ReportDocumentData>(
  report: T,
  searchTerm: string,
): T {
  const query = searchTerm.trim().toLocaleLowerCase();
  if (!query) return report;

  const matches = (...values: Array<string | number>) =>
    values.some((value) => String(value).toLocaleLowerCase().includes(query));
  const inventoryItems = report.inventoryItems.filter((item) => matches(item.name, item.sku));
  const lowStock = report.lowStock.filter((item) => matches(item.name, item.sku));
  const topProducts = report.topProducts.filter((item) => matches(item.name, item.sku));
  const recentOrders = report.recentOrders.flatMap((order) => {
    const orderMatches = matches(order.orderNumber);
    const items = order.items.filter((item) => orderMatches || matches(item.productName, item.sku));
    if (!items.length) return [];

    const total = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const grossProfit = items.reduce((sum, item) => sum + Number(item.grossProfit || 0), 0);
    const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return [{ ...order, items, totalAmount: total.toFixed(2), grossProfit, itemCount }];
  });

  const salesItems = recentOrders.flatMap((order) => order.items);
  const totalRevenue = salesItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const grossProfit = salesItems.reduce((sum, item) => sum + Number(item.grossProfit || 0), 0);
  const totalItemsSold = salesItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const stockValue = inventoryItems.reduce((sum, item) => sum + Number(item.stockValue || 0), 0);
  const retailValue = inventoryItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.stock || 0),
    0,
  );
  const filteredReport = {
    ...report,
    inventoryItems,
    lowStock,
    topProducts,
    recentOrders,
    channelBreakdown: {},
    paymentBreakdown: {},
    summary: {
      ...report.summary,
      totalRevenue,
      grossProfit,
      completedOrders: recentOrders.length,
      totalItemsSold,
      stockValue,
      retailValue,
      activeProducts: inventoryItems.length,
      lowStockCount: lowStock.length,
    },
  };

  return filteredReport as T;
}
