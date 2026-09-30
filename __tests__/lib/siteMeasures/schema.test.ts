import { describe, expect, it } from "vitest";
import {
  estimateCreateSchema,
  estimateIdParams,
  estimateUpdateSchema,
} from "@/lib/siteMeasures/schema";

describe("estimateUpdateSchema — room segments", () => {
  it("accepts an item with a segments array", () => {
    const parsed = estimateUpdateSchema.parse({
      items: [
        {
          id: 1,
          type: "room",
          name: "L-shaped",
          segments: [
            { w: 10, l: 12 },
            { w: 4, l: 3 },
          ],
        },
      ],
    });
    expect(parsed.items?.[0]?.segments).toEqual([
      { w: 10, l: 12 },
      { w: 4, l: 3 },
    ]);
  });

  it("accepts a box with a null dimension (partial entry)", () => {
    const parsed = estimateUpdateSchema.parse({
      items: [{ id: 1, type: "room", segments: [{ w: 5, l: null }] }],
    });
    expect(parsed.items?.[0]?.segments?.[0]).toEqual({ w: 5, l: null });
  });

  it("still accepts a legacy item with no segments", () => {
    const parsed = estimateUpdateSchema.parse({
      items: [{ id: 1, type: "room", w: 10, l: 12 }],
    });
    expect(parsed.items?.[0]?.segments).toBeUndefined();
  });

  it("rejects the retired tri shape (triangle math was dropped)", () => {
    const result = estimateUpdateSchema.safeParse({
      items: [{ id: 1, type: "room", shape: "tri", w: 10, l: 12 }],
    });
    expect(result.success).toBe(false);
  });
});

// The linked GitHub issue describes a `shape` enum of "rect"/"tri", but
// "tri" was retired along with the triangle room math (see the test above);
// the schema now only accepts "rect". This suite exercises the schema as it
// actually stands today.

describe("estimateCreateSchema (site measures)", () => {
  it("accepts a positive integer locationId", () => {
    expect(estimateCreateSchema.safeParse({ locationId: 1 }).success).toBe(
      true
    );
  });

  it("rejects a non-positive locationId", () => {
    expect(estimateCreateSchema.safeParse({ locationId: 0 }).success).toBe(
      false
    );
  });

  it("rejects a missing locationId", () => {
    expect(estimateCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("estimateUpdateSchema — item validation", () => {
  it("accepts an empty patch (every field optional)", () => {
    expect(estimateUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts the sole valid shape value", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "room", shape: "rect", w: 10, l: 12 }],
      }).success
    ).toBe(true);
  });

  it("allows a nullish shape", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "room", shape: null }],
      }).success
    ).toBe(true);
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "room" }],
      }).success
    ).toBe(true);
  });

  it("accepts every valid item type enum value", () => {
    for (const type of ["room", "note"] as const) {
      expect(
        estimateUpdateSchema.safeParse({ items: [{ id: 1, type }] }).success
      ).toBe(true);
    }
  });

  it("rejects an invalid item type enum value", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "wall" }],
      }).success
    ).toBe(false);
  });

  it("rejects an item missing the required id", () => {
    expect(
      estimateUpdateSchema.safeParse({ items: [{ type: "room" }] }).success
    ).toBe(false);
  });

  it("rejects a non-integer item id", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1.5, type: "room" }],
      }).success
    ).toBe(false);
  });

  it("rejects a non-numeric w/l", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "room", w: "10", l: 12 }],
      }).success
    ).toBe(false);
  });

  it("allows a nullish w/l", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "room", w: null, l: null }],
      }).success
    ).toBe(true);
  });

  it("rejects a segment with a non-numeric dimension", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [{ id: 1, type: "room", segments: [{ w: "10", l: 12 }] }],
      }).success
    ).toBe(false);
  });

  it("accepts a note item with free-text note/text fields", () => {
    expect(
      estimateUpdateSchema.safeParse({
        items: [
          { id: 1, type: "note", note: "Uneven subfloor", text: "See note" },
        ],
      }).success
    ).toBe(true);
  });

  it("rejects a non-positive locationId when provided", () => {
    expect(estimateUpdateSchema.safeParse({ locationId: 0 }).success).toBe(
      false
    );
  });
});

describe("estimateIdParams (site measures)", () => {
  it("coerces a numeric-string id", () => {
    const r = estimateIdParams.safeParse({ id: "5" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.id).toBe(5);
  });

  it("rejects a non-positive id", () => {
    expect(estimateIdParams.safeParse({ id: "0" }).success).toBe(false);
  });
});
