import { type LineItemCalc, parseQtyMode, type RoomItem } from "@/lib/utils";
import type { EstimateInput } from "./types";

/** Minimal shape of a Prisma `LineItem` row — just the columns the view needs. */
interface PrismaLineItemRow {
  id: number;
  name: string;
  description?: string | null;
  rate: number;
  qtyMode: string;
  qty: number | null;
  wastePct: number;
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
  markupPct: number;
  depositPct: number;
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
    markupPct: estimate.markupPct,
    depositPct: estimate.depositPct,
  };
}

function toLineItemCalc(row: PrismaLineItemRow): LineItemCalc {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    rate: row.rate,
    qtyMode: parseQtyMode(row.qtyMode),
    qty: row.qty,
    wastePct: row.wastePct,
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
