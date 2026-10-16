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
  scopeValue: { marginTop: 2, fontSize: 7, color: "#17211b", maxLines: 1, textOverflow: "ellipsis", textAlign: "center" },
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
  summary: { width: "100%", marginBottom: 2 },
  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e1e7e2",
  },
  summaryLabel: { flexGrow: 1, paddingVertical: 4, fontSize: 8, color: "#405148", maxLines: 1, textOverflow: "ellipsis" },
  summaryValue: { width: "32%", paddingVertical: 4, textAlign: "right", fontSize: 8, fontWeight: 700, color: "#17211b", maxLines: 1, textOverflow: "ellipsis" },
  table: { width: "100%", marginBottom: 4 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#82948a",
  },
  headerCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 3, fontSize: 7, fontWeight: 700, color: "#405148", maxLines: 1, textOverflow: "ellipsis", textAlign: "center" },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#d5ded6", minHeight: 20 },
  cell: { flex: 1, paddingVertical: 5, paddingHorizontal: 3, fontSize: 7, color: "#26332b", maxLines: 1, textOverflow: "ellipsis" },
  cellRight: { textAlign: "right" },
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

function getColumnLayout(columnCount: number, columnIndex: number) {
  if (columnCount !== salesColumnWidths.length) return { flex: 1 };

  const width = `${salesColumnWidths[columnIndex]}%`;
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
      <Page size={[612, 936]} style={styles.page} wrap>
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

        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.summary}>
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
                {section.headers.map((header, columnIndex) => (
                  <Text key={header} style={[styles.headerCell, getColumnLayout(section.headers.length, columnIndex)]}>
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
                        getColumnLayout(section.headers.length, cellIndex),
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
