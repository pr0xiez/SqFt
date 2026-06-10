import { round2 } from "@/lib/money";

/**
 * The three ways the Create-Invoice dialog lets a contractor size a new invoice
 * against the estimate's unbilled balance:
 * - `remaining` — bill the entire unbilled balance.
 * - `pct` — bill a percent of the unbilled balance (NOT the estimate total;
 *   the dialog always resolves this to a flat dollar amount before POSTing).
 * - `flat` — bill an explicit dollar amount.
 */
export type InvoiceFormMode = "remaining" | "pct" | "flat";

/**
 * Tolerance applied to the overbill comparison so floating-point cents drift
 * (e.g. 4000.0000000001 vs a 4000 balance) does not falsely trip the guard.
 * This is billing policy and the SINGLE definition shared by the dialog's
 * client-side guard and the server's create/patch overbill check
 * (`lib/repositories/invoiceRepo.ts`).
 */
export const OVERBILL_EPSILON = 0.005;

export interface DeriveInvoiceAmountArgs {
  mode: InvoiceFormMode;
  /** Estimate's remaining unbilled balance, in dollars. */
  unbilled: number;
  /** Raw `pct` field value (a string from a number input); parsed here. */
  pct?: string;
  /** Raw `flat` field value (a string from a number input); parsed here. */
  flat?: string;
}

/**
 * Resolve the dollar amount a Create-Invoice form should submit, rounded to
 * cents. Owns the mode→amount mapping for the dialog so the live preview and
 * the value actually POSTed are computed by one definition. `pct`/`flat` arrive
 * as raw input strings; an empty/NaN field falls back to 0.
 */
export function deriveInvoiceAmount({
  mode,
  unbilled,
  pct,
  flat,
}: DeriveInvoiceAmountArgs): number {
  switch (mode) {
    case "remaining":
      return round2(unbilled);
    case "pct":
      return round2((unbilled * (Number.parseFloat(pct ?? "") || 0)) / 100);
    case "flat":
      return round2(Number.parseFloat(flat ?? "") || 0);
  }
}

/** Unbilled balance left after billing `amount`, rounded to cents. */
export function invoiceLeaves(unbilled: number, amount: number): number {
  return round2(unbilled - amount);
}

/**
 * Whether `amount` bills past the `unbilled` balance, with the shared
 * floating-point tolerance. Matches the server's overbill rule so the dialog's
 * guard and the persisted result never disagree (the server throws
 * `INVOICE_OVERBILL` on the same condition).
 */
export function isOverbill(amount: number, unbilled: number): boolean {
  return amount > unbilled + OVERBILL_EPSILON;
}
