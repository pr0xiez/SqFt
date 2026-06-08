import { computeEstimateView } from "./compute";
import type { EstimateInput, LineItemCalc, RoomItem } from "./types";

/** Side-channel metadata attached to a snapshot but not part of the math.
 *  `customer.address` is sourced from the estimate's Location (passed in by
 *  the caller), not a customer.address field. */
export interface EstimateSnapshotMeta {
  estimateNumber: number;
  date: Date | string;
  customer: {
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  org: {
    name: string;
    address: string | null;
    phone: string | null;
    licenseNumber: string | null;
    logo: string | null;
  };
}

export interface EstimateSnapshot {
  estimateNumber: number;
  date: string;
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  customer: EstimateSnapshotMeta["customer"];
  org: EstimateSnapshotMeta["org"];
  items: Array<Record<string, unknown>>;
  lineItems: Array<Record<string, unknown>>;
  totals: {
    subtotal: number;
    markup: number;
    convenienceFee: number;
    total: number;
    deposit: number;
  };
}

/** Build a serializable snapshot of an estimate — the customer-approved
 *  artifact. Computes the view internally so totals can never diverge from
 *  what the editor or public page showed. */
export function snapshotEstimate(
  input: EstimateInput,
  meta: EstimateSnapshotMeta
): EstimateSnapshot {
  const view = computeEstimateView(input);
  // Pair computed math to its source line by stable id, not array position.
  // `computeEstimateView` is the single source of truth and may one day
  // filter/reorder lines; positional pairing would then silently bake the
  // wrong qty/subtotal into this immutable, legally-meaningful record.
  const lineById = new Map(view.lines.map((l) => [l.id, l]));

  return {
    estimateNumber: meta.estimateNumber,
    date: typeof meta.date === "string" ? meta.date : meta.date.toISOString(),
    convenienceFeeRate: input.convenienceFeeRate,
    markupPct: input.markupPct,
    depositPct: input.depositPct,
    customer: meta.customer,
    org: meta.org,
    items: input.items.map((i: RoomItem) => ({
      id: i.id,
      type: i.type,
      name: i.name ?? null,
      shape: i.shape ?? null,
      w: i.w ?? null,
      l: i.l ?? null,
      note: i.note ?? null,
      text: i.text ?? null,
    })),
    lineItems: input.lineItems.map((li: LineItemCalc) => {
      const computed = lineById.get(li.id);
      if (computed === undefined) {
        throw new Error(
          `snapshotEstimate: no computed view line for line item id ${li.id}`
        );
      }
      return {
        id: li.id,
        sortOrder: li.sortOrder ?? 0,
        name: li.name,
        description: li.description ?? null,
        rate: li.rate,
        qtyMode: li.qtyMode,
        qty: li.qty ?? null,
        wastePct: li.wastePct,
        unitLabel: li.unitLabel,
        linkedRoomIds: li.linkedRoomIds,
        effectiveQty: computed.effectiveQty,
        subtotal: computed.subtotal,
      };
    }),
    totals: {
      subtotal: view.subtotal,
      markup: view.markup,
      convenienceFee: view.convenienceFee,
      total: view.total,
      deposit: view.deposit,
    },
  };
}
