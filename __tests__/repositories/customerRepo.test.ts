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

const qboLinkFindUnique = vi.fn().mockResolvedValue(null);
const qboSyncTaskUpsert = vi.fn();

const txMock = {
  customer: { deleteMany, updateMany },
  event: { count: eventCount },
  invoice: { count: invoiceCount },
  // QBO enqueue path (updateCustomer): no link → no enqueue.
  // hasCustomerLink runs on the ambient tx, so qboLink lives here too.
  qboConnection: { findUnique: vi.fn().mockResolvedValue(null) },
  qboLink: { findUnique: qboLinkFindUnique },
  qboSyncTask: { upsert: qboSyncTaskUpsert },
};

const $transaction = vi.fn(
  async (
    arg: ((tx: typeof txMock) => Promise<unknown>) | Promise<unknown>[]
  ) => (Array.isArray(arg) ? Promise.all(arg) : arg(txMock))
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany, findFirst, create, updateMany, deleteMany },
    qboLink: { findUnique: qboLinkFindUnique },
    $queryRaw: queryRaw,
    $transaction,
  },
}));

const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  updateCustomerEmail,
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

  it("uses one materialized aggregation and hydrates only the database page in its order", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        ids: [2, 1],
        total: 3,
        facets: { "source:all": 3 },
        summary: { openEstimates: 1, won: 1, withOpen: 1 },
      },
    ]);
    findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const result = await listCustomers("org1", {
      ...base,
      page: 2,
      perPage: 2,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain("AS MATERIALIZED");
    expect(sql.sql.match(/LEFT JOIN "Estimate"/g)).toHaveLength(1);
    expect(sql.sql).toMatch(/ORDER BY name ASC, id ASC/);
    expect(sql.sql).toMatch(/LIMIT \? OFFSET \?/);
    expect(sql.values).toEqual(expect.arrayContaining(["org1", 2]));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1", id: { in: [2, 1] } } })
    );
    expect(result.items.map((customer) => customer.id)).toEqual([2, 1]);
    expect(result.total).toBe(3);
    expect(result.summary).toEqual({ openEstimates: 1, won: 1, withOpen: 1 });
  });

  it("does not hydrate an empty or out-of-range page", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        ids: [],
        total: 3,
        facets: { "source:all": 3 },
        summary: { openEstimates: 0, won: 0, withOpen: 0 },
      },
    ]);
    expect((await listCustomers("org1", { ...base, page: 99 })).items).toEqual(
      []
    );
    expect(findMany).not.toHaveBeenCalled();
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

describe("updateCustomerEmail", () => {
  it("scopes the update to id + orgId and returns true on a match", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const result = await updateCustomerEmail(1, "org1", "new@example.com");
    expect(result).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { email: "new@example.com" },
    });
  });

  it("returns false when no row matches in the org", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await updateCustomerEmail(99, "org1", "new@example.com")).toBe(
      false
    );
  });

  it("propagates a rejected prisma call", async () => {
    updateMany.mockRejectedValue(new Error("db down"));
    await expect(
      updateCustomerEmail(1, "org1", "new@example.com")
    ).rejects.toThrow("db down");
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
        OR: [
          { customerId: 1 },
          { estimate: { siteMeasure: { location: { customerId: 1 } } } },
        ],
      },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("refuses when an event links directly to the customer with no estimate chain", async () => {
    // e.g. a "visit"/"other" type event, which has a nullable customerId FK
    // and no estimateId at all.
    eventCount.mockResolvedValue(1);
    await expect(deleteCustomer(1, "org1")).rejects.toBeInstanceOf(
      EstimateHasEventsError
    );
    expect(eventCount).toHaveBeenCalledWith({
      where: {
        orgId: "org1",
        OR: [
          { customerId: 1 },
          { estimate: { siteMeasure: { location: { customerId: 1 } } } },
        ],
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
