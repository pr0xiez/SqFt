import { describe, expect, it } from "vitest";
import { canonicalizeRoomDims } from "@/lib/repositories/siteMeasureRepo";

describe("canonicalizeRoomDims", () => {
  it("collapses a single box to legacy scalar w/l with segments cleared", () => {
    expect(
      canonicalizeRoomDims({
        type: "room",
        name: "Den",
        w: null,
        l: null,
        segments: [{ w: 10, l: 12 }],
      })
    ).toMatchObject({ w: 10, l: 12, segments: null });
  });

  it("keeps segments (scalars nulled) for a genuine multi-box room", () => {
    expect(
      canonicalizeRoomDims({
        type: "room",
        name: "L-shape",
        w: 99,
        l: 99,
        segments: [
          { w: 10, l: 12 },
          { w: 4, l: 3 },
        ],
      })
    ).toMatchObject({
      w: null,
      l: null,
      segments: [
        { w: 10, l: 12 },
        { w: 4, l: 3 },
      ],
    });
  });

  it("collapses an empty segments array to null scalars and no segments", () => {
    expect(
      canonicalizeRoomDims({ type: "room", name: "Empty", segments: [] })
    ).toMatchObject({ w: null, l: null, segments: null });
  });

  it("leaves legacy rooms without segments untouched", () => {
    const item = { type: "room", name: "Legacy", w: 10, l: 12 };
    expect(canonicalizeRoomDims(item)).toBe(item);
  });

  it("leaves note items untouched", () => {
    const item = { type: "note", text: "hi", segments: null };
    expect(canonicalizeRoomDims(item)).toBe(item);
  });
});
