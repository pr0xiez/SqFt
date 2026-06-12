import { round2 } from "@/lib/money";
import {
  isLinkedQtyMode,
  type LineItemCalc,
  QtyMode,
  type RoomItem,
  roomPerimeter,
  roomSqft,
} from "@/lib/utils";
import type { EstimateInput, EstimateView, LineView } from "./types";

/** Single source of truth for estimate math. Returns the fully-computed view —
 *  per-line subtotals plus the labeled totals breakdown — used by the editor,
 *  the public estimate page, the send-email route, and the signed snapshot. */
export function computeEstimateView(input: EstimateInput): EstimateView {
  const rooms = input.items.filter((r) => r.type === "room");

  // Every dollar output is settled to cents (round2) so the view never emits a
  // raw IEEE-754 product/sum. `effectiveQty` is a quantity, not money, so it
  // stays unrounded; the rate/pct *inputs* (markupPct, convenienceFeeRate,
  // depositPct) are likewise left alone — only the resulting amounts round.
  // Per-line subtotals round first, then the totals sum the already-rounded
  // values, so the displayed rows always add up to the displayed subtotal with
  // no penny gap, and a half-cent never compounds across the chain.
  const lines: LineView[] = input.lineItems.map((li) => {
    const effectiveQty = resolveQty(li, rooms);
    const subtotal =
      effectiveQty === null ? null : round2(effectiveQty * li.rate);
    return { id: li.id, effectiveQty, subtotal };
  });

  const subtotal = round2(lines.reduce((sum, l) => sum + (l.subtotal ?? 0), 0));
  const markup = round2(subtotal * (input.markupPct / 100));
  const beforeFee = round2(subtotal + markup);
  const convenienceFee = round2(beforeFee * input.convenienceFeeRate);
  const total = round2(beforeFee + convenienceFee);
  const deposit = round2(total * input.depositPct);
  const hasUnresolvedLines = lines.some((l) => l.subtotal === null);

  return {
    lines,
    subtotal,
    markup,
    beforeFee,
    convenienceFee,
    total,
    deposit,
    hasUnresolvedLines,
  };
}

function resolveQty(li: LineItemCalc, rooms: RoomItem[]): number | null {
  if (isLinkedQtyMode(li.qtyMode)) {
    const linked = rooms.filter(
      (r) => r.type === "room" && li.linkedRoomIds.includes(r.id)
    );
    if (linked.length === 0) return null;
    const measure =
      li.qtyMode === QtyMode.LinkedPerimeter ? roomPerimeter : roomSqft;
    const base = linked.reduce((sum, r) => sum + measure(r), 0);
    return base * (1 + (li.wastePct || 0) / 100);
  }
  return li.qty ?? null;
}
