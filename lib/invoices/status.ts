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

/**
 * Why Void is unavailable once money is recorded. SqFt has no way to delete a
 * payment or record a refund, so the copy doesn't promise one. Shared by the
 * server's INVOICE_HAS_PAYMENTS error and the invoice page.
 */
export const VOID_BLOCKED_BY_PAYMENTS_MESSAGE =
  "This invoice has payments recorded, so it can't be voided. Payments can't be removed or refunded in SqFt yet.";

/**
 * Void: not already paid or void, and no payment recorded (manual or Stripe,
 * partial or full). Voiding drops an invoice from billing totals while its
 * payments stay recorded, so collected money would show as unbilled again and
 * QBO would be asked to void an invoice with a payment applied. `voidInvoice`
 * enforces the same rule server-side.
 */
export function canVoid(status: InvoiceStatus, hasPayments: boolean): boolean {
  return !isTerminal(status) && !hasPayments;
}
