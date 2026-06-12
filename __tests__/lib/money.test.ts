import { describe, expect, it } from "vitest";
import { residualTargetIndex, round2 } from "@/lib/money";

describe("round2", () => {
  it("rounds to two decimal places, half-up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68); // the classic binary-float .005 trap
    expect(round2(1.014)).toBe(1.01);
    expect(round2(1.016)).toBe(1.02);
  });

  it("settles IEEE-754 sums/products that would otherwise carry drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004 raw
    expect(round2(100.3 + 0.03)).toBe(100.33); // 100.33000000000001 raw
    expect(round2(3 * 100.3)).toBe(300.9); // 300.90000000000003 raw
  });

  it("is idempotent and leaves already-clean cents untouched", () => {
    expect(round2(143.11)).toBe(143.11);
    expect(round2(round2(9.98475))).toBe(9.98);
    expect(round2(0)).toBe(0);
  });

  it("handles negative amounts", () => {
    expect(round2(-1.005)).toBe(-1);
    expect(round2(-2.674)).toBe(-2.67);
  });
});

describe("residualTargetIndex", () => {
  it("returns the index of the largest positive amount", () => {
    expect(residualTargetIndex([10, 50, 30])).toBe(1);
  });

  it("never targets a null (unresolved) or $0 line", () => {
    expect(residualTargetIndex([0, null, 5, 0])).toBe(2);
  });

  it("falls back to the last resolved entry when every amount is <= 0", () => {
    expect(residualTargetIndex([0, null, 0])).toBe(2);
    expect(residualTargetIndex([-3, -1])).toBe(1);
  });

  it("returns -1 when there is no resolved entry at all", () => {
    expect(residualTargetIndex([null, null])).toBe(-1);
    expect(residualTargetIndex([])).toBe(-1);
  });
});
