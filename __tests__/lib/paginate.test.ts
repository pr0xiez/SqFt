import { describe, expect, it } from "vitest";
import { paginate } from "@/lib/hooks/useTableQueryState";

describe("paginate", () => {
  const rows = Array.from({ length: 73 }, (_, i) => ({ id: i + 1 }));

  it("returns the first page worth of rows", () => {
    const out = paginate(rows, 1, 25);
    expect(out.slice).toHaveLength(25);
    expect(out.slice[0]).toEqual({ id: 1 });
    expect(out.slice[24]).toEqual({ id: 25 });
    expect(out.safePage).toBe(1);
    expect(out.pageCount).toBe(3);
    expect(out.total).toBe(73);
  });

  it("returns the trailing rows on the last partial page", () => {
    const out = paginate(rows, 3, 25);
    expect(out.slice).toHaveLength(23); // 73 - 25*2
    expect(out.slice[0]).toEqual({ id: 51 });
    expect(out.slice.at(-1)).toEqual({ id: 73 });
  });

  it("clamps page above pageCount down to the last page", () => {
    const out = paginate(rows, 99, 25);
    expect(out.safePage).toBe(3);
    expect(out.slice[0]).toEqual({ id: 51 });
  });

  it("clamps page below 1 up to the first page", () => {
    const out = paginate(rows, 0, 25);
    expect(out.safePage).toBe(1);
    expect(out.slice[0]).toEqual({ id: 1 });
  });

  it("handles empty input with pageCount of 1", () => {
    const out = paginate([], 1, 25);
    expect(out.slice).toEqual([]);
    expect(out.pageCount).toBe(1);
    expect(out.total).toBe(0);
    expect(out.safePage).toBe(1);
  });

  it("handles input smaller than one page", () => {
    const small = rows.slice(0, 10);
    const out = paginate(small, 1, 25);
    expect(out.slice).toHaveLength(10);
    expect(out.pageCount).toBe(1);
  });

  it("computes pageCount correctly when total is an exact multiple of perPage", () => {
    const exact = rows.slice(0, 50);
    const out = paginate(exact, 2, 25);
    expect(out.pageCount).toBe(2);
    expect(out.slice).toHaveLength(25);
    expect(out.slice.at(-1)).toEqual({ id: 50 });
  });

  it("does not mutate the input array", () => {
    const before = rows.slice();
    paginate(rows, 2, 25);
    expect(rows).toEqual(before);
  });

  it("supports perPage larger than total (one page, all rows)", () => {
    const out = paginate(rows, 1, 200);
    expect(out.slice).toEqual(rows);
    expect(out.pageCount).toBe(1);
    expect(out.safePage).toBe(1);
  });
});
