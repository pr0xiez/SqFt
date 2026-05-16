import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteSignatureCreate = vi.fn();
const quoteUpdateMany = vi.fn();
const quoteFindFirst = vi.fn();
const quoteFindMany = vi.fn().mockResolvedValue([]);
const quoteEventCreate = vi.fn();
const quoteEventCreateMany = vi.fn();
const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
  cb({
    quote: {
      findFirst: quoteFindFirst,
      findMany: quoteFindMany,
      updateMany: quoteUpdateMany,
    },
    quoteSignature: { create: quoteSignatureCreate },
    quoteEvent: { create: quoteEventCreate, createMany: quoteEventCreateMany },
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction },
}));

const { acceptQuoteByToken } = await import(
  "@/lib/repositories/quoteSignatureRepo"
);

beforeEach(() => vi.clearAllMocks());

describe("acceptQuoteByToken", () => {
  const validInput = {
    quoteId: 1,
    signedByName: "Janet Henderson",
    signedByEmail: "h@example.com",
    signatureData: "data:image/png;base64,iVBORw0KGgo=",
    consentText: "consent",
    quoteSnapshot: { quoteNumber: 5001 },
    snapshotHash: "deadbeef",
    signedIp: "1.2.3.4",
    signedUserAgent: "UA",
  };

  it("creates signature, updates quote, writes event in one transaction", async () => {
    quoteFindFirst.mockResolvedValue({
      id: 1,
      status: "viewed",
      estimateId: 10,
      quoteNumber: 5001,
    });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    quoteSignatureCreate.mockResolvedValue({ id: 1 });

    const result = await acceptQuoteByToken(validInput);
    expect(result).toBe("ok");
    expect(quoteSignatureCreate).toHaveBeenCalled();
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "accepted", acceptedAt: expect.any(Date) },
    });
    expect(quoteEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 1,
          type: "accepted",
          actorEmail: "h@example.com",
          actorName: "Janet Henderson",
        }),
      })
    );
  });

  it("returns 'already_signed' when status is already accepted", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "accepted" });
    const result = await acceptQuoteByToken(validInput);
    expect(result).toBe("already_signed");
    expect(quoteSignatureCreate).not.toHaveBeenCalled();
  });

  it("returns 'declined' when status is declined", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "declined" });
    expect(await acceptQuoteByToken(validInput)).toBe("declined");
  });

  it("returns 'not_found' when quote doesn't exist", async () => {
    quoteFindFirst.mockResolvedValue(null);
    expect(await acceptQuoteByToken(validInput)).toBe("not_found");
  });
});
