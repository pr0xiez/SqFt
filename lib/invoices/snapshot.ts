import { prorateInvoice } from "./compute";
import type {
  InvoiceSnapshot,
  InvoiceSnapshotMeta,
  ProrationSource,
} from "./types";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/** Freeze the customer-facing invoice artifact: identity + prorated lines +
 *  balance-due totals. Proration runs internally so the document can never
 *  diverge from the math used elsewhere. */
export function snapshotInvoice(
  source: ProrationSource,
  meta: InvoiceSnapshotMeta
): InvoiceSnapshot {
  const breakdown = prorateInvoice(source, meta.amount);
  return {
    invoiceNumber: meta.invoiceNumber,
    date: iso(meta.date) as string,
    dueDate: iso(meta.dueDate),
    memo: meta.memo,
    terms: meta.terms,
    paymentInstructions: meta.paymentInstructions,
    pct: meta.pct,
    amount: meta.amount,
    customer: meta.customer,
    org: meta.org,
    stripePaymentLinkUrl: meta.stripePaymentLinkUrl,
    lines: breakdown.lines,
    totals: {
      subtotal: source.view.subtotal,
      markup: source.view.markup,
      balanceDue: meta.amount,
    },
  };
}
