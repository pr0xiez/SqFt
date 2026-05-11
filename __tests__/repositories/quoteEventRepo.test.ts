import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteEventCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { quoteEvent: { create: quoteEventCreate } },
}));

const { writeQuoteEvent } = await import("@/lib/repositories/quoteEventRepo");

beforeEach(() => vi.clearAllMocks());

describe("writeQuoteEvent", () => {
  it("creates a row with the given type and metadata", async () => {
    quoteEventCreate.mockResolvedValue({ id: 1 });
    await writeQuoteEvent({
      quoteId: 42,
      type: "sent",
      actorEmail: "alex@org.com",
      actorName: "Alex",
      metadata: { to: "buyer@example.com" },
    });
    expect(quoteEventCreate).toHaveBeenCalledWith({
      data: {
        quoteId: 42,
        type: "sent",
        actorEmail: "alex@org.com",
        actorName: "Alex",
        ip: undefined,
        userAgent: undefined,
        metadata: { to: "buyer@example.com" },
      },
    });
  });
});
