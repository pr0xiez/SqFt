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
 *  Every returned money field (line subtotals, subtotal, markup, total,
 *  deposit) is round2'd to cents, matching the rounding convention
 *  `foldMarkupIntoLines` uses for line-level amounts; each total is derived
 *  from already-rounded inputs rather than rounding a raw float sum. */
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
  const total = round2(subtotal + markup);
  const deposit = round2(total * input.depositPct);
  const hasUnresolvedLines = lines.some((l) => l.subtotal === null);

  return {
    lines,
    subtotal,
    markup,
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
