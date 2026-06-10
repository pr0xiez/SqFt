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
const locationFindFirst = vi.fn();

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
  location: {
    findFirst: locationFindFirst,
  },
};

const $transaction = vi.fn(
  async (
    arg: ((tx: typeof txMock) => Promise<unknown>) | Promise<unknown>[]
  ) => (Array.isArray(arg) ? Promise.all(arg) : arg(txMock))
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteMeasure: {
      findMany: estimateFindMany,
      findFirst: estimateFindFirst,
      create: estimateCreate,
      updateMany: estimateUpdateMany,
      deleteMany: estimateDeleteMany,
      count: estimateCount,
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

describe("listSiteMeasures (paginated)", () => {
  const base = {
    page: 1,
    perPage: 25,
    sort: { key: "date" as const, direction: "desc" as const },
    q: "",
    status: "all" as const,
  };

  it("scopes by org, applies skip/take, returns items+total+facets", async () => {
    estimateFindMany.mockResolvedValue([{ id: 1 }]);
    estimateCount
      .mockResolvedValueOnce(9) // total (filtered)
      .mockResolvedValueOnce(9) // all
      .mockResolvedValueOnce(2) // empty
      .mockResolvedValueOnce(3) // measured
      .mockResolvedValueOnce(4); // estimated
    const res = await listSiteMeasures("org1", { ...base, page: 2 });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { date: "desc" },
        skip: 25,
        take: 25,
      })
    );
    expect(res.items).toEqual([{ id: 1 }]);
    expect(res.total).toBe(9);
    expect(res.facets).toEqual({ all: 9, empty: 2, measured: 3, estimated: 4 });
  });

  it("includes the location.customer + _count include", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", base);
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { items: true, estimates: true } },
        }),
      })
    );
  });

  it("applies the 'empty' existence filter", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", { ...base, status: "empty" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1", items: { none: { type: "room" } } },
      })
    );
  });

  it("applies the 'measured' existence filter", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", { ...base, status: "measured" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          items: { some: { type: "room" } },
          estimates: { none: {} },
        },
      })
    );
  });

  it("applies the 'estimated' existence filter", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", { ...base, status: "estimated" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          items: { some: { type: "room" } },
          estimates: { some: {} },
        },
      })
    );
  });

  it("maps the customer sort key to the nested relation orderBy", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", {
      ...base,
      sort: { key: "customer", direction: "asc" },
    });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { location: { customer: { name: "asc" } } },
      })
    );
  });

  it("searches customer name (contains) and exact siteMeasureNumber for numeric q", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", { ...base, q: "#42" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org1",
          OR: [
            {
              location: {
                customer: { name: { contains: "42", mode: "insensitive" } },
              },
            },
            { siteMeasureNumber: 42 },
          ],
        }),
      })
    );
  });

  it("omits the siteMeasureNumber clause when query overflows Int32", async () => {
    estimateFindMany.mockResolvedValue([]);
    estimateCount.mockResolvedValue(0);
    await listSiteMeasures("org1", { ...base, q: "99999999999" });
    expect(estimateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org1",
          OR: [
            {
              location: {
                customer: {
                  name: { contains: "99999999999", mode: "insensitive" },
                },
              },
            },
          ],
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
    locationFindFirst.mockResolvedValue({ id: 9 });
    organizationFindUnique.mockResolvedValue({ nextSiteMeasureNumber: 42 });
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, siteMeasureNumber: 42 });

    await createSiteMeasure("org1", { locationId: 9 });

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextSiteMeasureNumber: 43 },
    });
    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org1",
        locationId: 9,
        siteMeasureNumber: 42,
      }),
    });
  });

  it("defaults siteMeasureNumber to 1 when org counter missing", async () => {
    locationFindFirst.mockResolvedValue({ id: 9 });
    organizationFindUnique.mockResolvedValue(null);
    organizationUpdate.mockResolvedValue({});
    txEstimateCreate.mockResolvedValue({ id: 1, siteMeasureNumber: 1 });

    await createSiteMeasure("org1", { locationId: 9 });

    expect(txEstimateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ siteMeasureNumber: 1 }),
    });
  });

  it("returns null without creating when the location is not in the org", async () => {
    locationFindFirst.mockResolvedValue(null);

    const result = await createSiteMeasure("org1", { locationId: 999 });

    expect(result).toBeNull();
    expect(locationFindFirst).toHaveBeenCalledWith({
      where: { id: 999, orgId: "org1" },
      select: { id: true },
    });
    expect(txEstimateCreate).not.toHaveBeenCalled();
    expect(organizationUpdate).not.toHaveBeenCalled();
  });
});

// ── saveSiteMeasure ─────────────────────────────────────────────────────────────

describe("saveSiteMeasure", () => {
  it("forwards locationId to siteMeasure.updateMany", async () => {
    locationFindFirst.mockResolvedValue({ id: 42 });
    estimateUpdateMany.mockResolvedValue({ count: 1 });
    estimateFindFirst.mockResolvedValue({ id: 1 });

    await saveSiteMeasure(1, "org1", { locationId: 42 });

    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { locationId: 42 },
    });
    expect(estimateItemDeleteMany).not.toHaveBeenCalled();
  });

  it("returns null when a patched locationId is not in the org", async () => {
    locationFindFirst.mockResolvedValue(null);

    const result = await saveSiteMeasure(1, "org1", { locationId: 999 });

    expect(result).toBeNull();
    expect(locationFindFirst).toHaveBeenCalledWith({
      where: { id: 999, orgId: "org1" },
      select: { id: true },
    });
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches the id+org", async () => {
    locationFindFirst.mockResolvedValue({ id: 42 });
    estimateUpdateMany.mockResolvedValue({ count: 0 });
    const result = await saveSiteMeasure(99, "org1", { locationId: 42 });
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
