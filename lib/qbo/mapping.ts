/**
 * Pure SqFt → QBO entity builders. No I/O — everything the sync engine sends
 * to QBO is built here so the wire shapes are unit-testable in isolation.
 *
 * Invoices are built FROM THE FROZEN SNAPSHOT (the exact document the
 * customer saw), never recomputed: the books must match the customer doc.
 * Lines are the snapshot's prorated, markup-folded lines billed against the
 * org's single Service item; no markup row exists in the snapshot and none
 * is emitted here.
 */

import type { InvoiceSnapshot } from "@/lib/invoices/types";

/** Sales-tax contract the P0 tax project will freeze into snapshots
 *  (see specs/2026-07-23-qbo-sync-plan.md §2). All optional until then —
 *  a snapshot without tax maps to an invoice without TxnTaxDetail. */
export interface SnapshotTax {
  taxRate?: number;
  taxableSubtotal?: number;
  taxAmount?: number;
}

export type TaxableInvoiceSnapshot = InvoiceSnapshot & {
  totals: InvoiceSnapshot["totals"] & SnapshotTax;
};

export interface QboRef {
  value: string;
}

export interface QboCustomerBody {
  Id?: string;
  SyncToken?: string;
  sparse?: boolean;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: { Line1: string };
}

export interface QboInvoiceLine {
  DetailType: "SalesItemLineDetail";
  Amount: number;
  Description?: string;
  SalesItemLineDetail: {
    ItemRef: QboRef;
    TaxCodeRef?: QboRef;
  };
}

export interface QboInvoiceBody {
  DocNumber: string;
  TxnDate: string;
  DueDate?: string;
  CustomerRef: QboRef;
  Line: QboInvoiceLine[];
  PrivateNote?: string;
  TxnTaxDetail?: { TotalTax: number };
}

export interface QboPaymentBody {
  TotalAmt: number;
  TxnDate: string;
  CustomerRef: QboRef;
  PaymentRefNum: string;
  PrivateNote?: string;
  Line: Array<{
    Amount: number;
    LinkedTxn: Array<{ TxnId: string; TxnType: "Invoice" }>;
  }>;
}

export interface CustomerSyncSource {
  name: string;
  email: string | null;
  phone: string | null;
  /** Primary location's one-line address, if any. */
  address: string | null;
}

export function buildQboCustomer(
  source: CustomerSyncSource,
  displayName = source.name
): QboCustomerBody {
  return {
    DisplayName: displayName,
    ...(source.email ? { PrimaryEmailAddr: { Address: source.email } } : {}),
    ...(source.phone ? { PrimaryPhone: { FreeFormNumber: source.phone } } : {}),
    ...(source.address ? { BillAddr: { Line1: source.address } } : {}),
  };
}

/** DocNumber candidates, in preference order: the plain SqFt invoice number
 *  (matches the customer-facing document), then a prefixed fallback for
 *  companies whose books already use that number (duplicate-check on, or a
 *  foreign invoice found under it). */
export function docNumberCandidates(invoiceNumber: number): string[] {
  return [String(invoiceNumber), `SQFT-${invoiceNumber}`];
}

function isoDay(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
}

function lineDescription(name: string, description: string | null): string {
  return description ? `${name} — ${description}` : name;
}

export function buildQboInvoice(args: {
  snapshot: TaxableInvoiceSnapshot;
  customerQboId: string;
  itemId: string;
  docNumber: string;
}): QboInvoiceBody {
  const { snapshot } = args;
  const taxAmount = snapshot.totals.taxAmount ?? 0;
  const hasTax = taxAmount > 0;

  return {
    DocNumber: args.docNumber,
    TxnDate: snapshot.date.slice(0, 10),
    ...(isoDay(snapshot.dueDate) ? { DueDate: isoDay(snapshot.dueDate) } : {}),
    CustomerRef: { value: args.customerQboId },
    Line: snapshot.lines.map((line) => ({
      DetailType: "SalesItemLineDetail" as const,
      Amount: line.amount,
      Description: lineDescription(line.name, line.description),
      SalesItemLineDetail: {
        ItemRef: { value: args.itemId },
        // With tax present, mark lines taxable and override the total below
        // so the books equal what the customer was actually billed (never
        // let AST recompute a divergent amount). Without tax, explicit NON.
        TaxCodeRef: { value: hasTax ? "TAX" : "NON" },
      },
    })),
    ...(snapshot.memo ? { PrivateNote: snapshot.memo } : {}),
    ...(hasTax ? { TxnTaxDetail: { TotalTax: taxAmount } } : {}),
  };
}

export interface PaymentSyncSource {
  /** SqFt Payment.id — the idempotency key, carried as PaymentRefNum. */
  paymentId: number;
  amount: number;
  paidAt: string;
  method: string;
  reference: string | null;
}

/** Queryable idempotency key for a synced payment (PaymentRefNum is
 *  queryable in QBO; PrivateNote is not). */
export function paymentRefNum(paymentId: number): string {
  return `SQFT-P${paymentId}`;
}

export function buildQboPayment(args: {
  source: PaymentSyncSource;
  customerQboId: string;
  invoiceQboId: string;
}): QboPaymentBody {
  const { source } = args;
  const note = [source.method, source.reference].filter(Boolean).join(" ");
  return {
    TotalAmt: source.amount,
    TxnDate: source.paidAt.slice(0, 10),
    CustomerRef: { value: args.customerQboId },
    PaymentRefNum: paymentRefNum(source.paymentId),
    ...(note ? { PrivateNote: note } : {}),
    Line: [
      {
        Amount: source.amount,
        LinkedTxn: [{ TxnId: args.invoiceQboId, TxnType: "Invoice" }],
      },
    ],
  };
}
