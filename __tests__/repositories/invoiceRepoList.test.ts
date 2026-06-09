import { beforeEach, describe, expect, it, vi } from "vitest";

const invoiceFindMany = vi.fn();
const invoiceCount = vi.fn();
const invoiceGroupBy = vi.fn();

const $transaction = vi.fn(async (arg: Promise<unknown>[]) => Promise.all(arg));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: invoiceFindMany,
      count: invoiceCount,
      groupBy: invoiceGroupBy,
    },
    $transaction,
  },
}));

const { listInvoices } = await import("@/lib/repositories/invoiceRepo");

const baseParams = {
  page: 1,
  perPage: 25,
  sort: { key: "sentAt" as const, direction: "desc" as const },
  q: "",
  status: "all" as const,
};

/** A minimal raw row as returned by findMany with INVOICE_LIST_INCLUDE. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    invoiceNumber: 9001,
    status: "sent",
    amount: 1000,
    dueDate: null,
    sentAt: new Date("2026-06-01T00:00:00Z"),
    estimateId: 5,
    payments: [],
    estimate: {
      siteMeasure: {
        location: { customer: { name: "Dana Floors" } },
      },
    },
    ...over,
  };
}

function mockGroupBy() {
  invoiceGroupBy.mockResolvedValue([
    { status: "draft", _count: { _all: 1 } },
    { status: "sent", _count: { _all: 2 } },
    { status: "partial", _count: { _all: 1 } },
    { status: "paid", _count: { _all: 3 } },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listInvoices", () => {
  it("scopes by org, applies skip/take and null-last sentAt orderBy, maps rows", async () => {
    invoiceFindMany.mockResolvedValue([
      rawRow({ payments: [{ amount: 250 }, { amount: 100 }] }),
    ]);
    invoiceCount.mockResolvedValue(7);
    mockGroupBy();

    const res = await listInvoices("org1", {
      ...baseParams,
      page: 2,
      perPage: 25,
    });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { sentAt: { sort: "desc", nulls: "last" } },
        skip: 25,
        take: 25,
      })
    );
    expect(res.total).toBe(7);
    expect(res.items).toEqual([
      {
        id: 1,
        invoiceNumber: 9001,
        status: "sent",
        amount: 1000,
        balanceDue: 650,
        dueDate: null,
        sentAt: new Date("2026-06-01T00:00:00Z"),
        estimateId: 5,
        customerName: "Dana Floors",
      },
    ]);
  });

  it("expands the open filter to sent+viewed+partial", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", { ...baseParams, status: "open" });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          status: { in: ["sent", "viewed", "partial"] },
        },
      })
    );
  });

  it("filters by a single status when not 'all' or 'open'", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", { ...baseParams, status: "paid" });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1", status: "paid" } })
    );
  });

  it("searches customer name and exact invoice number for numeric queries", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", { ...baseParams, q: "#9001" });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          OR: [
            {
              estimate: {
                siteMeasure: {
                  location: {
                    customer: {
                      name: { contains: "9001", mode: "insensitive" },
                    },
                  },
                },
              },
            },
            { invoiceNumber: 9001 },
          ],
        },
      })
    );
  });

  it("maps the customer sort key to the nested relation orderBy", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", {
      ...baseParams,
      sort: { key: "customer", direction: "asc" },
    });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          estimate: {
            siteMeasure: { location: { customer: { name: "asc" } } },
          },
        },
      })
    );
  });

  it("computes facets org-wide, with open = sent+viewed+partial", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    const res = await listInvoices("org1", { ...baseParams, status: "paid" });

    // facets ignore the status filter (groupBy where is org-only)
    expect(invoiceGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
    expect(res.facets).toEqual({
      all: 7,
      open: 3,
      draft: 1,
      sent: 2,
      viewed: 0,
      partial: 1,
      paid: 3,
      void: 0,
    });
  });

  it("omits the invoiceNumber clause when query overflows Int32", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
    mockGroupBy();

    await listInvoices("org1", {
      ...baseParams,
      q: "99999999999",
    });

    const call = invoiceFindMany.mock.calls[0][0] as {
      where: { OR?: unknown[] };
    };
    const or = call.where.OR;
    expect(or).toHaveLength(1);
    expect(or?.[0]).not.toHaveProperty("invoiceNumber");
  });

  it("rounds balanceDue to cents", async () => {
    invoiceFindMany.mockResolvedValue([
      rawRow({ amount: 100, payments: [{ amount: 33.333 }] }),
    ]);
    invoiceCount.mockResolvedValue(1);
    mockGroupBy();

    const res = await listInvoices("org1", baseParams);
    expect(res.items[0].balanceDue).toBe(66.67);
  });
});
