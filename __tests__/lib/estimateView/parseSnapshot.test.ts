import { describe, expect, it } from "vitest";
import type { EstimateInput } from "@/lib/estimateView";
import { computeEstimateView } from "@/lib/estimateView";
import {
  estimateViewFromSnapshot,
  parseEstimateSnapshot,
  snapshotLineItemCalcs,
  snapshotRoomItems,
} from "@/lib/estimateView/parseSnapshot";
import {
  type EstimateSnapshotMeta,
  snapshotEstimate,
} from "@/lib/estimateView/snapshot";
import { QtyMode } from "@/lib/utils";

const input: EstimateInput = {
  markupPct: 35,
  depositPct: 0.5,
  items: [
    {
      id: 1,
      type: "room",
      name: "Living",
      w: 14,
      l: 18,
      shape: "rect",
      note: null,
      text: null,
    },
    {
      id: 2,
      type: "room",
      name: "L-shaped den",
      w: null,
      l: null,
      shape: null,
      segments: [
        { w: 10, l: 12 },
        { w: 4, l: 6 },
      ],
      note: null,
      text: null,
    },
    { id: 3, type: "note", text: "Move piano", name: null },
  ],
  lineItems: [
    {
      id: 11,
      sortOrder: 0,
      name: "LVP",
      rate: 4.85,
      qtyMode: QtyMode.LinkedArea,
      qty: null,
      wastePct: 10,
      unitLabel: "ft²",
      linkedRoomIds: [1, 2],
    },
    {
      id: 12,
      sortOrder: 1,
      name: "Stair nosing",
      rate: 24,
      qtyMode: QtyMode.Manual,
      qty: null, // unresolved: manual with no qty
      wastePct: 0,
      unitLabel: "lf",
      linkedRoomIds: [],
    },
  ],
};

const meta: EstimateSnapshotMeta = {
  estimateNumber: 5001,
  date: new Date("2026-05-01T00:00:00Z"),
  customer: {
    name: "J. Henderson",
    address: "1247 Elm St",
    email: "h@example.com",
    phone: "555",
  },
  org: {
    name: "Mike's Flooring",
    address: "842 Industrial Pkwy",
    phone: "(614) 555-0100",
    licenseNumber: "OH-FL-44129",
    logo: null,
  },
};

/** What the DB round-trip does to the snapshot: Json column ⇒ plain JSON. */
function persisted(): unknown {
  return JSON.parse(JSON.stringify(snapshotEstimate(input, meta)));
}

describe("parseEstimateSnapshot", () => {
  it("round-trips the JSON written by snapshotEstimate", () => {
    const parsed = parseEstimateSnapshot(persisted());
    expect(parsed).not.toBeNull();
    expect(parsed?.estimateNumber).toBe(5001);
    expect(parsed?.markupPct).toBe(35);
    expect(parsed?.items).toHaveLength(3);
    expect(parsed?.lineItems).toHaveLength(2);
  });

  it("accepts a pre-segments snapshot (no `segments` key on items)", () => {
    const raw = persisted() as { items: Array<Record<string, unknown>> };
    for (const item of raw.items) delete item.segments;
    expect(parseEstimateSnapshot(raw)).not.toBeNull();
  });

  it('accepts retired shape values (legacy "tri") without failing', () => {
    const raw = persisted() as { items: Array<Record<string, unknown>> };
    raw.items[0].shape = "tri";
    const parsed = parseEstimateSnapshot(raw);
    expect(parsed).not.toBeNull();
    // Retired shapes narrow to null on the way out, like the live page does.
    expect(snapshotRoomItems(parsed!)[0].shape).toBeNull();
  });

  it("returns null for non-object and structurally wrong values", () => {
    expect(parseEstimateSnapshot(null)).toBeNull();
    expect(parseEstimateSnapshot("{}")).toBeNull();
    expect(parseEstimateSnapshot({})).toBeNull();
    expect(parseEstimateSnapshot({ estimateNumber: 1 })).toBeNull();
  });

  it("returns null when totals are missing or non-finite", () => {
    const noTotals = persisted() as Record<string, unknown>;
    delete noTotals.totals;
    expect(parseEstimateSnapshot(noTotals)).toBeNull();

    const badTotal = persisted() as { totals: Record<string, unknown> };
    badTotal.totals.total = "3200";
    expect(parseEstimateSnapshot(badTotal)).toBeNull();
  });
});

describe("estimateViewFromSnapshot", () => {
  it("reproduces the view that was computed at approval time", () => {
    const parsed = parseEstimateSnapshot(persisted());
    const view = estimateViewFromSnapshot(parsed!);
    const original = computeEstimateView(input);
    expect(view.subtotal).toBe(original.subtotal);
    expect(view.markup).toBe(original.markup);
    expect(view.total).toBe(original.total);
    expect(view.deposit).toBe(original.deposit);
    expect(view.hasUnresolvedLines).toBe(original.hasUnresolvedLines);
    expect(view.lines).toEqual(original.lines);
  });

  it("preserves the stored totals verbatim — it never recomputes", () => {
    const raw = persisted() as {
      totals: { subtotal: number; markup: number; total: number };
    };
    // Simulate math-version drift: the stored totals are the signed record,
    // even if recomputing from the inputs would now give something else.
    raw.totals.total = 9999.99;
    const view = estimateViewFromSnapshot(parseEstimateSnapshot(raw)!);
    expect(view.total).toBe(9999.99);
  });
});

describe("snapshot display adapters", () => {
  it("maps rooms, multi-box segments, and notes to RoomItems", () => {
    const items = snapshotRoomItems(parseEstimateSnapshot(persisted())!);
    expect(items[0]).toMatchObject({ id: 1, type: "room", w: 14, l: 18 });
    expect(items[1].segments).toEqual([
      { w: 10, l: 12 },
      { w: 4, l: 6 },
    ]);
    expect(items[2]).toMatchObject({ id: 3, type: "note", text: "Move piano" });
  });

  it("maps line items with narrowed qtyMode and stable sortOrder", () => {
    const lis = snapshotLineItemCalcs(parseEstimateSnapshot(persisted())!);
    expect(lis).toHaveLength(2);
    expect(lis[0]).toMatchObject({
      id: 11,
      qtyMode: QtyMode.LinkedArea,
      rate: 4.85,
      sortOrder: 0,
      linkedRoomIds: [1, 2],
    });
    expect(lis[1].qtyMode).toBe(QtyMode.Manual);
  });

  it("falls back to Manual for an unknown legacy qtyMode string", () => {
    const raw = persisted() as {
      lineItems: Array<Record<string, unknown>>;
    };
    raw.lineItems[0].qtyMode = "linked"; // pre-rename legacy value
    const lis = snapshotLineItemCalcs(parseEstimateSnapshot(raw)!);
    expect(lis[0].qtyMode).toBe(QtyMode.Manual);
  });
});
