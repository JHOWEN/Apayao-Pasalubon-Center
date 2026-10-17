import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  formatReportGeneratedAt,
  getReportSections,
  getReportSummaryRows,
  isReportNumericHeader,
  type ReportDocumentData,
  type ReportType,
} from "@/lib/report-document";

type ReportPdfDocumentProps = {
  report: ReportDocumentData;
  reportType: ReportType;
  reportTitle: string;
  periodLabel: string;
  categoryLabel: string;
  searchLabel: string;
  generatedAt: Date;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 92,
    paddingBottom: 42,
    paddingHorizontal: 38,
    backgroundColor: "#ffffff",
    color: "#17211b",
    fontFamily: "Helvetica",
    fontSize: 8,
  },
  header: {
    position: "absolute",
    top: 22,
    left: 38,
    right: 38,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#a8b8ad",
  },
  reportTitle: { fontSize: 15, fontWeight: 700, color: "#142a20", textAlign: "center" },
  brand: { marginTop: 4, fontSize: 9, fontWeight: 700, color: "#174c37", textAlign: "center" },
  address: { marginTop: 2, fontSize: 7, color: "#526257", textAlign: "center" },
  scope: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  scopeItem: { flexGrow: 1, flexBasis: 0, alignItems: "center", paddingRight: 8 },
  scopeLabel: { fontSize: 6, fontWeight: 700, color: "#526257", textTransform: "uppercase", textAlign: "center" },
  scopeValue: { marginTop: 2, fontSize: 7, color: "#17211b", textAlign: "center" },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 5,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5cd",
    fontSize: 9,
    fontWeight: 700,
    color: "#26332b",
    textAlign: "center",
  },
  directSectionTitle: { marginTop: 18, marginBottom: 8, textAlign: "left" },
  summary: { width: "100%", marginBottom: 2 },
  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e1e7e2",
  },
  summaryLabel: { flexGrow: 1, paddingVertical: 4, fontSize: 8, color: "#405148" },
  summaryValue: { width: "32%", paddingVertical: 4, textAlign: "right", fontSize: 8, fontWeight: 700, color: "#17211b" },
  directSummaryText: { paddingVertical: 6 },
  table: { width: "100%", marginBottom: 4 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#82948a",
  },
  headerCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 3, fontSize: 7, fontWeight: 700, color: "#405148", textAlign: "center" },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#d5ded6", minHeight: 20 },
  cell: { flex: 1, paddingVertical: 5, paddingHorizontal: 3, fontSize: 7, color: "#26332b" },
  cellRight: { textAlign: "right" },
  directTableCell: { paddingVertical: 6, paddingHorizontal: 4, fontSize: 6.5 },
  empty: { paddingVertical: 7, fontSize: 8, color: "#526257" },
  footer: {
    position: "absolute",
    bottom: 18,
    right: 38,
    fontSize: 7,
    color: "#526257",
  },
});

const salesColumnWidths = [18, 10, 20, 13, 7, 8, 8, 8, 8] as const;
const directStockOutColumnWidths = [13, 17, 8, 8, 5, 6, 6, 7, 8, 9, 13] as const;

function getColumnLayout(reportType: ReportType, columnCount: number, columnIndex: number) {
  const widths = reportType === "DIRECT_STOCK_OUT"
    ? directStockOutColumnWidths
    : salesColumnWidths;
  if (columnCount !== widths.length) return { flex: 1 };

  const width = `${widths[columnIndex]}%`;
  return { width, flexBasis: width, flexGrow: 0, flexShrink: 0 };
}

export default function ReportPdfDocument({
  report,
  reportType,
  reportTitle,
  periodLabel,
  categoryLabel,
  searchLabel,
  generatedAt,
}: ReportPdfDocumentProps) {
  const hasSearchFilter = searchLabel !== "Not applied";
  const sections = getReportSections(report, reportType, hasSearchFilter);
  const summary = getReportSummaryRows(report, reportType);

  return (
    <Document title={reportTitle} author={report.business.name}>
      <Page size={reportType === "DIRECT_STOCK_OUT" ? [936, 612] : [612, 936]} style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.reportTitle}>{reportTitle}</Text>
          <Text style={styles.brand}>{report.business.name}</Text>
          <Text style={styles.address}>{report.business.address}</Text>
          <View style={styles.scope}>
            {[
              ["Reporting period", periodLabel],
              ["Category", categoryLabel],
              ["Search", searchLabel],
              ["Generated", formatReportGeneratedAt(generatedAt)],
            ].map(([label, value]) => (
              <View key={label} style={styles.scopeItem}>
                <Text style={styles.scopeLabel}>{label}</Text>
                <Text style={styles.scopeValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, reportType === "DIRECT_STOCK_OUT" ? styles.directSectionTitle : undefined]}>Summary</Text>
        <View style={styles.summary}>
          {summary.map(([label, value]) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, reportType === "DIRECT_STOCK_OUT" ? styles.directSummaryText : undefined]}>{label}</Text>
              <Text style={[styles.summaryValue, reportType === "DIRECT_STOCK_OUT" ? styles.directSummaryText : undefined]}>{value}</Text>
            </View>
          ))}
        </View>

        {sections.map((section) => (
          <View key={section.title} wrap>
            <Text style={[styles.sectionTitle, reportType === "DIRECT_STOCK_OUT" ? styles.directSectionTitle : undefined]}>{section.title}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                {section.headers.map((header, columnIndex) => (
                  <Text key={header} style={[styles.headerCell, reportType === "DIRECT_STOCK_OUT" ? styles.directTableCell : undefined, getColumnLayout(reportType, section.headers.length, columnIndex)]}>
                    {header}
                  </Text>
                ))}
              </View>
              {section.rows.length ? section.rows.map((row, index) => (
                <View key={`${section.title}-${index}`} style={styles.row} wrap={false}>
                  {row.map((value, cellIndex) => (
                    <Text
                      key={`${index}-${cellIndex}`}
                      style={[
                        styles.cell,
                        reportType === "DIRECT_STOCK_OUT" ? styles.directTableCell : undefined,
                        getColumnLayout(reportType, section.headers.length, cellIndex),
                        isReportNumericHeader(section.headers[cellIndex] ?? "") ? styles.cellRight : undefined,
                      ]}
                    >
                      {value}
                    </Text>
                  ))}
                </View>
              )) : (
                <Text style={styles.empty}>{section.emptyMessage}</Text>
              )}
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
