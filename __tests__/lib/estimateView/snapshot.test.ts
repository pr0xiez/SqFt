import { afterEach, describe, expect, it, vi } from "vitest";
import type { EstimateInput } from "@/lib/estimateView";
import * as computeModule from "@/lib/estimateView/compute";
import {
  type EstimateSnapshotMeta,
  snapshotEstimate,
} from "@/lib/estimateView/snapshot";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("snapshotEstimate", () => {
  const input: EstimateInput = {
    convenienceFeeRate: 0.075,
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
    ],
    lineItems: [
      {
        id: 1,
        sortOrder: 0,
        name: "LVP",
        rate: 4.85,
        qtyMode: "manual",
        qty: 545,
        wastePct: 0,
        unitLabel: "ft²",
        linkedRoomIds: [],
      },
    ],
  };
  const meta: EstimateSnapshotMeta = {
    estimateNumber: 5001,
    date: new Date("2026-05-01T00:00:00Z"),
    customer: {
      name: "J. Henderson",
      // Address comes from the estimate's Location (passed in by the caller),
      // not a customer.address field.
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

  it("produces a snapshot containing all required top-level keys", () => {
    const snap = snapshotEstimate(input, meta);
    expect(snap).toMatchObject({
      estimateNumber: 5001,
      convenienceFeeRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      customer: expect.objectContaining({ name: "J. Henderson" }),
      org: expect.objectContaining({ name: "Mike's Flooring" }),
      items: expect.any(Array),
      lineItems: expect.any(Array),
      totals: expect.objectContaining({
        subtotal: expect.any(Number),
        convenienceFee: expect.any(Number),
        total: expect.any(Number),
      }),
    });
  });

  it("sources the customer block's address from the passed location address", () => {
    const snap = snapshotEstimate(input, meta);
    expect(snap.customer?.address).toBe("1247 Elm St");
  });

  it("preserves note items in the snapshot's items array", () => {
    const withNote: EstimateInput = {
      ...input,
      items: [
        ...input.items,
        { id: 2, type: "note", text: "see spec", name: null },
      ],
    };
    const snap = snapshotEstimate(withNote, meta);
    expect(snap.items).toHaveLength(2);
    expect(snap.items[1]).toMatchObject({
      id: 2,
      type: "note",
      text: "see spec",
    });
  });

  it("includes per-line effectiveQty and subtotal in the snapshot", () => {
    const snap = snapshotEstimate(input, meta);
    expect(snap.lineItems[0]).toMatchObject({
      effectiveQty: 545,
      subtotal: 545 * 4.85,
    });
  });

  it("pairs each line's computed math to its own line by id", () => {
    // Two lines with distinct ids/quantities — each snapshot row must carry the
    // math for ITS id, proving the pairing is by identity, not array position.
    const twoLines: EstimateInput = {
      ...input,
      lineItems: [
        { ...input.lineItems[0], id: 1, qty: 100, rate: 2 },
        { ...input.lineItems[0], id: 2, qty: 50, rate: 3 },
      ],
    };
    const snap = snapshotEstimate(twoLines, meta);
    const byId = Object.fromEntries(
      snap.lineItems.map((li) => [li.id as number, li])
    );
    expect(byId[1]).toMatchObject({ effectiveQty: 100, subtotal: 200 });
    expect(byId[2]).toMatchObject({ effectiveQty: 50, subtotal: 150 });
  });

  it("throws loudly if a source line has no matching computed view line", () => {
    // Guard against a future computeEstimateView regression that drops/reorders
    // lines: a source line with no computed match must fail, not silently null.
    // Stub the view to omit line id 2 so its source line has no match.
    vi.spyOn(computeModule, "computeEstimateView").mockReturnValueOnce({
      lines: [{ id: 1, effectiveQty: 100, subtotal: 200 }],
      subtotal: 200,
      markup: 0,
      beforeFee: 200,
      convenienceFee: 0,
      total: 200,
      deposit: 0,
      hasUnresolvedLines: false,
    });
    const twoLines: EstimateInput = {
      ...input,
      lineItems: [
        { ...input.lineItems[0], id: 1 },
        { ...input.lineItems[0], id: 2 },
      ],
    };
    expect(() => snapshotEstimate(twoLines, meta)).toThrow(/line item id 2/);
  });
});
