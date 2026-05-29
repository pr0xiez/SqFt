import { describe, expect, it } from "vitest";
import {
  filterSiteMeasures,
  type SiteMeasureStatus,
} from "@/components/siteMeasures/filterSiteMeasures";

type E = {
  id: number;
  customer?: { name: string } | null;
  items?: { type: string }[];
  estimates?: unknown[];
};

const sample: E[] = [
  // 1: empty (no rooms, no estimates)
  { id: 1, customer: { name: "Alice Smith" }, items: [], estimates: [] },
  // 2: measured (has rooms, no estimates)
  {
    id: 2,
    customer: { name: "Bob Jones" },
    items: [{ type: "room" }, { type: "room" }],
    estimates: [],
  },
  // 3: estimated (has rooms and a estimate)
  {
    id: 3,
    customer: { name: "Carol Lee" },
    items: [{ type: "room" }],
    estimates: [{}],
  },
  // 4: empty via missing items field; defensive check
  { id: 4, customer: { name: "Dan Park" } },
  // 5: only non-room items (e.g. notes), still counts as empty
  {
    id: 5,
    customer: { name: "Eve North" },
    items: [{ type: "note" }],
    estimates: [],
  },
];

describe("filterSiteMeasures", () => {
  it("returns input unchanged when query is empty and status is 'all'", () => {
    expect(filterSiteMeasures(sample, "", "all")).toEqual(sample);
  });

  it("status 'empty' keeps siteMeasures with zero room items", () => {
    const result = filterSiteMeasures(sample, "", "empty");
    expect(result.map((e) => e.id).sort()).toEqual([1, 4, 5]);
  });

  it("status 'measured' keeps siteMeasures with rooms but no estimates", () => {
    const result = filterSiteMeasures(sample, "", "measured");
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("status 'estimated' keeps siteMeasures with at least one estimate", () => {
    const result = filterSiteMeasures(sample, "", "estimated");
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("query matches by stringified id", () => {
    const result = filterSiteMeasures(sample, "3", "all");
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("query matches id with a leading '#'", () => {
    const result = filterSiteMeasures(sample, "#2", "all");
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("query matches by customer name case-insensitively", () => {
    const result = filterSiteMeasures(sample, "alice", "all");
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("composes query and status (both must match)", () => {
    // status 'measured' = id 2 only; query 'bob' also matches id 2
    expect(
      filterSiteMeasures(sample, "bob", "measured").map((e) => e.id)
    ).toEqual([2]);
    // status 'estimated' = id 3 only; 'bob' does not match id 3
    expect(filterSiteMeasures(sample, "bob", "estimated")).toEqual([]);
  });

  it("trims whitespace from the query before matching", () => {
    const result = filterSiteMeasures(sample, "   smith   ", "all");
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSiteMeasures(sample, "zzz-no-match", "all")).toEqual([]);
  });

  it("handles missing customer without throwing", () => {
    const data: E[] = [{ id: 9, customer: null, items: [], estimates: [] }];
    expect(filterSiteMeasures(data, "9", "all").map((e) => e.id)).toEqual([9]);
    expect(filterSiteMeasures(data, "anyone", "all")).toEqual([]);
  });

  it("status type accepts the four expected values", () => {
    const statuses: SiteMeasureStatus[] = [
      "all",
      "empty",
      "measured",
      "estimated",
    ];
    for (const s of statuses) {
      expect(Array.isArray(filterSiteMeasures(sample, "", s))).toBe(true);
    }
  });
});
