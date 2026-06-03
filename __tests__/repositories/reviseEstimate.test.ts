import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviseEstimate } from "@/lib/repositories/estimateRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    estimate: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    lineItem: {
      createMany: vi.fn(),
    },
    estimateEvent: {
      create: vi.fn(),
    },
    organization: {
      update: vi.fn(),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";

// biome-ignore lint/suspicious/noExplicitAny: test helper
const tx = (prisma as any).__tx;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reviseEstimate", () => {
  it("clones a estimate into a new draft with revisedFromId set", async () => {
    // First findFirst → the original estimate being revised.
    tx.estimate.findFirst.mockResolvedValueOnce({
      id: 7,
      orgId: "org_1",
      siteMeasureId: 42,
      estimateNumber: 5001,
      convenienceFeeRate: 0.03,
      markupPct: 35,
      depositPct: 0.5,
      items: [{ id: "r1", type: "room", name: "Kitchen", area: 200 }],
      lineItems: [
        {
          name: "Hardwood",
          unitLabel: "sqft",
          rate: 9.5,
          qtyMode: "auto",
          qtyManual: null,
          roomLinks: [],
        },
      ],
    });
    // Second findFirst → the hydrate the repo reads to sync Estimate.total on
    // the cloned draft (lineItems + siteMeasure.items).
    tx.estimate.findFirst.mockResolvedValueOnce({
      id: 99,
      markupPct: 35,
      convenienceFeeRate: 0.03,
      depositPct: 0.5,
      lineItems: [],
      siteMeasure: { items: [] },
    });
    tx.organization.update.mockResolvedValue({ nextEstimateNumber: 5002 });
    tx.estimate.create.mockResolvedValue({ id: 99 });

    const result = await reviseEstimate(7, "org_1");

    expect(result).toEqual({ id: 99 });
    expect(tx.estimate.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.estimate.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("draft");
    expect(createArgs.data.revisedFromId).toBe(7);
    expect(createArgs.data.approvedAt).toBeUndefined();
    expect(createArgs.data.declinedAt).toBeUndefined();
    expect(createArgs.data.approvalToken).toBeDefined();
    expect(tx.lineItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.estimateEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimateId: 99,
          type: "revised_from",
          source: "builder",
          metadata: { revisedFromId: 7, revisedFromEstimateNumber: 5001 },
        }),
      })
    );
  });

  it("returns null when the original estimate is missing or wrong org", async () => {
    tx.estimate.findFirst.mockResolvedValue(null);
    const result = await reviseEstimate(7, "org_1");
    expect(result).toBeNull();
    expect(tx.estimate.create).not.toHaveBeenCalled();
  });
});
