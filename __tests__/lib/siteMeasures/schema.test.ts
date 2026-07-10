import { describe, expect, it } from "vitest";
import { estimateUpdateSchema } from "@/lib/siteMeasures/schema";

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
