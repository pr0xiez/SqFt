import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Estimate } from "@/lib/hooks/useEstimates";
import type { Org } from "@/lib/hooks/useOrg";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { getEffectiveQty, liSubtotal } from "@/lib/utils";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 48,
    paddingRight: 48,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  orgBlock: {
    flexDirection: "column",
    maxWidth: 240,
  },
  logo: {
    width: 80,
    height: 36,
    objectFit: "contain",
    marginBottom: 6,
  },
  orgName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginBottom: 3,
  },
  orgDetail: {
    fontSize: 9,
    color: "#555",
    marginBottom: 1,
  },
  docBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  docType: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    letterSpacing: 2,
    color: "#1a1a1a",
    marginBottom: 4,
  },
  docNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#444",
    marginBottom: 2,
  },
  docDate: {
    fontSize: 9,
    color: "#666",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    marginBottom: 20,
  },
  customerSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 8,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  customerName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: 9,
    color: "#555",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#efefef",
  },
  colHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  col1: { width: "42%", paddingRight: 6 },
  col2: { width: "14%", textAlign: "right", paddingRight: 6 },
  col3: { width: "12%", textAlign: "center", paddingRight: 6 },
  col4: { width: "16%", textAlign: "right", paddingRight: 6 },
  col5: { width: "16%", textAlign: "right" },
  totalsSection: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    marginBottom: 4,
    minWidth: 200,
  },
  totalLabel: {
    width: 130,
    textAlign: "right",
    paddingRight: 12,
    color: "#555",
    fontSize: 9,
  },
  totalValue: {
    width: 70,
    textAlign: "right",
    fontSize: 9,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    paddingTop: 6,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#1a1a1a",
  },
  grandTotalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#1a1a1a",
  },
  depositRow: {
    marginTop: 8,
  },
  depositLabel: {
    color: "#2a6e4a",
  },
  depositValue: {
    color: "#2a6e4a",
  },
  docDueDate: {
    fontSize: 9,
    color: "#a13f3f",
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
  },
  paymentSection: {
    marginTop: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  paymentLabel: {
    fontSize: 8,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  paymentText: {
    fontSize: 9,
    color: "#444",
    marginBottom: 2,
  },
});

function fmt(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export type PdfMode = "quote" | "invoice";

interface Props {
  estimate: Estimate;
  org: Org;
  mode?: PdfMode;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function EstimatePdfDoc({ estimate, org, mode = "quote" }: Props) {
  const rooms = (estimate.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );
  const lineItems = (estimate.lineItems ?? []) as LineItemCalc[];

  const subtotal = lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const markup = subtotal * (estimate.markupPct / 100);
  const beforeTax = subtotal + markup;
  const tax = beforeTax * estimate.taxRate;
  const total = beforeTax + tax;
  const deposit = total * estimate.depositPct;

  const isInvoice = mode === "invoice";
  const docType = isInvoice ? "INVOICE" : "QUOTE";
  const invoicePrefix = org.invoicePrefix?.trim() || "INV";
  const docNumber = isInvoice
    ? estimate.invoiceNumber
      ? `${invoicePrefix}-${estimate.invoiceNumber}`
      : `#${estimate.id}`
    : estimate.quoteNumber
      ? `Q-${estimate.quoteNumber}`
      : `#${estimate.id}`;
  const issuedAt =
    isInvoice && estimate.invoicedAt ? estimate.invoicedAt : estimate.date;
  const dateStr = formatDate(issuedAt);
  const dueDateStr =
    isInvoice && estimate.dueDate ? formatDate(estimate.dueDate) : null;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.orgBlock}>
            {org.logo ? <Image src={org.logo} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{org.name}</Text>
            {org.address ? (
              <Text style={styles.orgDetail}>{org.address}</Text>
            ) : null}
            {org.phone ? (
              <Text style={styles.orgDetail}>{org.phone}</Text>
            ) : null}
            {org.licenseNumber ? (
              <Text style={styles.orgDetail}>Lic# {org.licenseNumber}</Text>
            ) : null}
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docType}>{docType}</Text>
            <Text style={styles.docNumber}>{docNumber}</Text>
            <Text style={styles.docDate}>{dateStr}</Text>
            {dueDateStr ? (
              <Text style={styles.docDueDate}>Due {dueDateStr}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer */}
        <View style={styles.customerSection}>
          <Text style={styles.sectionLabel}>Bill To</Text>
          <Text style={styles.customerName}>
            {estimate.customer?.name ?? ""}
          </Text>
          {estimate.customer?.address ? (
            <Text style={styles.customerDetail}>
              {estimate.customer.address}
            </Text>
          ) : null}
        </View>

        {/* Line items */}
        {lineItems.length > 0 ? (
          <View>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.col1, styles.colHeader]}>Description</Text>
              <Text style={[styles.col2, styles.colHeader]}>Qty</Text>
              <Text style={[styles.col3, styles.colHeader]}>Unit</Text>
              <Text style={[styles.col4, styles.colHeader]}>Rate</Text>
              <Text style={[styles.col5, styles.colHeader]}>Subtotal</Text>
            </View>
            {lineItems.map((li) => {
              const qty = getEffectiveQty(li, rooms);
              const sub = liSubtotal(li, rooms);
              return (
                <View key={li.id} style={styles.tableRow}>
                  <Text style={styles.col1}>{li.name}</Text>
                  <Text style={styles.col2}>
                    {qty != null ? qty.toFixed(2) : "—"}
                  </Text>
                  <Text style={styles.col3}>{li.unitLabel}</Text>
                  <Text style={styles.col4}>{fmt(li.rate)}</Text>
                  <Text style={styles.col5}>
                    {sub != null ? fmt(sub) : "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
          </View>
          {estimate.markupPct > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Markup ({estimate.markupPct}%)
              </Text>
              <Text style={styles.totalValue}>{fmt(markup)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Tax ({(estimate.taxRate * 100).toFixed(1)}%)
            </Text>
            <Text style={styles.totalValue}>{fmt(tax)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={[styles.totalLabel, styles.grandTotalLabel]}>
              Total
            </Text>
            <Text style={[styles.totalValue, styles.grandTotalValue]}>
              {fmt(total)}
            </Text>
          </View>
          {!isInvoice && estimate.depositPct > 0 ? (
            <View style={[styles.totalRow, styles.depositRow]}>
              <Text style={[styles.totalLabel, styles.depositLabel]}>
                Deposit ({(estimate.depositPct * 100).toFixed(0)}% due)
              </Text>
              <Text style={[styles.totalValue, styles.depositValue]}>
                {fmt(deposit)}
              </Text>
            </View>
          ) : null}
        </View>

        {isInvoice ? (
          <View style={styles.paymentSection}>
            <Text style={styles.paymentLabel}>Payment Instructions</Text>
            <Text style={styles.paymentText}>
              Please remit payment by the due date listed above. Make checks
              payable to {org.name}.
            </Text>
            {org.phone ? (
              <Text style={styles.paymentText}>
                Questions? Contact us at {org.phone}.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
