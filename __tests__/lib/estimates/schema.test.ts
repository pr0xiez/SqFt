import { describe, expect, it } from "vitest";
import { lineItemSchema } from "@/lib/estimates/schema";

const validLineItem = {
  name: "LVP — Driftwood Oak 8mm",
  rate: 2.85,
  qtyMode: "manual" as const,
  qty: 545,
  wastePct: 10,
  unitLabel: "ft²",
  linkedRoomIds: [],
  sortOrder: 0,
};

describe("lineItemSchema", () => {
  it("accepts a valid line item", () => {
    expect(lineItemSchema.safeParse(validLineItem).success).toBe(true);
  });

  it("rejects a negative rate", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, rate: -1 }).success
    ).toBe(false);
  });

  it("rejects a negative qty", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, qty: -5 }).success
    ).toBe(false);
  });

  it("rejects a non-finite (Infinity) rate", () => {
    expect(
      lineItemSchema.safeParse({
        ...validLineItem,
        rate: Number.POSITIVE_INFINITY,
      }).success
    ).toBe(false);
  });

  it("rejects a NaN rate", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, rate: Number.NaN }).success
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, name: "   " }).success
    ).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, name: "x".repeat(201) })
        .success
    ).toBe(false);
  });

  it("rejects a wastePct above 100%", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, wastePct: 150 }).success
    ).toBe(false);
  });

  it("accepts the picker's 20% waste ceiling", () => {
    expect(
      lineItemSchema.safeParse({ ...validLineItem, wastePct: 20 }).success
    ).toBe(true);
  });
});
