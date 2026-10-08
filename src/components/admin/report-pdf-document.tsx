import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

type ReportType = "ALL" | "INVENTORY" | "SALES" | "LOW_STOCK" | "TOP_PRODUCTS";

type ReportData = {
  summary: {
    totalRevenue: number;
    completedOrders: number;
    totalItemsSold: number;
    stockValue: number;
    retailValue: number;
    activeProducts: number;
    lowStockCount?: number;
  };
  recentOrders: Array<{
    orderNumber: string;
    totalAmount: string;
    createdAt: string;
    items: Array<{ productName: string; quantity: number }>;
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
};

type ReportPdfDocumentProps = {
  report: ReportData;
  reportType: ReportType;
  reportTitle: string;
  periodLabel: string;
  categoryLabel: string;
  generatedAt: Date;
};

type ReportSection = {
  title: string;
  headers: string[];
  rows: string[][];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 78,
    paddingBottom: 54,
    paddingHorizontal: 34,
    backgroundColor: "#ffffff",
    color: "#17211b",
    fontFamily: "Helvetica",
    fontSize: 8,
  },
  header: {
    position: "absolute",
    top: 22,
    left: 34,
    right: 34,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#d5ded6",
  },
  brand: { fontSize: 12, fontWeight: 700, color: "#174c37" },
  subtitle: { marginTop: 3, fontSize: 7, color: "#526257" },
  reportTitle: { marginTop: 8, fontSize: 14, fontWeight: 700, color: "#142a20" },
  scope: { marginTop: 3, fontSize: 7, color: "#526257" },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 9,
    fontWeight: 700,
    color: "#26332b",
  },
  summaryTable: { width: "100%", marginBottom: 4 },
  summaryHeader: {
    flexDirection: "row",
    backgroundColor: "#eef2ee",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5cd",
  },
  summaryHeaderCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 4, fontSize: 7, fontWeight: 700, color: "#405148" },
  summaryRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dce5dd" },
  summaryLabel: { flex: 1, paddingVertical: 5, paddingHorizontal: 4, fontSize: 8, color: "#26332b" },
  summaryValue: { width: "35%", paddingVertical: 5, paddingHorizontal: 4, textAlign: "right", fontSize: 8, fontWeight: 700, color: "#17211b" },
  table: { width: "100%", marginBottom: 6 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#eef2ee",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5cd",
  },
  headerCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 4,
    color: "#405148",
    fontSize: 7,
    fontWeight: 700,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dce5dd",
    minHeight: 19,
  },
  cell: { flex: 1, paddingVertical: 5, paddingHorizontal: 4, fontSize: 7, color: "#26332b" },
  empty: { padding: 8, fontSize: 8, color: "#526257" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#d5ded6",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#526257",
  },
});

