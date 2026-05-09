import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateFindMany = vi.fn();
const estimateFindFirst = vi.fn();
const estimateCreate = vi.fn();
const txEstimateCreate = vi.fn();
const estimateUpdateMany = vi.fn();
const estimateDeleteMany = vi.fn();
const estimateCount = vi.fn();
const estimateItemDeleteMany = vi.fn();
const estimateItemCreateMany = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();

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

  it("includes quote count", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listEstimates("org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { items: true, quotes: true } },
        }),
      })
    );
  });
});

// ── getEstimate ──────────────────────────────────────────────────────────────

describe("getEstimate", () => {
  it("scopes by id and orgId and includes a lightweight quotes summary", async () => {
    estimateFindFirst.mockResolvedValue(null);
    await getEstimate(7, "org1");
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, orgId: "org1" },
        include: expect.objectContaining({
          quotes: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              quoteNumber: true,
              status: true,
            }),
          }),
        }),
      })
    );
  });
});

// ── createEstimate ───────────────────────────────────────────────────────────

describe("createEstimate", () => {
  it("allocates the next estimateNumber from Organization.nextEstimateNumber", async () => {
    organizationFindUnique.mockResolvedValue({ nextEstimateNumber: 42 });
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, estimateNumber: 42 });

    await createEstimate("org1", { customerId: 9, title: "Job" });

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextEstimateNumber: 43 },
    });
    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        customerId: 9,
        estimateNumber: 42,
      }),
    });
  });

  it("defaults estimateNumber to 1 when org counter missing", async () => {
    organizationFindUnique.mockResolvedValue(null);
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, estimateNumber: 1 });

    await createEstimate("org1", { customerId: 9 });

    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ estimateNumber: 1 }),
    });
  });
});

// ── saveEstimate ─────────────────────────────────────────────────────────────

describe("saveEstimate", () => {
  it("updates only top-level fields when no items provided", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveEstimate(1, "org1", { title: "Renamed" });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { title: "Renamed" },
    });
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("forwards customerId to estimate.updateMany", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveEstimate(1, "org1", { customerId: 42 });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { customerId: 42 },
    });
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveEstimate(99, "org1", { title: "x" });
    expect(result).toBeNull();
  });

  it("returns null when items-only update targets nonexistent estimate", async () => {
    estimateCount.mockResolvedValue(0);
    const result = await saveEstimate(99, "org1", {
      items: [
        {
          type: "room",
          name: "Living",
          shape: "rect",
          w: 10,
          l: 12,
          sortOrder: 0,
        },
      ],
    });
    expect(result).toBeNull();
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("replaces items wholesale when items provided", async () => {
    estimateCount.mockResolvedValue(1);
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveEstimate(1, "org1", {
      items: [
        {
          type: "room",
          name: "Living",
          shape: "rect",
          w: 10,
          l: 12,
          sortOrder: 0,
        },
      ],
    });

    expect(estimateItemDeleteMany).toHaveBeenCalledWith({
      where: { estimateId: 1 },
    });
    expect(estimateItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ estimateId: 1, name: "Living" })],
    });
  });
});

// ── deleteEstimate ───────────────────────────────────────────────────────────

describe("deleteEstimate", () => {
  it("returns true when something was deleted", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEstimate(1, "org1")).toBe(true);
  });
  it("returns false when nothing matched", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteEstimate(99, "org1")).toBe(false);
  });
});
