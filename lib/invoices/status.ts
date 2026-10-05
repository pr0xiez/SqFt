import { OPEN_INVOICE_STATUSES } from "@/lib/invoices/statusFilter";

/** Every persisted invoice lifecycle status. */
export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "void",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Statuses that accept no further action. */
const TERMINAL: readonly InvoiceStatus[] = ["paid", "void"];

const OPEN = new Set<InvoiceStatus>(OPEN_INVOICE_STATUSES);

/** Fully paid or voided: the lifecycle is over. */
export function isTerminal(status: InvoiceStatus): boolean {
  return TERMINAL.includes(status);
}

/** First send: only a draft has never gone out. */
export function canSend(status: InvoiceStatus): boolean {
  return status === "draft";
}

/** Re-send: any non-draft invoice that is not void. */
export function canResend(status: InvoiceStatus): boolean {
  return status !== "draft" && status !== "void";
}

/** Record a payment: only invoices that are out and still open. */
export function canPay(status: InvoiceStatus): boolean {
  return OPEN.has(status);
}

/** Void: anything not already paid or void. */
export function canVoid(status: InvoiceStatus): boolean {
  return !isTerminal(status);
}
