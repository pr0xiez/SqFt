import { describe, expect, it } from "vitest";
import {
  type SchedulableEstimateRow,
  toSchedulableCandidates,
} from "@/lib/schedule/backlog";

function row(
  over: Partial<SchedulableEstimateRow> = {}
): SchedulableEstimateRow {
  return {
    id: 77,
    estimateNumber: 5006,
    status: "approved",
    total: 3095.5,
    approvedAt: new Date("2026-05-02T10:45:00Z"),
    siteMeasure: {
      location: {
        address: "12 Oak Ln",
        customer: { id: 5, name: "Henderson" },
      },
    },
    events: [],
    ...over,
  };
}

describe("toSchedulableCandidates", () => {
  it("projects an approved estimate with no job events", () => {
    expect(toSchedulableCandidates([row()])).toEqual([
      {
        id: 77,
        estimateNumber: 5006,
        customerId: 5,
        customerName: "Henderson",
        address: "12 Oak Ln",
        total: 3095.5,
        approvedAt: "2026-05-02T10:45:00.000Z",
      },
    ]);
  });

  it("drops estimates that are not approved", () => {
    for (const status of ["draft", "sent", "viewed", "declined"]) {
      expect(toSchedulableCandidates([row({ status })])).toEqual([]);
    }
  });

  it("drops estimates that already have a job event", () => {
    expect(toSchedulableCandidates([row({ events: [{ id: 1 }] })])).toEqual([]);
  });

  it("is null-safe on the site-measure chain and approvedAt", () => {
    const [c] = toSchedulableCandidates([
      row({ siteMeasure: null, approvedAt: null, total: null }),
    ]);
    expect(c.customerId).toBeNull();
    expect(c.customerName).toBe("—");
    expect(c.address).toBeNull();
    expect(c.total).toBeNull();
    expect(c.approvedAt).toBeNull();
  });

  it("accepts approvedAt as an ISO string (API round-trip)", () => {
    const [c] = toSchedulableCandidates([
      row({ approvedAt: "2026-05-02T10:45:00.000Z" }),
    ]);
    expect(c.approvedAt).toBe("2026-05-02T10:45:00.000Z");
  });
});
