import { describe, expect, it } from "vitest";
import {
  buildSearchWhere,
  computeFacets,
  searchableInt,
} from "@/lib/repositories/search";

const INT4_MAX = 2_147_483_647;

describe("searchableInt", () => {
  it("returns the number for in-range digit strings", () => {
    expect(searchableInt("0")).toBe(0);
    expect(searchableInt("42")).toBe(42);
    expect(searchableInt("007")).toBe(7);
  });

  it("accepts the int4 boundary and rejects one past it", () => {
    expect(searchableInt(String(INT4_MAX))).toBe(INT4_MAX);
    expect(searchableInt(String(INT4_MAX + 1))).toBeNull();
  });

  it("rejects very long and unsafe-integer digit strings", () => {
    expect(searchableInt("9".repeat(20))).toBeNull();
    expect(searchableInt("9".repeat(400))).toBeNull();
    expect(searchableInt(String(Number.MAX_SAFE_INTEGER + 2))).toBeNull();
  });

  it("rejects empty, non-digit, mixed, signed and decimal tokens", () => {
    for (const s of [
      "",
      " ",
      "abc",
      "12a",
      "a12",
      "-5",
      "+5",
      "1.5",
      "1 2",
      "#12",
    ]) {
      expect(searchableInt(s)).toBeNull();
    }
  });
});

describe("buildSearchWhere", () => {
  const clauses = {
    customerName: (c: string) => ({ name: c }),
    number: (n: number) => ({ number: n }),
  };

  it("returns null for empty or whitespace queries", () => {
    expect(buildSearchWhere("", clauses)).toBeNull();
    expect(buildSearchWhere("   ", clauses)).toBeNull();
    expect(buildSearchWhere("#", clauses)).toBeNull();
  });

  it("adds a number clause for in-range numeric queries, stripping #", () => {
    expect(buildSearchWhere(" #123 ", clauses)).toEqual({
      OR: [{ name: "123" }, { number: 123 }],
    });
  });

  it("searches text only (no throw) for over-range numeric queries", () => {
    const big = String(INT4_MAX + 1);
    expect(buildSearchWhere(big, clauses)).toEqual({ OR: [{ name: big }] });
    const long = "1".repeat(50);
    expect(buildSearchWhere(long, clauses)).toEqual({ OR: [{ name: long }] });
  });

  it("searches text only for non-numeric queries", () => {
    expect(buildSearchWhere("smith", clauses)).toEqual({
      OR: [{ name: "smith" }],
    });
  });
});

describe("computeFacets", () => {
  it("seeds zeros, totals all, and applies extra buckets", () => {
    const f = computeFacets(
      [
        { status: "sent", _count: { _all: 2 } },
        { status: "partial", _count: { _all: 3 } },
        { status: "weird", _count: null },
      ],
      ["draft", "sent", "partial"],
      { open: (s) => s === "sent" || s === "partial" }
    );
    expect(f).toEqual({ all: 5, draft: 0, sent: 2, partial: 3, open: 5 });
  });
});
