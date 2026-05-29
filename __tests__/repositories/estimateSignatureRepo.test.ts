import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateSignatureCreate = vi.fn();
const estimateUpdateMany = vi.fn();
const estimateFindFirst = vi.fn();
const estimateFindMany = vi.fn().mockResolvedValue([]);
const estimateEventCreate = vi.fn();
const estimateEventCreateMany = vi.fn();
const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
  cb({
    estimate: {
      findFirst: estimateFindFirst,
      findMany: estimateFindMany,
      updateMany: estimateUpdateMany,
    },
    estimateSignature: { create: estimateSignatureCreate },
    estimateEvent: {
      create: estimateEventCreate,
      createMany: estimateEventCreateMany,
    },
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction },
}));

const { acceptEstimateByToken } = await import(
  "@/lib/repositories/estimateSignatureRepo"
);

beforeEach(() => vi.clearAllMocks());

describe("acceptEstimateByToken", () => {
  const validInput = {
    estimateId: 1,
    signedByName: "Janet Henderson",
    signedByEmail: "h@example.com",
    signatureData: "data:image/png;base64,iVBORw0KGgo=",
    consentText: "consent",
    estimateSnapshot: { estimateNumber: 5001 },
    snapshotHash: "deadbeef",
    signedIp: "1.2.3.4",
    signedUserAgent: "UA",
  };

  it("creates signature, updates estimate, writes event in one transaction", async () => {
    estimateFindFirst.mockResolvedValue({
      id: 1,
      status: "viewed",
      siteMeasureId: 10,
      estimateNumber: 5001,
    });
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateSignatureCreate.mockResolvedValue({ id: 1 });

    const result = await acceptEstimateByToken(validInput);
    expect(result).toBe("ok");
    expect(estimateSignatureCreate).toHaveBeenCalled();
    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "accepted", acceptedAt: expect.any(Date) },
    });
    expect(estimateEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimateId: 1,
          type: "accepted",
          actorEmail: "h@example.com",
          actorName: "Janet Henderson",
        }),
      })
    );
  });

  it("returns 'already_signed' when status is already accepted", async () => {
    estimateFindFirst.mockResolvedValue({ id: 1, status: "accepted" });
    const result = await acceptEstimateByToken(validInput);
    expect(result).toBe("already_signed");
    expect(estimateSignatureCreate).not.toHaveBeenCalled();
  });

  it("returns 'declined' when status is declined", async () => {
    estimateFindFirst.mockResolvedValue({ id: 1, status: "declined" });
    expect(await acceptEstimateByToken(validInput)).toBe("declined");
  });

  it("returns 'not_found' when estimate doesn't exist", async () => {
    estimateFindFirst.mockResolvedValue(null);
    expect(await acceptEstimateByToken(validInput)).toBe("not_found");
  });
});
