import { type LineItemCalc, parseQtyMode, type RoomItem } from "@/lib/utils";
import type { QuoteInput } from "./types";

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

/** Minimal shape of a Prisma `EstimateItem` row. */
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

export interface PrismaQuoteForView {
  markupPct: number;
  convenienceFeeRate: number;
  depositPct: number;
  lineItems: PrismaLineItemRow[];
  estimate: { items: PrismaEstimateItemRow[] };
}

/** Map a Prisma quote payload (any of the standard includes that bring
 *  lineItems + estimate.items) into the canonical `QuoteInput`. Replaces
 *  the `as LineItemCalc[]` / `as RoomItem[]` casts that previously laundered
 *  Prisma's loose string types into the narrow domain types. */
export function fromPrismaQuote(quote: PrismaQuoteForView): QuoteInput {
  return {
    lineItems: quote.lineItems.map(toLineItemCalc),
    items: quote.estimate.items.map(toRoomItem),
    markupPct: quote.markupPct,
    convenienceFeeRate: quote.convenienceFeeRate,
    depositPct: quote.depositPct,
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
