import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteLockedError } from "@/lib/api/errors";
import { saveQuote } from "@/lib/repositories/quoteRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    quote: {
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

describe("saveQuote lockdown", () => {
  it("throws QuoteLockedError and does not mutate when quote is accepted", async () => {
    tx.quote.findFirst.mockResolvedValue({ id: 7, status: "accepted" });
    await expect(
      saveQuote(7, "org_1", { convenienceFeeRate: 0.1 })
    ).rejects.toBeInstanceOf(QuoteLockedError);
    expect(tx.quote.update).not.toHaveBeenCalled();
  });

  it("throws QuoteLockedError and does not mutate when quote is declined", async () => {
    tx.quote.findFirst.mockResolvedValue({ id: 7, status: "declined" });
    await expect(
      saveQuote(7, "org_1", { convenienceFeeRate: 0.1 })
    ).rejects.toBeInstanceOf(QuoteLockedError);
    expect(tx.quote.update).not.toHaveBeenCalled();
  });
});
