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

  it("hydrates the page ids returned by the raw query, preserving order", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: 3 }, { id: 1 }]) // page ids (sorted)
      .mockResolvedValueOnce([{ count: BigInt(2) }]) // total
      .mockResolvedValueOnce([
        { key: "phone", count: BigInt(1) },
        { key: "online", count: BigInt(1) },
      ]) // source facets
      .mockResolvedValueOnce([
        { key: "any", count: BigInt(2) },
        { key: "open", count: BigInt(1) },
        { key: "accepted", count: BigInt(0) },
        { key: "cold", count: BigInt(1) },
      ]) // pipeline facets
      .mockResolvedValueOnce([
        { open: BigInt(4), won: BigInt(1), with_open: BigInt(2) },
      ]); // summary
    findMany.mockResolvedValue([
      { id: 1, name: "B" },
      { id: 3, name: "A" },
    ]);
    const res = await listCustomers("org1", base);
    expect(res.items.map((c) => c.id)).toEqual([3, 1]); // raw id order, not findMany order
    expect(res.total).toBe(2);
    expect(res.facets["source:phone"]).toBe(1);
    expect(res.facets["source:all"]).toBe(2);
    expect(res.facets["pipeline:open"]).toBe(1);
    expect(res.summary).toEqual({ openEstimates: 4, won: 1, withOpen: 2 });
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
