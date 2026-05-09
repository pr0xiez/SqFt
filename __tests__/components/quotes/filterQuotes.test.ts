import { describe, expect, it } from "vitest";
import { filterQuotes } from "@/components/quotes/filterQuotes";

type Q = {
  id: number;
  quoteNumber: number;
  status: string;
  estimate: {
    id: number;
    estimateNumber?: number | null;
    customer?: { name: string } | null | undefined;
  };
};

const sample: Q[] = [
  {
    id: 101,
    quoteNumber: 7,
    status: "draft",
    estimate: { id: 11, estimateNumber: 5, customer: { name: "Alice Smith" } },
  },
  {
    id: 102,
    quoteNumber: 8,
    status: "sent",
    estimate: { id: 12, estimateNumber: 6, customer: { name: "Bob Jones" } },
  },
  {
    id: 103,
    quoteNumber: 9,
    status: "accepted",
    estimate: { id: 13, estimateNumber: null, customer: { name: "Carol Lee" } },
  },
  {
    id: 104,
    quoteNumber: 10,
    status: "declined",
    estimate: { id: 14, estimateNumber: 8, customer: null },
  },
];

describe("filterQuotes", () => {
  it("returns input unchanged when query is empty and status is 'all'", () => {
    expect(filterQuotes(sample, "", "all")).toEqual(sample);
  });

  it("status='draft' keeps only draft quotes", () => {
    expect(filterQuotes(sample, "", "draft").map((q) => q.id)).toEqual([101]);
  });

  it("status='sent' keeps only sent quotes", () => {
    expect(filterQuotes(sample, "", "sent").map((q) => q.id)).toEqual([102]);
  });

  it("status='accepted' keeps only accepted quotes", () => {
    expect(filterQuotes(sample, "", "accepted").map((q) => q.id)).toEqual([
      103,
    ]);
  });

  it("status='declined' keeps only declined quotes", () => {
    expect(filterQuotes(sample, "", "declined").map((q) => q.id)).toEqual([
      104,
    ]);
  });

  it("query matches by stringified quoteNumber", () => {
    expect(filterQuotes(sample, "7", "all").map((q) => q.id)).toEqual([101]);
  });

  it("query handles a leading '#'", () => {
    expect(filterQuotes(sample, "#7", "all").map((q) => q.id)).toEqual([101]);
  });

  it("query matches by estimate.estimateNumber", () => {
    expect(filterQuotes(sample, "6", "all").map((q) => q.id)).toEqual([102]);
  });

  it("query falls back to estimate.id when estimateNumber is null", () => {
    expect(filterQuotes(sample, "13", "all").map((q) => q.id)).toEqual([103]);
  });

  it("query matches customer name case-insensitively", () => {
    expect(filterQuotes(sample, "ALICE", "all").map((q) => q.id)).toEqual([
      101,
    ]);
  });

  it("safely skips a missing customer on a customer-name query", () => {
    const result = filterQuotes(sample, "smith", "all");
    expect(result.map((q) => q.id)).toEqual([101]);
  });

  it("composes query and status (both must hold)", () => {
    expect(filterQuotes(sample, "7", "sent")).toEqual([]);
  });

  it("trims whitespace from the query before matching", () => {
    expect(filterQuotes(sample, "   alice   ", "all").map((q) => q.id)).toEqual(
      [101]
    );
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterQuotes(sample, "zzz-no-match", "all")).toEqual([]);
  });
});
