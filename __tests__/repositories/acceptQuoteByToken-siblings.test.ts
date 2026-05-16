import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptQuoteByToken } from "@/lib/repositories/quoteSignatureRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    quote: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    quoteSignature: {
      create: vi.fn(),
    },
    quoteEvent: {
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
  quoteId: 7,
  signedByName: "Jane",
  signedByEmail: "jane@example.com",
  signatureData: "data:image/png;base64,xxxx",
  signedIp: "127.0.0.1",
  signedUserAgent: "vitest",
  consentText: "consent",
  quoteSnapshot: { totals: {} },
  snapshotHash: "hash",
};

describe("acceptQuoteByToken — sibling auto-decline", () => {
  it("auto-declines open sibling quotes on the same estimate", async () => {
    tx.quote.findFirst.mockResolvedValueOnce({
      id: 7,
      status: "sent",
      estimateId: 42,
      quoteNumber: 5002,
    });
    tx.quote.findMany.mockResolvedValueOnce([
      { id: 8, quoteNumber: 5003 },
      { id: 9, quoteNumber: 5004 },
    ]);

    const result = await acceptQuoteByToken(baseInput);

    expect(result).toBe("ok");
    // sibling sweep updateMany
    const siblingCall = tx.quote.updateMany.mock.calls.find(
      (c: unknown[]) =>
        // biome-ignore lint/suspicious/noExplicitAny: test inspect
        (c[0] as any).where?.id?.not === 7
    );
    expect(siblingCall).toBeTruthy();
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const where = (siblingCall as any[])[0].where;
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const data = (siblingCall as any[])[0].data;
    expect(where.estimateId).toBe(42);
    expect(where.status).toEqual({ in: ["draft", "sent", "viewed"] });
    expect(data.status).toBe("declined");
    expect(data.declineReason).toMatch(
      /^Superseded — customer accepted Quote #5002/
    );
    // one QuoteEvent per affected sibling
    expect(tx.quoteEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          quoteId: 8,
          type: "declined",
          source: "system_supersede",
        }),
        expect.objectContaining({
          quoteId: 9,
          type: "declined",
          source: "system_supersede",
        }),
      ]),
    });
  });

  it("does not touch already-terminal siblings", async () => {
    tx.quote.findFirst.mockResolvedValueOnce({
      id: 7,
      status: "sent",
      estimateId: 42,
      quoteNumber: 5002,
    });
    tx.quote.findMany.mockResolvedValueOnce([]);

    await acceptQuoteByToken(baseInput);

    // updateMany still called, but with an empty in-scope set
    const siblingCall = tx.quote.updateMany.mock.calls.find(
      (c: unknown[]) =>
        // biome-ignore lint/suspicious/noExplicitAny: test inspect
        (c[0] as any).where?.id?.not === 7
    );
    expect(siblingCall).toBeTruthy();
    expect(tx.quoteEvent.createMany).not.toHaveBeenCalled();
  });
});
