import {
  isLinkedQtyMode,
  type LineItemCalc,
  QtyMode,
  type RoomItem,
  roomPerimeter,
  roomSqft,
} from "@/lib/utils";
import type { LineView, QuoteInput, QuoteView } from "./types";

/** Single source of truth for quote math. Returns the fully-computed view —
 *  per-line subtotals plus the labeled totals breakdown — used by the editor,
 *  the public quote page, the send-email route, and the signed snapshot. */
export function computeQuoteView(input: QuoteInput): QuoteView {
  const rooms = input.items.filter((r) => r.type === "room");

  const lines: LineView[] = input.lineItems.map((li) => {
    const effectiveQty = resolveQty(li, rooms);
    const subtotal = effectiveQty === null ? null : effectiveQty * li.rate;
    return { id: li.id, effectiveQty, subtotal };
  });

  const subtotal = lines.reduce((sum, l) => sum + (l.subtotal ?? 0), 0);
  const markup = subtotal * (input.markupPct / 100);
  const beforeFee = subtotal + markup;
  const convenienceFee = beforeFee * input.convenienceFeeRate;
  const total = beforeFee + convenienceFee;
  const deposit = total * input.depositPct;
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
