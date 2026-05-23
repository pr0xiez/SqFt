import { describe, expect, it } from "vitest";
import { cycleSort, sortBy } from "@/lib/sort";

describe("cycleSort", () => {
  it("starts with the requested default direction when toggling a new column", () => {
    expect(cycleSort(null, "name")).toEqual({ key: "name", direction: "asc" });
    expect(cycleSort(null, "date", "desc")).toEqual({
      key: "date",
      direction: "desc",
    });
  });

  it("flips direction when re-clicking the same column", () => {
    const first = cycleSort(null, "total", "desc");
    const second = cycleSort(first, "total", "desc");
    expect(second).toEqual({ key: "total", direction: "asc" });
    const third = cycleSort(second, "total", "desc");
    expect(third).toEqual({ key: "total", direction: "desc" });
  });

  it("resets to the column's default direction when switching columns", () => {
    const first = cycleSort(null, "name", "asc");
    const second = cycleSort(first, "date", "desc");
    expect(second).toEqual({ key: "date", direction: "desc" });
  });
});

describe("sortBy", () => {
  type Row = { id: number; name: string; total: number | null; at: string };
  const rows: Row[] = [
    { id: 1, name: "Charlie", total: 200, at: "2026-01-05" },
    { id: 2, name: "alpha", total: null, at: "2026-01-02" },
    { id: 3, name: "Bravo", total: 50, at: "2026-01-10" },
  ];
  const accessors = {
    name: (r: Row) => r.name,
    total: (r: Row) => r.total,
    at: (r: Row) => new Date(r.at),
  };

  it("returns input unchanged when sort is null", () => {
    expect(sortBy(rows, null, accessors)).toEqual(rows);
  });

  it("sorts strings case-insensitively ascending", () => {
    const out = sortBy(rows, { key: "name", direction: "asc" }, accessors);
    expect(out.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("sorts strings descending", () => {
    const out = sortBy(rows, { key: "name", direction: "desc" }, accessors);
    expect(out.map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("places nullish values last regardless of direction", () => {
    const asc = sortBy(rows, { key: "total", direction: "asc" }, accessors);
    expect(asc.map((r) => r.id)).toEqual([3, 1, 2]);
    const desc = sortBy(rows, { key: "total", direction: "desc" }, accessors);
    expect(desc.map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("sorts dates chronologically", () => {
    const out = sortBy(rows, { key: "at", direction: "asc" }, accessors);
    expect(out.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("is stable for tied keys", () => {
    type Tied = { id: number; group: string };
    const data: Tied[] = [
      { id: 1, group: "a" },
      { id: 2, group: "a" },
      { id: 3, group: "a" },
    ];
    const out = sortBy(
      data,
      { key: "group", direction: "asc" },
      { group: (r) => r.group }
    );
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
