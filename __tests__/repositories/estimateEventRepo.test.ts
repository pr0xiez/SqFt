import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateEventCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { estimateEvent: { create: estimateEventCreate } },
}));

const { writeEstimateEvent } = await import(
  "@/lib/repositories/estimateEventRepo"
);

beforeEach(() => vi.clearAllMocks());

describe("writeEstimateEvent", () => {
  it("creates a row with the given type and metadata", async () => {
    estimateEventCreate.mockResolvedValue({ id: 1 });
    await writeEstimateEvent({
      estimateId: 42,
      type: "sent",
      actorEmail: "alex@org.com",
      actorName: "Alex",
      metadata: { to: "buyer@example.com" },
    });
    expect(estimateEventCreate).toHaveBeenCalledWith({
      data: {
        estimateId: 42,
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
