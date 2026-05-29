import { describe, expect, it } from "vitest";
import type { EstimateInput } from "@/lib/estimateView";
import {
  type EstimateSnapshotMeta,
  snapshotEstimate,
} from "@/lib/estimateView/snapshot";

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
});
