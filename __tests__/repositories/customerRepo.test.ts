import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateHasEventsError, HasInvoicesError } from "@/lib/api/errors";

const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();
const queryRaw = vi.fn();
const eventCount = vi.fn();
const invoiceCount = vi.fn();

const txMock = {
  customer: { deleteMany },
  event: { count: eventCount },
  invoice: { count: invoiceCount },
};

const $transaction = vi.fn(
  async (
    arg: ((tx: typeof txMock) => Promise<unknown>) | Promise<unknown>[]
  ) => (Array.isArray(arg) ? Promise.all(arg) : arg(txMock))
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany, findFirst, create, updateMany, deleteMany },
    $queryRaw: queryRaw,
    $transaction,
  },
}));

const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = await import("@/lib/repositories/customerRepo");

beforeEach(() => vi.clearAllMocks());

describe("listCustomers", () => {
  const base = {
    page: 1,
    perPage: 25,
    sort: { key: "name" as const, direction: "asc" as const },
    q: "",
    source: "all" as const,
    pipeline: "any" as const,
  };

  // Three customers covering every source/pipeline bucket used below:
  //   Alice — phone,  1 open estimate,     0 accepted, 1 estimate total
  //   Bob   — online, 0 open,              1 accepted, 1 estimate total (won)
  //   Carol — phone,  0 open,              0 accepted, 0 estimates      (cold)
  const aggRows = [
    {
      id: 1,
      name: "Alice",
      source: "phone",
      createdAt: new Date("2026-01-01"),
      site_measure_count: 2,
      open_count: 1,
      accepted_count: 0,
      estimate_count: 1,
    },
    {
      id: 2,
      name: "Bob",
      source: "online",
      createdAt: new Date("2026-01-02"),
      site_measure_count: 1,
      open_count: 0,
      accepted_count: 1,
      estimate_count: 1,
    },
    {
      id: 3,
      name: "Carol",
      source: "phone",
      createdAt: new Date("2026-01-03"),
      site_measure_count: 0,
      open_count: 0,
      accepted_count: 0,
      estimate_count: 0,
    },
  ];

  it("runs the aggregation exactly once and hydrates page ids in sorted order", async () => {
    queryRaw.mockResolvedValueOnce(aggRows);
    findMany.mockResolvedValue([
      { id: 3, name: "Carol" },
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    const res = await listCustomers("org1", base);

    // Single round-trip for the aggregate — no more per-view re-runs of the
    // 4-table join (#283).
    expect(queryRaw).toHaveBeenCalledTimes(1);

    expect(res.items.map((c) => c.id)).toEqual([1, 2, 3]); // name asc
    expect(res.total).toBe(3);
    expect(res.facets["source:phone"]).toBe(2);
    expect(res.facets["source:online"]).toBe(1);
    expect(res.facets["source:all"]).toBe(3);
    expect(res.facets["pipeline:any"]).toBe(3);
    expect(res.facets["pipeline:open"]).toBe(1);
    expect(res.facets["pipeline:accepted"]).toBe(1);
    expect(res.facets["pipeline:cold"]).toBe(1);
    expect(res.summary).toEqual({ openEstimates: 1, won: 1, withOpen: 1 });
  });

  it("paginates and sorts the already-aggregated rows in JS", async () => {
    queryRaw.mockResolvedValueOnce(aggRows);
    findMany.mockResolvedValue([{ id: 2, name: "Bob" }]);

    const res = await listCustomers("org1", {
      ...base,
      perPage: 1,
      page: 2,
      sort: { key: "name", direction: "asc" },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [2] } } })
    );
    expect(res.items.map((c) => c.id)).toEqual([2]);
    expect(res.total).toBe(3); // total ignores pagination
  });

  // Regression for #283: the summary rollup used to be a hand-inlined join
  // scoped only to orgId, ignoring the `q`/`source` filters the page rows,
  // total, and facets all respected — so it could silently disagree with the
  // filtered list on the same page. It must now derive from the same
  // filtered rows as `total`.
  it("summary respects the active source filter, matching the filtered total", async () => {
    queryRaw.mockResolvedValueOnce(aggRows);
    findMany.mockResolvedValue([{ id: 1, name: "Alice" }]);

    const res = await listCustomers("org1", { ...base, source: "phone" });

    // Only Alice + Carol are "phone"; Bob (the only accepted/won customer)
    // must be excluded from both the total and the summary.
    expect(res.total).toBe(2);
    expect(res.summary).toEqual({ openEstimates: 1, won: 0, withOpen: 1 });
  });

  it("summary respects the active pipeline filter, matching the filtered total", async () => {
    queryRaw.mockResolvedValueOnce(aggRows);
    findMany.mockResolvedValue([{ id: 1, name: "Alice" }]);

    const res = await listCustomers("org1", { ...base, pipeline: "open" });

    expect(res.total).toBe(1);
    expect(res.summary).toEqual({ openEstimates: 1, won: 0, withOpen: 1 });
  });
});

describe("getCustomer", () => {
  it("returns null when not found", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getCustomer(99, "org1")).toBeNull();
  });

  it("scopes query by both id and orgId", async () => {
    findFirst.mockResolvedValue({ id: 1 });
    await getCustomer(1, "org1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, orgId: "org1" } })
    );
  });
});

describe("createCustomer", () => {
  it("injects orgId into created record", async () => {
    create.mockResolvedValue({ id: 1 });
    await createCustomer("org1", { name: "Alice", source: "phone" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1" }),
      })
    );
  });
});

describe("updateCustomer", () => {
  it("returns null when record not found in org", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await updateCustomer(99, "org1", { name: "X" })).toBeNull();
  });

  it("returns the updated customer on success", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 1, name: "Updated" });
    const result = await updateCustomer(1, "org1", { name: "Updated" });
    expect(result).toEqual({ id: 1, name: "Updated" });
  });
});

describe("deleteCustomer", () => {
  it("returns false when nothing was deleted", async () => {
    eventCount.mockResolvedValue(0);
    invoiceCount.mockResolvedValue(0);
    deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteCustomer(99, "org1")).toBe(false);
  });

  it("returns true when deleted", async () => {
    eventCount.mockResolvedValue(0);
    invoiceCount.mockResolvedValue(0);
    deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteCustomer(1, "org1")).toBe(true);
  });

  it("refuses when a descendant estimate has scheduled events", async () => {
    eventCount.mockResolvedValue(1);
    await expect(deleteCustomer(1, "org1")).rejects.toBeInstanceOf(
      EstimateHasEventsError
    );
    expect(eventCount).toHaveBeenCalledWith({
      where: {
        orgId: "org1",
        estimate: { siteMeasure: { location: { customerId: 1 } } },
      },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("refuses when a descendant estimate has invoices", async () => {
    eventCount.mockResolvedValue(0);
    invoiceCount.mockResolvedValue(2);
    await expect(deleteCustomer(1, "org1")).rejects.toBeInstanceOf(
      HasInvoicesError
    );
    expect(invoiceCount).toHaveBeenCalledWith({
      where: {
        orgId: "org1",
        estimate: { siteMeasure: { location: { customerId: 1 } } },
      },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
