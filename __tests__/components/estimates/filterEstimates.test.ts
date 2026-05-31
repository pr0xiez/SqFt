import { describe, expect, it } from "vitest";
import { filterEstimates } from "@/components/estimates/filterEstimates";

type Q = {
  id: number;
  estimateNumber: number;
  status: string;
  siteMeasure: {
    id: number;
    siteMeasureNumber?: number | null;
    location?: { customer?: { name: string } | null } | null | undefined;
  };
};

const loc = (name: string) => ({ customer: { name } });

const sample: Q[] = [
  {
    id: 101,
    estimateNumber: 7,
    status: "draft",
    siteMeasure: {
      id: 11,
      siteMeasureNumber: 5,
      location: loc("Alice Smith"),
    },
  },
  {
    id: 102,
    estimateNumber: 8,
    status: "sent",
    siteMeasure: {
      id: 12,
      siteMeasureNumber: 6,
      location: loc("Bob Jones"),
    },
  },
  {
    id: 103,
    estimateNumber: 9,
    status: "approved",
    siteMeasure: {
      id: 13,
      siteMeasureNumber: null,
      location: loc("Carol Lee"),
    },
  },
  {
    id: 104,
    estimateNumber: 10,
    status: "declined",
    siteMeasure: { id: 14, siteMeasureNumber: 8, location: null },
  },
];

describe("filterEstimates", () => {
  it("returns input unchanged when query is empty and status is 'all'", () => {
    expect(filterEstimates(sample, "", "all")).toEqual(sample);
  });

  it("status='draft' keeps only draft estimates", () => {
    expect(filterEstimates(sample, "", "draft").map((q) => q.id)).toEqual([
      101,
    ]);
  });

  it("status='sent' keeps only sent estimates", () => {
    expect(filterEstimates(sample, "", "sent").map((q) => q.id)).toEqual([102]);
  });

  it("status='approved' keeps only approved estimates", () => {
    expect(filterEstimates(sample, "", "approved").map((q) => q.id)).toEqual([
      103,
    ]);
  });

  it("status='declined' keeps only declined estimates", () => {
    expect(filterEstimates(sample, "", "declined").map((q) => q.id)).toEqual([
      104,
    ]);
  });

  it("query matches by stringified estimateNumber", () => {
    expect(filterEstimates(sample, "7", "all").map((q) => q.id)).toEqual([101]);
  });

  it("query handles a leading '#'", () => {
    expect(filterEstimates(sample, "#7", "all").map((q) => q.id)).toEqual([
      101,
    ]);
  });

  it("query matches by siteMeasure.siteMeasureNumber", () => {
    expect(filterEstimates(sample, "6", "all").map((q) => q.id)).toEqual([102]);
  });

  it("query falls back to siteMeasure.id when siteMeasureNumber is null", () => {
    expect(filterEstimates(sample, "13", "all").map((q) => q.id)).toEqual([
      103,
    ]);
  });

  it("query matches customer name case-insensitively", () => {
    expect(filterEstimates(sample, "ALICE", "all").map((q) => q.id)).toEqual([
      101,
    ]);
  });

  it("safely skips a missing customer on a customer-name query", () => {
    const result = filterEstimates(sample, "smith", "all");
    expect(result.map((q) => q.id)).toEqual([101]);
  });

  it("composes query and status (both must hold)", () => {
    expect(filterEstimates(sample, "7", "sent")).toEqual([]);
  });

  it("trims whitespace from the query before matching", () => {
    expect(
      filterEstimates(sample, "   alice   ", "all").map((q) => q.id)
    ).toEqual([101]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterEstimates(sample, "zzz-no-match", "all")).toEqual([]);
  });
});
