import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateFindMany = vi.fn();
const estimateFindFirst = vi.fn();
const estimateFindUnique = vi.fn();
const estimateCreate = vi.fn();
const txEstimateCreate = vi.fn();
const estimateUpdateMany = vi.fn();
const estimateDeleteMany = vi.fn();
const estimateCount = vi.fn();
const estimateItemDeleteMany = vi.fn();
const estimateItemCreateMany = vi.fn();
const lineItemDeleteMany = vi.fn();
const lineItemCreateMany = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();

// $transaction executes the callback with a tx object that mirrors the per-entity mocks
const txMock = {
  estimate: {
    updateMany: estimateUpdateMany,
    count: estimateCount,
    findFirst: estimateFindFirst,
    create: txEstimateCreate,
  },
  estimateItem: {
    deleteMany: estimateItemDeleteMany,
    createMany: estimateItemCreateMany,
  },
  lineItem: {
    deleteMany: lineItemDeleteMany,
    createMany: lineItemCreateMany,
  },
  organization: {
    findUnique: organizationFindUnique,
    update: organizationUpdate,
  },
};

const $transaction = vi.fn(
  async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: {
      findMany: estimateFindMany,
      findFirst: estimateFindFirst,
      findUnique: estimateFindUnique,
      create: estimateCreate,
      updateMany: estimateUpdateMany,
      deleteMany: estimateDeleteMany,
    },
    $transaction,
  },
}));

const {
  listEstimates,
  getEstimate,
  createEstimate,
  saveEstimate,
  deleteEstimate,
  rotateApprovalToken,
  getEstimateByToken,
} = await import("@/lib/repositories/estimateRepo");

beforeEach(() => vi.clearAllMocks());

// ── listEstimates ─────────────────────────────────────────────────────────────

describe("listEstimates", () => {
  it("queries by orgId", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listEstimates("org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });
});

// ── getEstimate ───────────────────────────────────────────────────────────────

describe("getEstimate", () => {
  it("returns null when not found", async () => {
    estimateFindFirst.mockResolvedValue(null);
    expect(await getEstimate(99, "org1")).toBeNull();
  });
});

// ── createEstimate ────────────────────────────────────────────────────────────

describe("createEstimate", () => {
  it("injects orgId and assigns quoteNumber atomically", async () => {
    organizationFindUnique.mockResolvedValue({ nextQuoteNumber: 3 });
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, quoteNumber: 3 });
    await createEstimate("org1", { customerId: 2 });
    expect(txEstimateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1", quoteNumber: 3 }),
      })
    );
    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: { nextQuoteNumber: 4 },
      })
    );
  });
});

// ── saveEstimate — transaction behavior ───────────────────────────────────────

describe("saveEstimate", () => {
  it("returns null when estimate not found in org", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveEstimate(99, "org1", { title: "X" });
    expect(result).toBeNull();
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("updates top-level fields and returns the estimate", async () => {
    const updated = { id: 1, title: "New title", items: [], lineItems: [] };
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue(updated);

    const result = await saveEstimate(1, "org1", { title: "New title" });

    expect(result).toEqual(updated);
    expect(estimateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, orgId: "org1" } })
    );
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("replaces items inside the transaction", async () => {
    const updated = { id: 1, items: [{ id: 2 }], lineItems: [] };
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue(updated);

    await saveEstimate(1, "org1", {
      items: [{ type: "room", sortOrder: 0 }],
    });

    expect(estimateItemDeleteMany).toHaveBeenCalledWith({
      where: { estimateId: 1 },
    });
    expect(estimateItemCreateMany).toHaveBeenCalled();
    expect(lineItemDeleteMany).not.toHaveBeenCalled();
  });

  it("replaces lineItems inside the transaction", async () => {
    const updated = { id: 1, items: [], lineItems: [{ id: 3 }] };
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue(updated);

    await saveEstimate(1, "org1", {
      lineItems: [
        {
          name: "Labor",
          rate: 5,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
    });

    expect(lineItemDeleteMany).toHaveBeenCalledWith({
      where: { estimateId: 1 },
    });
    expect(lineItemCreateMany).toHaveBeenCalled();
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("propagates transaction errors (simulating DB rollback)", async () => {
    $transaction.mockRejectedValueOnce(new Error("DB failure"));
    await expect(
      saveEstimate(1, "org1", { title: "Boom", items: [] })
    ).rejects.toThrow("DB failure");
  });

  it("uses count check when patch has no top-level fields", async () => {
    estimateCount.mockResolvedValue(1);
    estimateFindFirst.mockResolvedValue({ id: 1, items: [], lineItems: [] });

    await saveEstimate(1, "org1", { items: [] });

    expect(estimateCount).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
    });
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });

  it("returns null when only items provided but estimate not in org", async () => {
    estimateCount.mockResolvedValue(0);

    const result = await saveEstimate(99, "org1", { items: [] });

    expect(result).toBeNull();
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });
});

// ── rotateApprovalToken ───────────────────────────────────────────────────────

describe("rotateApprovalToken", () => {
  it("returns null when estimate is not in the org", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    expect(await rotateApprovalToken(99, "org1")).toBeNull();
  });

  it("issues a URL-safe token of sufficient length", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const token = await rotateApprovalToken(1, "org1");
    expect(token).not.toBeNull();
    expect(token?.length).toBeGreaterThanOrEqual(32);
    // base64url alphabet: A-Z, a-z, 0-9, -, _
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(estimateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1" },
        data: expect.objectContaining({ approvalToken: token }),
      })
    );
  });

  it("issues different tokens on subsequent calls", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    const a = await rotateApprovalToken(1, "org1");
    const b = await rotateApprovalToken(1, "org1");
    expect(a).not.toBe(b);
  });
});

// ── getEstimateByToken ────────────────────────────────────────────────────────

describe("getEstimateByToken", () => {
  it("looks up by approvalToken with org branding included", async () => {
    estimateFindUnique.mockResolvedValue({ id: 1, org: { name: "X" } });
    await getEstimateByToken("some-token");
    expect(estimateFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { approvalToken: "some-token" },
        include: expect.objectContaining({
          org: expect.objectContaining({
            select: expect.objectContaining({ name: true }),
          }),
        }),
      })
    );
  });

  it("returns null when token does not match any estimate", async () => {
    estimateFindUnique.mockResolvedValue(null);
    expect(await getEstimateByToken("nope")).toBeNull();
  });
});

// ── deleteEstimate ────────────────────────────────────────────────────────────

describe("deleteEstimate", () => {
  it("returns false when nothing was deleted", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteEstimate(99, "org1")).toBe(false);
  });

  it("returns true when deleted", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEstimate(1, "org1")).toBe(true);
    expect(estimateDeleteMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
    });
  });
});
