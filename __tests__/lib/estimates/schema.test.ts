import { describe, expect, it } from "vitest";
import { estimateUpdateSchema } from "@/lib/estimates/schema";

// The line-item schema is not exported directly; exercise it through
// estimateUpdateSchema.lineItems, the only public entry point.
function parseLineItem(overrides: Record<string, unknown>) {
  return estimateUpdateSchema.safeParse({
    lineItems: [
      {
        name: "LVP — Driftwood Oak",
        rate: 2.85,
        qtyMode: "manual",
        qty: 100,
        wastePct: 10,
        unitLabel: "ft²",
        linkedRoomIds: [],
        sortOrder: 0,
        ...overrides,
      },
    ],
  });
}

describe("estimate lineItemSchema", () => {
  it("accepts a valid line item", () => {
    const result = parseLineItem({});
    expect(result.success).toBe(true);
    if (result.success) {
      const li = result.data.lineItems?.[0];
      expect(li?.rate).toBe(2.85);
      expect(li?.wastePct).toBe(10);
    }
  });

  it("trims surrounding whitespace from name", () => {
    const result = parseLineItem({ name: "  Underlayment  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lineItems?.[0]?.name).toBe("Underlayment");
    }
  });

  it("rejects a negative rate", () => {
    expect(parseLineItem({ rate: -1 }).success).toBe(false);
  });

  it("rejects an Infinity rate", () => {
    expect(parseLineItem({ rate: Number.POSITIVE_INFINITY }).success).toBe(
      false
    );
  });

  it("rejects a NaN rate", () => {
    expect(parseLineItem({ rate: Number.NaN }).success).toBe(false);
  });

  it("rejects a negative qty", () => {
    expect(parseLineItem({ qty: -5 }).success).toBe(false);
  });

  it("rejects an Infinity qty", () => {
    expect(parseLineItem({ qty: Number.POSITIVE_INFINITY }).success).toBe(
      false
    );
  });

  it("rejects an empty name", () => {
    expect(parseLineItem({ name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    expect(parseLineItem({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over the length cap", () => {
    expect(parseLineItem({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects a negative wastePct", () => {
    expect(parseLineItem({ wastePct: -1 }).success).toBe(false);
  });

  it("rejects a wastePct above the cap", () => {
    expect(parseLineItem({ wastePct: 101 }).success).toBe(false);
  });

  it("rejects an Infinity wastePct", () => {
    expect(parseLineItem({ wastePct: Number.POSITIVE_INFINITY }).success).toBe(
      false
    );
  });

  it("rejects an empty unitLabel", () => {
    expect(parseLineItem({ unitLabel: "" }).success).toBe(false);
  });

  it("rejects a description over the length cap", () => {
    expect(parseLineItem({ description: "x".repeat(2001) }).success).toBe(
      false
    );
  });
});
