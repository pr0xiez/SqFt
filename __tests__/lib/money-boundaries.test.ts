import { describe, expect, it } from "vitest";
import { residualTargetIndex, round2 } from "@/lib/money";

describe("round2", () => {
  it("rounds a plain .005 boundary up to the nearest cent", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.005)).toBe(0.01);
  });

  it("corrects classic binary-float precision errors", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754 double math.
    expect(round2(0.1 + 0.2)).toBe(0.3);
    // 1.005 stored in binary is actually ~1.00499999999999989..., which would
    // round DOWN to 1.00 without the Number.EPSILON nudge round2 applies.
    expect(round2(35.855)).toBe(35.85);
  });

  it("rounds negative numbers using the same EPSILON-nudged boundary", () => {
    expect(round2(-1.005)).toBe(-1);
    expect(round2(-2.345)).toBe(-2.34);
  });

  it("leaves already-rounded values unchanged", () => {
    expect(round2(10)).toBe(10);
    expect(round2(10.5)).toBe(10.5);
    expect(round2(99.99)).toBe(99.99);
    expect(round2(0)).toBe(0);
  });

  it("rounds ordinary sub-cent values to the nearest cent", () => {
    expect(round2(19.994)).toBe(19.99);
    expect(round2(19.996)).toBe(20);
  });
});

describe("residualTargetIndex", () => {
  it("returns the index of the largest positive amount", () => {
    expect(residualTargetIndex([10, 50, 25])).toBe(1);
    expect(residualTargetIndex([5, null, 5.01, 3])).toBe(2);
  });

  it("does not let a later equal-value amount steal the target from the first max", () => {
    expect(residualTargetIndex([20, 20, 5])).toBe(0);
  });

  it("falls back to the last resolved entry when every resolved amount is <= 0", () => {
    expect(residualTargetIndex([0, -5, -1])).toBe(2);
    expect(residualTargetIndex([-3, null, 0])).toBe(2);
    expect(residualTargetIndex([-3, null])).toBe(0);
  });

  it("returns -1 when there is no resolved entry at all", () => {
    expect(residualTargetIndex([])).toBe(-1);
    expect(residualTargetIndex([null, null, null])).toBe(-1);
  });

  it("never targets a null (unresolved) or zero line when a positive one exists", () => {
    expect(residualTargetIndex([null, 0, 12.34, null])).toBe(2);
  });
});