const currency = (value: number | string) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function createSections(report: ReportData, type: ReportType): ReportSection[] {
  const inventory = report.inventoryItems.map((item) => [
    item.name,
    item.sku,
    String(item.stock),
    currency(item.cost),
    currency(item.price),
    currency(item.stockValue),
  ]);
  const sales = report.recentOrders.map((order) => [
    order.orderNumber,
    new Date(order.createdAt).toLocaleDateString("en-PH"),
    order.items.map((item) => `${item.productName} (x${item.quantity})`).join(", ") || "—",
    String(order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
    currency(order.totalAmount),
  ]);
  const channels = Object.entries(report.channelBreakdown).map(([name, values]) => [
    name,
    String(values.count),
    currency(values.revenue),
  ]);
  const payments = Object.entries(report.paymentBreakdown).map(([name, values]) => [
    name,
    String(values.count),
    currency(values.revenue),
  ]);
  const lowStock = report.lowStock.map((item) => [
    item.name,
    item.sku,
    String(item.stock),
    String(item.minStock),
    String(Math.max(item.minStock - item.stock, 0)),
  ]);
  const topProducts = report.topProducts.map((item, index) => [
    String(index + 1),
    item.name,
    item.sku,
    String(item.unitsSold),
    currency(item.revenue),
  ]);

  if (type === "INVENTORY") {
    return [{ title: "Inventory valuation and stock ledger", headers: ["Product / variant", "SKU", "Stock", "Unit cost", "Retail price", "Stock value"], rows: inventory }];
  }
  if (type === "SALES") {
    return [
      { title: "Sales channel breakdown", headers: ["Channel", "Orders", "Revenue"], rows: channels },
      { title: "Payment method breakdown", headers: ["Payment method", "Orders", "Revenue"], rows: payments },
      { title: "Completed orders", headers: ["Order", "Date", "Items", "Qty", "Total"], rows: sales },
    ];
  }
  if (type === "LOW_STOCK") {
    return [{ title: "Low stock alerts", headers: ["Product / variant", "SKU", "In stock", "Minimum", "Deficit"], rows: lowStock }];
  }
  if (type === "TOP_PRODUCTS") {
    return [{ title: "Top performing products", headers: ["Rank", "Product / variant", "SKU", "Units sold", "Revenue"], rows: topProducts }];
  }
  return [
    { title: "Sales channel breakdown", headers: ["Channel", "Orders", "Revenue"], rows: channels },
    { title: "Payment method breakdown", headers: ["Payment method", "Orders", "Revenue"], rows: payments },
    { title: "Completed orders", headers: ["Order", "Date", "Items", "Qty", "Total"], rows: sales },
    { title: "Inventory snapshot", headers: ["Product / variant", "SKU", "Stock", "Unit cost", "Retail price", "Stock value"], rows: inventory },
    { title: "Low stock snapshot", headers: ["Product / variant", "SKU", "In stock", "Minimum"], rows: lowStock.map((row) => row.slice(0, 4)) },
    { title: "Top products", headers: ["Rank", "Product / variant", "SKU", "Units sold", "Revenue"], rows: topProducts },
  ];
}

export default function ReportPdfDocument({
  report,
  reportType,
  reportTitle,
  periodLabel,
  categoryLabel,
  generatedAt,
}: ReportPdfDocumentProps) {
  const sections = createSections(report, reportType);
  const summary = [
    ["Gross revenue", currency(report.summary.totalRevenue)],
    ["Completed orders", String(report.summary.completedOrders)],
    ["Units sold", String(report.summary.totalItemsSold)],
    ["Stock value", currency(report.summary.stockValue)],
    ["Retail value", currency(report.summary.retailValue)],
    ["Low stock items", String(report.summary.lowStockCount ?? report.lowStock.length)],
  ];

  return (
    <Document title={reportTitle} author="Apayao Pasalubong Center">
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>Apayao Pasalubong Center</Text>
          <Text style={styles.subtitle}>San Isidro Sur, Luna, Apayao, Philippines</Text>
          <Text style={styles.reportTitle}>{reportTitle}</Text>
          <Text style={styles.scope}>
            Period: {periodLabel}  |  Category: {categoryLabel}  |  Generated: {generatedAt.toLocaleString("en-PH")}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Report summary</Text>
        <View style={styles.summaryTable}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryHeaderCell}>METRIC</Text>
            <Text style={[styles.summaryHeaderCell, { textAlign: "right" }]}>VALUE</Text>
          </View>
          {summary.map(([label, value]) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>

        {sections.map((section) => (
          <View key={section.title} wrap>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                {section.headers.map((header) => <Text key={header} style={styles.headerCell}>{header}</Text>)}
              </View>
              {section.rows.length ? section.rows.map((row, index) => (
                <View key={`${section.title}-${index}`} style={styles.row} wrap={false}>
                  {row.map((value, cellIndex) => <Text key={`${index}-${cellIndex}`} style={styles.cell}>{value}</Text>)}
                </View>
              )) : <Text style={styles.empty}>No records found for this section.</Text>}
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>Apayao Pasalubong Center | Internal report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
