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
 *  the public estimate page, the send-email route, and the signed snapshot.
 *
 *  Every monetary output is rounded to cents at the boundary it is produced, so
 *  no caller ever sees raw IEEE-754 drift (`100.3 + 0.03 → 100.33000000000001`)
 *  and the persisted `Estimate.total` always reconciles with a freshly
 *  recomputed view. Per-line `subtotal` is rounded too, so the running subtotal
 *  is a sum of exact cents rather than an accumulation of binary error.
 *  `effectiveQty` is a measured quantity (sq ft / linear ft), NOT money, and is
 *  intentionally left unrounded. */
export function computeEstimateView(input: EstimateInput): EstimateView {
  const rooms = input.items.filter((r) => r.type === "room");

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
