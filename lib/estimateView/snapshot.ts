import type { Prisma } from "@/app/generated/prisma/client";
import { computeEstimateView } from "./compute";
import type { EstimateInput, LineItemCalc, LineView, RoomItem } from "./types";

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

/** One frozen room/note entry inside the snapshot. A plain object *type*
 *  (not an `interface`) so it — and therefore `EstimateSnapshot` as a whole —
 *  structurally satisfies `Prisma.InputJsonValue` with no cast: TypeScript
 *  only infers the implicit string index signature JSON columns need for
 *  type literals, not for named interfaces (even ones a property merely
 *  points at), so every field here is spelled out as a literal shape rather
 *  than reusing `RoomItem`/`RoomSegment` directly. */
type EstimateSnapshotRoomItem = {
  id: number;
  type: RoomItem["type"];
  name: string | null;
  shape: "rect" | null;
  w: string | number | null;
  l: string | number | null;
  segments: Array<{ w?: number | null; l?: number | null }> | null;
  note: string | null;
  text: string | null;
};

/** One frozen line item inside the snapshot — see
 *  `EstimateSnapshotRoomItem` for why this is a `type`, not an `interface`. */
type EstimateSnapshotLineItem = {
  id: number;
  sortOrder: number;
  name: string;
  description: string | null;
  rate: number;
  qtyMode: LineItemCalc["qtyMode"];
  qty: number | null;
  wastePct: number;
  unitLabel: string;
  linkedRoomIds: number[];
  effectiveQty: LineView["effectiveQty"];
  subtotal: LineView["subtotal"];
};

/** The frozen, customer-approved estimate artifact. A `type` (not an
 *  `interface`) so the whole tree — see `EstimateSnapshotRoomItem` — is
 *  directly assignable to `Prisma.InputJsonValue`, letting the persistence
 *  call site pass this value straight to the Prisma write without an
 *  `as never` escape hatch. A future shape change that isn't JSON-safe (e.g.
 *  a `Date` or a class instance sneaking into a field) becomes a compile
 *  error right here instead of a silent runtime cast. */
export type EstimateSnapshot = {
  estimateNumber: number;
  date: string;
  markupPct: number;
  depositPct: number;
  customer: EstimateSnapshotMeta["customer"];
  org: EstimateSnapshotMeta["org"];
  items: EstimateSnapshotRoomItem[];
  lineItems: EstimateSnapshotLineItem[];
  totals: {
    subtotal: number;
    markup: number;
    total: number;
    deposit: number;
  };
};

/** Build a serializable snapshot of an estimate — the customer-approved
 *  artifact. Computes the view internally so totals can never diverge from
 *  what the editor or public page showed. */
export function snapshotEstimate(
  input: EstimateInput,
  meta: EstimateSnapshotMeta
): EstimateSnapshot {
  const view = computeEstimateView(input);
  // Re-pair each line item's computed math to its metadata BY ID, not by array
  // position. computeEstimateView is the single source of truth and its lines
  // already carry `id`; keying by id makes any future reorder/filter/drop in
  // the view a loud failure here rather than silently baking wrong money onto
  // the wrong line of an approved, customer-facing artifact.
  const viewById = new Map<LineView["id"], LineView>(
    view.lines.map((l) => [l.id, l])
  );

  return {
    estimateNumber: meta.estimateNumber,
    date: typeof meta.date === "string" ? meta.date : meta.date.toISOString(),
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
      // Multi-box rooms carry their geometry in segments (w/l are null), so
      // the approved artifact must keep them or those rooms lose all dims.
      segments: i.segments ?? null,
      note: i.note ?? null,
      text: i.text ?? null,
    })),
    lineItems: input.lineItems.map((li: LineItemCalc) => {
      const computed = viewById.get(li.id);
      if (computed == null) {
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
      total: view.total,
      deposit: view.deposit,
    },
  };
}

// Compile-time proof that `EstimateSnapshot` is JSON-safe: if a future field
// stops being assignable to `Prisma.InputJsonValue` (e.g. a `Date` or a class
// instance sneaks in), this line fails to compile — the whole point of
// dropping the `as never` cast at the persistence call site.
type AssertJsonSafe<T extends Prisma.InputJsonValue> = T;
type _EstimateSnapshotIsJsonSafe = AssertJsonSafe<EstimateSnapshot>;
