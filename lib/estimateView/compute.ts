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
 *  Every monetary output is rounded to cents (`round2`) at its own boundary, so
 *  persisted and recomputed money can never disagree at the penny and the
 *  breakdown stays internally consistent: each money field is the rounded
 *  result of the prior rounded fields (e.g. `total === round2(beforeFee +
 *  convenienceFee)`). Non-money outputs (`effectiveQty`) are left unrounded —
 *  quantities can be fractional (sqft, linear feet, waste%). */
export function computeEstimateView(input: EstimateInput): EstimateView {
  const rooms = input.items.filter((r) => r.type === "room");

  const lines: LineView[] = input.lineItems.map((li) => {
    const effectiveQty = resolveQty(li, rooms);
    const subtotal =
      effectiveQty === null ? null : round2(effectiveQty * li.rate);
    return { id: li.id, effectiveQty, subtotal };
  });

  // Each money boundary is rounded off the prior rounded value, so the labeled
  // totals reconcile exactly (subtotal sums rounded line subtotals; beforeFee =
  // rounded(subtotal + markup); total = rounded(beforeFee + convenienceFee)).
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
