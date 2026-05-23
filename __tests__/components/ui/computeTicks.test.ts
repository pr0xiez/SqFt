import { describe, expect, it } from "vitest";
import { computeTicks } from "@/components/ui/Pagination";

describe("computeTicks (tape-measure tick thinning)", () => {
  it("renders one tick per page when pageCount <= 30", () => {
    expect(computeTicks(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(computeTicks(15, 30)).toHaveLength(30);
  });

  it("steps by 2 between 31 and 60 pages, keeping endpoints", () => {
    const ticks = computeTicks(10, 50);
    expect(ticks[0]).toBe(1);
    expect(ticks.at(-1)).toBe(50);
    // The bulk of the ticks should be even (10's neighbors are odd, but
    // the modulo rule emits every even page from 2..48).
    const even = ticks.filter((n) => n !== 1 && n !== 50 && n % 2 === 0);
    expect(even.length).toBeGreaterThan(15);
  });

  it("steps by 5 between 61 and 120 pages", () => {
    const ticks = computeTicks(50, 100);
    expect(ticks).toContain(1);
    expect(ticks).toContain(100);
    expect(ticks).toContain(5);
    expect(ticks).toContain(95);
    expect(ticks).not.toContain(3); // odd, not a multiple of 5
  });

  it("steps by 10 above 120 pages", () => {
    const ticks = computeTicks(1, 300);
    expect(ticks).toContain(10);
    expect(ticks).toContain(290);
    expect(ticks).not.toContain(15); // not a multiple of 10
  });

  it("always includes the current page, even if it would otherwise be thinned out", () => {
    // pageCount=100 thins to step=5; page 73 isn't a multiple of 5 but
    // must still appear so the active indicator has a tick to land on.
    const ticks = computeTicks(73, 100);
    expect(ticks).toContain(73);
  });

  it("always includes page 1 and the last page", () => {
    expect(computeTicks(50, 100)[0]).toBe(1);
    expect(computeTicks(50, 100).at(-1)).toBe(100);
    expect(computeTicks(7, 7)[0]).toBe(1);
    expect(computeTicks(7, 7).at(-1)).toBe(7);
  });

  it("returns sorted unique indices", () => {
    const ticks = computeTicks(20, 100);
    const sorted = [...ticks].sort((a, b) => a - b);
    expect(ticks).toEqual(sorted);
    const unique = new Set(ticks);
    expect(unique.size).toBe(ticks.length);
  });

  it("handles a single-page count", () => {
    expect(computeTicks(1, 1)).toEqual([1]);
  });
});
