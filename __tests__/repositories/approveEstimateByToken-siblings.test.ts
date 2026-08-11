import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveEstimateByToken } from "@/lib/repositories/estimateApprovalRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    estimate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    estimateApproval: {
      create: vi.fn(),
    },
    estimateEvent: {
      create: vi.fn(),
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

const baseInput = {
  estimateId: 7,
  ip: "127.0.0.1",
  userAgent: "vitest",
  snapshot: { totals: {} },
};

describe("approveEstimateByToken — sibling auto-decline", () => {
  it("auto-declines open sibling estimates on the same siteMeasure", async () => {
    tx.estimate.findFirst.mockResolvedValueOnce({
      id: 7,
      status: "sent",
      siteMeasureId: 42,
      estimateNumber: 5002,
    });
    tx.estimate.findMany.mockResolvedValueOnce([{ id: 8 }, { id: 9 }]);

    const result = await approveEstimateByToken(baseInput);

    expect(result).toBe("ok");
    // sibling sweep updateMany — driven off the ids collected by the earlier
    // findMany, not a re-stated siteMeasureId/status where.
    const siblingCall = tx.estimate.updateMany.mock.calls.find(
      (c: unknown[]) =>
        // biome-ignore lint/suspicious/noExplicitAny: test inspect
        (c[0] as any).where?.id?.in !== undefined
    );
    expect(siblingCall).toBeTruthy();
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const where = (siblingCall as any[])[0].where;
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const data = (siblingCall as any[])[0].data;
    expect(where.id.in).toEqual([8, 9]);
    expect(data.status).toBe("declined");
    expect(data.declineReason).toMatch(
      /^Superseded — customer approved Estimate #5002/
    );
    // one EstimateEvent per affected sibling
    expect(tx.estimateEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          estimateId: 8,
          type: "declined",
          source: "system_supersede",
        }),
        expect.objectContaining({
          estimateId: 9,
          type: "declined",
          source: "system_supersede",
        }),
      ]),
    });
  });

  it("does not touch already-terminal siblings", async () => {
    tx.estimate.findFirst.mockResolvedValueOnce({
      id: 7,
      status: "sent",
      siteMeasureId: 42,
      estimateNumber: 5002,
    });
    tx.estimate.findMany.mockResolvedValueOnce([]);

    await approveEstimateByToken(baseInput);

    // updateMany still called, but with an empty in-scope set — `id: { in: [] }`
    // matches no rows, so this is a safe no-op.
    const siblingCall = tx.estimate.updateMany.mock.calls.find(
      (c: unknown[]) =>
        // biome-ignore lint/suspicious/noExplicitAny: test inspect
        (c[0] as any).where?.id?.in !== undefined
    );
    expect(siblingCall).toBeTruthy();
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    expect((siblingCall as any[])[0].where.id.in).toEqual([]);
    expect(tx.estimateEvent.createMany).not.toHaveBeenCalled();
  });
});
