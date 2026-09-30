import { foldMarkupIntoLines } from "@/lib/estimateView/markup";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices/statusFilter";
import { residualTargetIndex, round2 } from "@/lib/money";
import type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";

const OPEN_STATUS_SET = new Set<string>(OPEN_INVOICE_STATUSES);

/** Sum of recorded payment amounts. No rounding — callers round as needed. */
export function paymentsPaidTotal(
  payments: ReadonlyArray<{ amount: number }>
): number {
  return payments.reduce((s, p) => s + p.amount, 0);
}

/**
 * An invoice's live outstanding balance: amount minus payments recorded
 * against it, in dollars rounded to cents. **Balance due is the exception** to the frozen
 * snapshot (see Invoice in CONTEXT.md) — it is always computed live from the
 * payments ledger, never cached, so a partially-paid invoice never shows the
 * full amount as still owed.
 */
export function invoiceOutstanding(invoice: {
  amount: number;
  payments: ReadonlyArray<{ amount: number }>;
}): number {
  return round2(invoice.amount - paymentsPaidTotal(invoice.payments));
}

/**
 * Whether an invoice is overdue: its status is still "open" (sent, viewed, or
 * partial — see `OPEN_INVOICE_STATUSES`), it has a due date, and that due
 * date's UTC calendar day has fully elapsed. Stored due dates use UTC midnight.
 */
export function isInvoiceOverdue(invoice: {
  status: string;
  dueDate: string | Date | null;
}): boolean {
  if (!OPEN_STATUS_SET.has(invoice.status) || invoice.dueDate === null)
    return false;
  const due = new Date(invoice.dueDate);
  const endOfDueDay = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate() + 1
  );
  return Date.now() >= endOfDueDay;
}

/**
 * Tolerance applied to the overbill comparison so floating-point cents drift
 * (e.g. 4000.0000000001 vs a 4000 balance) does not falsely trip the guard.
 * This is billing policy and the SINGLE definition shared by the
 * Create-Invoice dialog's client-side guard (`lib/invoices/createInvoiceForm`)
 * and the server's create, paid-in-full, and Stripe overpayment checks
 * (`lib/repositories/invoiceRepo.ts`).
 */
export const OVERBILL_EPSILON = 0.005;

/**
 * Whether `amount` bills past the `unbilled` balance, with the shared
 * floating-point tolerance. Matches the server's overbill rule so the
 * dialog's guard and the persisted result never disagree (the server throws
 * `INVOICE_OVERBILL` on the same condition).
 */
export function isOverbill(amount: number, unbilled: number): boolean {
  return amount > unbilled + OVERBILL_EPSILON;
}

/** Estimate-level billing rollup. Voided invoices are ignored. */
export function computeEstimateBilling(
  estimateTotal: number | null,
  invoices: InvoiceLike[]
): EstimateBilling {
  const total = estimateTotal ?? 0;
  let invoiced = 0;
  let paid = 0;
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    invoiced += inv.amount;
    paid += inv.paidAmount;
  }
  invoiced = round2(invoiced);
  paid = round2(paid);
  return {
    total: round2(total),
    invoiced,
    unbilled: round2(Math.max(0, total - invoiced)),
    paid,
    outstanding: round2(invoiced - paid),
  };
}

/**
 * Prorate an estimate's labeled breakdown by `amount / estimateTotal`, then
 * reconcile rounding onto the largest row so the displayed rows sum EXACTLY to
 * `amount`. Markup is folded into each line's price (never its own row).
 * Putting the residual on the largest row keeps the ±cent off any $0 (free)
 * line. Unresolved lines (no resolvable price) are omitted from the breakdown
 * rather than billed as $0.
 */
export function prorateInvoice(
  source: ProrationSource,
  amount: number
): ProratedBreakdown {
  const estimateTotal = source.view.total;
  const ratio = estimateTotal === 0 ? 0 : amount / estimateTotal;
  const folded = foldMarkupIntoLines(source.view);

  // Re-pair line metadata to the computed view line BY ID, not by array
  // position. `folded[idx]` ↔ `view.lines[idx]` is aligned by construction
  // (both derive from the same `view`), but `lineMeta` is a separate array, so
  // join it to the view by id to avoid silently billing the wrong name on a row
  // if the two ever diverge in order/count.
  const metaById = new Map<
    (typeof source.lineMeta)[number]["id"],
    (typeof source.lineMeta)[number]
  >(source.lineMeta.map((m) => [m.id, m]));

  const rows: ProratedLine[] = [];
  source.view.lines.forEach((line, idx) => {
    const priced = folded[idx];
    // Unresolved line (no resolvable price): omit it rather than bill $0, so it
    // is never confused with a deliberate $0 (free) line. The builder is warned
    // separately (InvoicesSection) that such lines won't be billed.
    if (priced == null) return;
    const meta = metaById.get(line.id);
    rows.push({
      name: meta?.name ?? `Item ${idx + 1}`,
      description: meta?.description ?? null,
      amount: round2(priced * ratio),
    });
  });
  // Reconcile: force the sum to equal `amount` by adjusting the largest row, so
  // the ±cent never distorts a $0 (free) line.
  const target = round2(amount);
  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const drift = round2(target - sum);
  if (drift !== 0) {
    const i = residualTargetIndex(rows.map((r) => r.amount));
    if (i !== -1) rows[i].amount = round2(rows[i].amount + drift);
  }

  return { ratio, lines: rows, total: target };
}
