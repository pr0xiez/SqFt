import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviseQuote } from "@/lib/repositories/quoteRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    quote: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    lineItem: {
      createMany: vi.fn(),
    },
    quoteEvent: {
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

describe("reviseQuote", () => {
  it("clones a quote into a new draft with revisedFromId set", async () => {
    tx.quote.findFirst.mockResolvedValue({
      id: 7,
      orgId: "org_1",
      estimateId: 42,
      quoteNumber: 5001,
      taxRate: 0.08,
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
    tx.organization.update.mockResolvedValue({ nextQuoteNumber: 5002 });
    tx.quote.create.mockResolvedValue({ id: 99 });

    const result = await reviseQuote(7, "org_1");

    expect(result).toEqual({ id: 99 });
    expect(tx.quote.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.quote.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("draft");
    expect(createArgs.data.revisedFromId).toBe(7);
    expect(createArgs.data.acceptedAt).toBeUndefined();
    expect(createArgs.data.declinedAt).toBeUndefined();
    expect(createArgs.data.approvalToken).toBeDefined();
    expect(tx.lineItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.quoteEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 99,
          type: "revised_from",
          source: "builder",
          metadata: { revisedFromId: 7, revisedFromQuoteNumber: 5001 },
        }),
      })
    );
  });

  it("returns null when the original quote is missing or wrong org", async () => {
    tx.quote.findFirst.mockResolvedValue(null);
    const result = await reviseQuote(7, "org_1");
    expect(result).toBeNull();
    expect(tx.quote.create).not.toHaveBeenCalled();
  });
});
