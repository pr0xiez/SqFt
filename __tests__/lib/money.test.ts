import { describe, expect, it } from "vitest";
import { residualTargetIndex, round2 } from "@/lib/money";

describe("round2", () => {
  it("rounds to the nearest cent", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
    expect(round2(0.1 + 0.2)).toBe(0.3); // classic binary-float drift
  });
});

describe("residualTargetIndex", () => {
  it("returns -1 for an empty list", () => {
    expect(residualTargetIndex([])).toBe(-1);
  });

  it("returns -1 when every entry is unresolved (null)", () => {
    expect(residualTargetIndex([null, null, null])).toBe(-1);
  });

  it("falls back to the last resolved entry when every resolved amount is <= 0", () => {
    // Zero and negative amounts never win the 'largest positive' search, so the
    // function must fall back to the last resolved index rather than -1.
    expect(residualTargetIndex([0, -5, -3])).toBe(2);
    expect(residualTargetIndex([0, 0, 0])).toBe(2);
    expect(residualTargetIndex([-10])).toBe(0);
  });

  it("falls back to the last resolved entry when all-<=0 lines are interleaved with nulls", () => {
    // The fallback must still skip nulls when picking 'last resolved'.
    expect(residualTargetIndex([0, null, -5, null])).toBe(2);
  });

  it("picks the largest positive amount in the normal mixed case", () => {
    expect(residualTargetIndex([10, 50, 20])).toBe(1);
  });

  it("skips null (unresolved) entries when searching for the largest positive amount", () => {
    // The drift-skip guard foldMarkupIntoLines relies on: nulls must never be
    // selected, even when they sit at the position that would otherwise win.
    expect(residualTargetIndex([10, null, 20, null, 5])).toBe(2);
  });

  it("never selects a $0 (free) line when a positive line is present", () => {
    expect(residualTargetIndex([33.33, 33.34, 0])).toBe(1);
  });

  it("breaks ties by picking the FIRST occurrence of the largest amount", () => {
    expect(residualTargetIndex([20, 5, 20])).toBe(0);
  });
});
