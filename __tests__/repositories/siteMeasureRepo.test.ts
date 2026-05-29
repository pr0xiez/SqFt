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
  siteMeasure: {
    updateMany: estimateUpdateMany,
    count: estimateCount,
    findFirst: estimateFindFirst,
    create: txEstimateCreate,
  },
  siteMeasureItem: {
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
    siteMeasure: {
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
  listSiteMeasures,
  getSiteMeasure,
  createSiteMeasure,
  saveSiteMeasure,
  deleteSiteMeasure,
} = await import("@/lib/repositories/siteMeasureRepo");

beforeEach(() => vi.clearAllMocks());

// ── listSiteMeasures ─────────────────────────────────────────────────────────────

describe("listSiteMeasures", () => {
  it("queries by orgId", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listSiteMeasures("org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });

  it("includes estimate count", async () => {
    estimateFindMany.mockResolvedValue([]);
    await listSiteMeasures("org1");
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { items: true, estimates: true } },
        }),
      })
    );
  });
});

// ── getSiteMeasure ──────────────────────────────────────────────────────────────

describe("getSiteMeasure", () => {
  it("scopes by id and orgId and includes a lightweight estimates summary", async () => {
    estimateFindFirst.mockResolvedValue(null);
    await getSiteMeasure(7, "org1");
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, orgId: "org1" },
        include: expect.objectContaining({
          estimates: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              estimateNumber: true,
              status: true,
            }),
          }),
        }),
      })
    );
  });
});

// ── createSiteMeasure ───────────────────────────────────────────────────────────

describe("createSiteMeasure", () => {
  it("allocates the next siteMeasureNumber from Organization.nextSiteMeasureNumber", async () => {
    organizationFindUnique.mockResolvedValue({ nextSiteMeasureNumber: 42 });
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, siteMeasureNumber: 42 });

    await createSiteMeasure("org1", { customerId: 9, title: "Job" });

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextSiteMeasureNumber: 43 },
    });
    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        customerId: 9,
        siteMeasureNumber: 42,
      }),
    });
  });

  it("defaults siteMeasureNumber to 1 when org counter missing", async () => {
    organizationFindUnique.mockResolvedValue(null);
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, siteMeasureNumber: 1 });

    await createSiteMeasure("org1", { customerId: 9 });

    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ siteMeasureNumber: 1 }),
    });
  });
});

// ── saveSiteMeasure ─────────────────────────────────────────────────────────────

describe("saveSiteMeasure", () => {
  it("updates only top-level fields when no items provided", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveSiteMeasure(1, "org1", { title: "Renamed" });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { title: "Renamed" },
    });
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("forwards customerId to siteMeasure.updateMany", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveSiteMeasure(1, "org1", { customerId: 42 });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { customerId: 42 },
    });
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveSiteMeasure(99, "org1", { title: "x" });
    expect(result).toBeNull();
  });

  it("returns null when items-only update targets nonexistent siteMeasure", async () => {
    estimateCount.mockResolvedValue(0);
    const result = await saveSiteMeasure(99, "org1", {
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

    await saveSiteMeasure(1, "org1", {
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
      where: { siteMeasureId: 1 },
    });
    expect(estimateItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ siteMeasureId: 1, name: "Living" })],
    });
  });
});

// ── deleteSiteMeasure ───────────────────────────────────────────────────────────

describe("deleteSiteMeasure", () => {
  it("returns true when something was deleted", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteSiteMeasure(1, "org1")).toBe(true);
  });
  it("returns false when nothing matched", async () => {
    estimateDeleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteSiteMeasure(99, "org1")).toBe(false);
  });
});
