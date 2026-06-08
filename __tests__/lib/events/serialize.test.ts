import { describe, expect, it } from "vitest";
import { resolveEventAddress } from "@/lib/events/serialize";

describe("resolveEventAddress", () => {
  it("prefers the estimate's site-measure location address", () => {
    expect(
      resolveEventAddress({
        estimate: {
          estimateNumber: 5,
          siteMeasure: { location: { address: "412 Oak St" } },
        },
        customer: {
          id: 1,
          name: "C",
          phone: null,
          locations: [{ address: "999 Other" }],
        },
      })
    ).toBe("412 Oak St");
  });

  it("falls back to the customer's first location", () => {
    expect(
      resolveEventAddress({
        estimate: null,
        customer: {
          id: 1,
          name: "C",
          phone: null,
          locations: [{ address: "88 Birch Ave" }],
        },
      })
    ).toBe("88 Birch Ave");
  });

  it("returns null when nothing is derivable", () => {
    expect(
      resolveEventAddress({
        estimate: null,
        customer: { id: 1, name: "C", phone: null, locations: [] },
      })
    ).toBeNull();
  });

  it("ignores blank/whitespace addresses", () => {
    expect(
      resolveEventAddress({
        estimate: {
          estimateNumber: 5,
          siteMeasure: { location: { address: "   " } },
        },
        customer: {
          id: 1,
          name: "C",
          phone: null,
          locations: [{ address: "88 Birch Ave" }],
        },
      })
    ).toBe("88 Birch Ave");
  });
});
