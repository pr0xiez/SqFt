import { describe, expect, it } from "vitest";
import { lineItemSchema } from "@/lib/estimates/schema";

const validLineItem = {
  name: "Hardwood flooring",
  rate: 4.85,
  qty: 500,
  wastePct: 20,
};

describe("lineItemSchema", () => {
  it("accepts a valid line item, including 20% waste", () => {
    const r = lineItemSchema.safeParse(validLineItem);
    expect(r.success).toBe(true);
  });

  it("rejects a negative rate", () => {
    const r = lineItemSchema.safeParse({ ...validLineItem, rate: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects an Infinity rate", () => {
    const r = lineItemSchema.safeParse({
      ...validLineItem,
      rate: Number.POSITIVE_INFINITY,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a NaN rate", () => {
    const r = lineItemSchema.safeParse({ ...validLineItem, rate: Number.NaN });
    expect(r.success).toBe(false);
  });

  it("rejects a negative qty", () => {
    const r = lineItemSchema.safeParse({ ...validLineItem, qty: -5 });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = lineItemSchema.safeParse({ ...validLineItem, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name over 200 characters", () => {
    const r = lineItemSchema.safeParse({
      ...validLineItem,
      name: "a".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a wastePct over 100", () => {
    const r = lineItemSchema.safeParse({ ...validLineItem, wastePct: 101 });
    expect(r.success).toBe(false);
  });
});
