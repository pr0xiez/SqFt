import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateLockedError } from "@/lib/api/errors";
import { saveEstimate } from "@/lib/repositories/estimateRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    estimate: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    lineItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
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

beforeEach(() => vi.clearAllMocks());

describe("saveEstimate lockdown", () => {
  it("throws EstimateLockedError and does not mutate when estimate is approved", async () => {
    tx.estimate.findFirst.mockResolvedValue({ id: 7, status: "approved" });
    await expect(
      saveEstimate(7, "org_1", { convenienceFeeRate: 0.1 })
    ).rejects.toBeInstanceOf(EstimateLockedError);
    expect(tx.estimate.update).not.toHaveBeenCalled();
  });

  it("throws EstimateLockedError and does not mutate when estimate is declined", async () => {
    tx.estimate.findFirst.mockResolvedValue({ id: 7, status: "declined" });
    await expect(
      saveEstimate(7, "org_1", { convenienceFeeRate: 0.1 })
    ).rejects.toBeInstanceOf(EstimateLockedError);
    expect(tx.estimate.update).not.toHaveBeenCalled();
  });
});
