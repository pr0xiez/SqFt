import { z } from "zod";
import { type LineItemCalc, parseQtyMode, type RoomItem } from "@/lib/utils";
import type { EstimateView } from "./types";

/** Zod mirror of the JSON written by `snapshotEstimate` (`./snapshot.ts`).
 *  This is the read side of the approval snapshot: the public estimate page
 *  renders an approved estimate from this frozen record, never from the live
 *  rows. Tolerant of historical shapes — pre-segments snapshots have no
 *  `segments` key, and `shape` may hold retired values (e.g. "tri"). */

const finite = z.number().finite();

const snapshotSegmentSchema = z.object({
  w: finite.nullish(),
  l: finite.nullish(),
});

const snapshotItemSchema = z.object({
  id: z.number().int(),
  type: z.enum(["room", "note"]),
  name: z.string().nullish(),
  shape: z.string().nullish(),
  w: z.union([z.string(), finite]).nullish(),
  l: z.union([z.string(), finite]).nullish(),
  segments: z.array(snapshotSegmentSchema).nullish(),
  note: z.string().nullish(),
  text: z.string().nullish(),
});

const snapshotLineItemSchema = z.object({
  id: z.number().int(),
  sortOrder: z.number().int().default(0),
  name: z.string(),
  description: z.string().nullish(),
  rate: finite,
  qtyMode: z.string(),
  qty: finite.nullish(),
  wastePct: finite,
  unitLabel: z.string(),
  linkedRoomIds: z.array(z.number().int()),
  effectiveQty: finite.nullable(),
  subtotal: finite.nullable(),
});

const estimateSnapshotSchema = z.object({
  estimateNumber: z.number().int(),
  date: z.string(),
  markupPct: finite,
  depositPct: finite,
  customer: z
    .object({
      name: z.string().nullish(),
      address: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
    })
    .nullish(),
  org: z.object({
    name: z.string(),
    address: z.string().nullish(),
    phone: z.string().nullish(),
    licenseNumber: z.string().nullish(),
    logo: z.string().nullish(),
  }),
  items: z.array(snapshotItemSchema),
  lineItems: z.array(snapshotLineItemSchema),
  totals: z.object({
    subtotal: finite,
    markup: finite,
    total: finite,
    deposit: finite,
  }),
});

export type ParsedEstimateSnapshot = z.infer<typeof estimateSnapshotSchema>;

/** Validate a raw approval-snapshot JSON value (a Prisma Json column) at the
 *  DB → render trust boundary. Returns null on any shape mismatch so the
 *  caller can fall back rather than crash the customer-facing page. */
export function parseEstimateSnapshot(
  json: unknown
): ParsedEstimateSnapshot | null {
  const result = estimateSnapshotSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** The frozen `EstimateView` stored in the snapshot — per-line resolved
 *  qty/subtotal plus the signed totals. Rendering from this (instead of
 *  recomputing from the line items) keeps the approved document immutable
 *  even if the area/markup math changes in a later release. */
export function estimateViewFromSnapshot(
  snap: ParsedEstimateSnapshot
): EstimateView {
  return {
    lines: snap.lineItems.map((li) => ({
      id: li.id,
      effectiveQty: li.effectiveQty,
      subtotal: li.subtotal,
    })),
    subtotal: snap.totals.subtotal,
    markup: snap.totals.markup,
    total: snap.totals.total,
    deposit: snap.totals.deposit,
    hasUnresolvedLines: snap.lineItems.some((li) => li.effectiveQty == null),
  };
}

/** Snapshot rooms/notes → display `RoomItem`s. Retired shape values map to
 *  null (plain rect), matching how the live page narrows `shape`. */
export function snapshotRoomItems(snap: ParsedEstimateSnapshot): RoomItem[] {
  return snap.items.map((i) => ({
    id: i.id,
    type: i.type,
    shape: i.shape === "rect" ? "rect" : null,
    w: i.w ?? null,
    l: i.l ?? null,
    segments: i.segments ?? undefined,
    name: i.name ?? null,
    note: i.note ?? null,
    text: i.text ?? null,
  }));
}

/** Snapshot line items → `LineItemCalc`s for display components. */
export function snapshotLineItemCalcs(
  snap: ParsedEstimateSnapshot
): LineItemCalc[] {
  return snap.lineItems.map((li) => ({
    id: li.id,
    name: li.name,
    description: li.description ?? null,
    rate: li.rate,
    qtyMode: parseQtyMode(li.qtyMode),
    qty: li.qty ?? null,
    wastePct: li.wastePct,
    unitLabel: li.unitLabel,
    linkedRoomIds: li.linkedRoomIds,
    sortOrder: li.sortOrder,
  }));
}
