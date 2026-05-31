import type { LineItemCalc, RoomItem } from "@/lib/utils";

export type { LineItemCalc, RoomItem };

/** Canonical input for estimate math. Decoupled from Prisma row shapes — every
 *  caller (Prisma row, public-estimate payload, editor form state) is mapped to
 *  this before invoking compute/snapshot. */
export interface EstimateInput {
  lineItems: LineItemCalc[];
  /** Mixed room + note items, as stored on the siteMeasure. `computeEstimateView`
   *  filters to `type === "room"` internally; `snapshotEstimate` preserves
   *  notes so the signed artifact reflects the customer's full layout. */
  items: RoomItem[];
  /** Markup as a percentage value, e.g. `20` for 20%. Matches Prisma column. */
  markupPct: number;
  /** Convenience fee as a decimal rate, e.g. `0.03` for 3%. Matches Prisma column. */
  convenienceFeeRate: number;
  /** Deposit as a decimal rate, e.g. `0.5` for 50%. Matches Prisma column. */
  depositPct: number;
}

export interface LineView {
  id: number;
  /** Resolved quantity after waste% and room linkage. `null` when a linked
   *  line item has no resolvable rooms or a manual line has no qty entered. */
  effectiveQty: number | null;
  /** Line subtotal = effectiveQty × rate. `null` when qty is null. */
  subtotal: number | null;
}

export interface EstimateView {
  lines: LineView[];
  /** Sum of resolved line subtotals. Unresolved lines contribute `0`; callers
   *  read `hasUnresolvedLines` if they need to warn or refuse to proceed. */
  subtotal: number;
  /** subtotal × markupPct / 100 */
  markup: number;
  /** subtotal + markup */
  beforeFee: number;
  /** beforeFee × convenienceFeeRate */
  convenienceFee: number;
  /** beforeFee + convenienceFee */
  total: number;
  /** total × depositPct */
  deposit: number;
  /** True iff any line item's qty could not be resolved. */
  hasUnresolvedLines: boolean;
}
