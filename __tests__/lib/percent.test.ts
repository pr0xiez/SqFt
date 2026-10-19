import { describe, expect, it } from "vitest";
import {
  formatPercent,
  fromDisplayPercent,
  toDisplayPercent,
} from "@/lib/percent";

describe("toDisplayPercent", () => {
  it("converts whole-percent rates", () => {
    expect(toDisplayPercent(0.5)).toBe(50);
    expect(toDisplayPercent(0)).toBe(0);
    expect(toDisplayPercent(1)).toBe(100);
  });
  it("keeps one decimal by default and avoids float noise", () => {
    expect(toDisplayPercent(0.125)).toBe(12.5);
    expect(toDisplayPercent(0.07)).toBe(7);
    expect(toDisplayPercent(0.0333)).toBe(3.3);
  });
  it("honours an explicit precision", () => {
    expect(toDisplayPercent(0.125, 0)).toBe(13);
    expect(toDisplayPercent(0.12345, 2)).toBe(12.35);
  });
});

describe("fromDisplayPercent", () => {
  it("converts to a decimal rate", () => {
    expect(fromDisplayPercent(50)).toBe(0.5);
    expect(fromDisplayPercent(12.5)).toBe(0.125);
    expect(fromDisplayPercent(0)).toBe(0);
    expect(fromDisplayPercent(100)).toBe(1);
  });
  it("round-trips", () => {
    for (const p of [0, 1, 7, 12.5, 33.3, 99.9, 100]) {
      expect(toDisplayPercent(fromDisplayPercent(p))).toBe(p);
    }
  });
});

describe("formatPercent", () => {
  it("drops trailing zeros", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.125)).toBe("12.5%");
    expect(formatPercent(0.125, 0)).toBe("13%");
  });
});
