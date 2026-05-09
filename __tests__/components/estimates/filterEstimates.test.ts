import { describe, expect, it } from "vitest";
import {
  type EstimateStatus,
  filterEstimates,
} from "@/components/estimates/filterEstimates";

type E = {
  id: number;
  customer?: { name: string } | null;
  items?: { type: string }[];
  quotes?: unknown[];
};

const sample: E[] = [
  // 1: empty (no rooms, no quotes)
  { id: 1, customer: { name: "Alice Smith" }, items: [], quotes: [] },
  // 2: measured (has rooms, no quotes)
  {
    id: 2,
    customer: { name: "Bob Jones" },
    items: [{ type: "room" }, { type: "room" }],
    quotes: [],
  },
  // 3: quoted (has rooms and a quote)
  {
    id: 3,
    customer: { name: "Carol Lee" },
    items: [{ type: "room" }],
    quotes: [{}],
  },
  // 4: empty via missing items field; defensive check
  { id: 4, customer: { name: "Dan Park" } },
  // 5: only non-room items (e.g. notes), still counts as empty
  {
    id: 5,
    customer: { name: "Eve North" },
    items: [{ type: "note" }],
    quotes: [],
  },
];

describe("filterEstimates", () => {
  it("returns input unchanged when query is empty and status is 'all'", () => {
    expect(filterEstimates(sample, "", "all")).toEqual(sample);
  });

  it("status 'empty' keeps estimates with zero room items", () => {
    const result = filterEstimates(sample, "", "empty");
    expect(result.map((e) => e.id).sort()).toEqual([1, 4, 5]);
  });

  it("status 'measured' keeps estimates with rooms but no quotes", () => {
    const result = filterEstimates(sample, "", "measured");
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("status 'quoted' keeps estimates with at least one quote", () => {
    const result = filterEstimates(sample, "", "quoted");
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("query matches by stringified id", () => {
    const result = filterEstimates(sample, "3", "all");
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("query matches id with a leading '#'", () => {
    const result = filterEstimates(sample, "#2", "all");
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("query matches by customer name case-insensitively", () => {
    const result = filterEstimates(sample, "alice", "all");
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("composes query and status (both must match)", () => {
    // status 'measured' = id 2 only; query 'bob' also matches id 2
    expect(filterEstimates(sample, "bob", "measured").map((e) => e.id)).toEqual(
      [2]
    );
    // status 'quoted' = id 3 only; 'bob' does not match id 3
    expect(filterEstimates(sample, "bob", "quoted")).toEqual([]);
  });

  it("trims whitespace from the query before matching", () => {
    const result = filterEstimates(sample, "   smith   ", "all");
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterEstimates(sample, "zzz-no-match", "all")).toEqual([]);
  });

  it("handles missing customer without throwing", () => {
    const data: E[] = [{ id: 9, customer: null, items: [], quotes: [] }];
    expect(filterEstimates(data, "9", "all").map((e) => e.id)).toEqual([9]);
    expect(filterEstimates(data, "anyone", "all")).toEqual([]);
  });

  it("status type accepts the four expected values", () => {
    const statuses: EstimateStatus[] = ["all", "empty", "measured", "quoted"];
    for (const s of statuses) {
      expect(Array.isArray(filterEstimates(sample, "", s))).toBe(true);
    }
  });
});
