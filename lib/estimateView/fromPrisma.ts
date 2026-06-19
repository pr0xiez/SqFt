import { type LineItemCalc, parseQtyMode, type RoomItem } from "@/lib/utils";
import type { EstimateInput } from "./types";

/** A money/number column as Prisma may hand it back: a plain `number` today
 *  (Float columns) or a `Decimal`-like object once these columns migrate to
 *  Postgres `numeric`. Decimal instances stringify to their exact value, so
 *  `toNum` reconstructs the JS number via `Number(...)` without pulling in the
 *  Prisma runtime. */
type Numeric = number | { toString(): string } | null | undefined;

/** Coerce a Prisma numeric column (Float `number` or `Decimal`) to a JS number.
 *  Keeps the estimate-view math number-based regardless of the column's storage
 *  type, so a Float→Decimal schema migration needs no change to the SSOT math. */
function toNum(value: Numeric): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

/** Same as `toNum` but preserves `null` (for nullable money columns like
 *  `LineItem.qty`). */
function toNumOrNull(value: Numeric): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

/** Minimal shape of a Prisma `LineItem` row — just the columns the view needs. */
interface PrismaLineItemRow {
  id: number;
  name: string;
  description?: string | null;
  rate: Numeric;
  qtyMode: string;
  qty: Numeric;
  wastePct: Numeric;
  unitLabel: string;
  linkedRoomIds: number[];
  sortOrder?: number;
}

/** Minimal shape of a Prisma `SiteMeasureItem` row. */
interface PrismaEstimateItemRow {
  id: number;
  type: string;
  name?: string | null;
  shape?: string | null;
  w?: number | null;
  l?: number | null;
  note?: string | null;
  text?: string | null;
}

export interface PrismaEstimateForView {
  markupPct: Numeric;
  convenienceFeeRate: Numeric;
  depositPct: Numeric;
  lineItems: PrismaLineItemRow[];
  siteMeasure: { items: PrismaEstimateItemRow[] };
}

/** Map a Prisma estimate payload (any of the standard includes that bring
 *  lineItems + siteMeasure.items) into the canonical `EstimateInput`. Replaces
 *  the `as LineItemCalc[]` / `as RoomItem[]` casts that previously laundered
 *  Prisma's loose string types into the narrow domain types. */
export function fromPrismaEstimate(
  estimate: PrismaEstimateForView
): EstimateInput {
  return {
    lineItems: estimate.lineItems.map(toLineItemCalc),
    items: estimate.siteMeasure.items.map(toRoomItem),
    markupPct: toNum(estimate.markupPct),
    convenienceFeeRate: toNum(estimate.convenienceFeeRate),
    depositPct: toNum(estimate.depositPct),
  };
}

function toLineItemCalc(row: PrismaLineItemRow): LineItemCalc {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    rate: toNum(row.rate),
    qtyMode: parseQtyMode(row.qtyMode),
    qty: toNumOrNull(row.qty),
    wastePct: toNum(row.wastePct),
    unitLabel: row.unitLabel,
    linkedRoomIds: row.linkedRoomIds,
    sortOrder: row.sortOrder,
  };
}

function toRoomItem(row: PrismaEstimateItemRow): RoomItem {
  return {
    id: row.id,
    type: row.type === "note" ? "note" : "room",
    shape: row.shape === "tri" ? "tri" : row.shape === "rect" ? "rect" : null,
    w: row.w ?? null,
    l: row.l ?? null,
    name: row.name ?? null,
    note: row.note ?? null,
    text: row.text ?? null,
  };
}
