import { describe, expect, it } from "vitest";
import { isTruncated, withSelectedOption } from "@/lib/schedule/pickerOptions";

describe("withSelectedOption", () => {
  it("appends the selected entry when the results lack it", () => {
    expect(
      withSelectedOption([{ id: 1, name: "A" }], { id: 9, name: "Old" })
    ).toEqual([
      { id: 1, name: "A" },
      { id: 9, name: "Old" },
    ]);
  });

  it("does not duplicate a selection already in the results", () => {
    const out = withSelectedOption([{ id: 1, name: "A" }], {
      id: 1,
      name: "A",
    });
    expect(out).toHaveLength(1);
  });

  it("passes results through with no selection", () => {
    expect(withSelectedOption([{ id: 1 }], null)).toEqual([{ id: 1 }]);
  });
});

describe("isTruncated", () => {
  it("is true only when total exceeds the rows shown", () => {
    expect(isTruncated(120, 50)).toBe(true);
    expect(isTruncated(50, 50)).toBe(false);
    expect(isTruncated(undefined, 0)).toBe(false);
  });
});
