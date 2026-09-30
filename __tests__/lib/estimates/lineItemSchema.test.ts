import { describe, expect, it } from "vitest";
import { estimateUpdateSchema, lineItemSchema } from "@/lib/estimates/schema";

const validLineItem = {
  name: "Hardwood flooring",
  rate: 4.85,
  qty: 500,
  wastePct: 20,
};

describe("lineItemSchema", () => {
  it("accepts normal flooring input and enforces numeric bounds", () => {
    expect(lineItemSchema.safeParse(validLineItem).success).toBe(true);
    for (const invalid of [
      { rate: -1 },
      { rate: Number.POSITIVE_INFINITY },
      { rate: Number.NaN },
      { qty: -5 },
      { wastePct: 101 },
      { wastePct: -1 },
    ]) {
      expect(
        lineItemSchema.safeParse({ ...validLineItem, ...invalid }).success
      ).toBe(false);
    }
  });

  it("allows mid-edit empty names and unit labels without changing them", () => {
    const parsed = lineItemSchema.parse({
      ...validLineItem,
      name: "",
      unitLabel: "",
    });
    expect(parsed.name).toBe("");
    expect(parsed.unitLabel).toBe("");
  });

  it("round-trips legacy text and template units in a full-array save", () => {
    const legacy = {
      ...validLineItem,
      name: "a".repeat(201),
      description: "d".repeat(4000),
      unitLabel: "square feet installed",
    };
    const parsed = estimateUpdateSchema.parse({
      lineItems: [legacy, { ...validLineItem, name: "" }],
    });
    expect(parsed.lineItems?.[0]).toMatchObject(legacy);
    expect(parsed.lineItems?.[1].name).toBe("");
  });
});
