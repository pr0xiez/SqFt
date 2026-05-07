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
      create: estimateCreate,
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
  markEstimateAsInvoice,
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

// ── markEstimateAsInvoice ─────────────────────────────────────────────────────

describe("markEstimateAsInvoice", () => {
  it("returns not_found when estimate does not exist in org", async () => {
    estimateFindFirst.mockResolvedValueOnce(null);
    const result = await markEstimateAsInvoice(99, "org1");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("returns already_invoiced when invoiceNumber is already set", async () => {
    estimateFindFirst.mockResolvedValueOnce({
      id: 1,
      status: "scheduled",
      invoiceNumber: 5,
    });
    const result = await markEstimateAsInvoice(1, "org1");
    expect(result).toEqual({ ok: false, reason: "already_invoiced" });
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("rejects estimates still in quote status", async () => {
    estimateFindFirst.mockResolvedValueOnce({
      id: 1,
      status: "quote",
      invoiceNumber: null,
    });
    const result = await markEstimateAsInvoice(1, "org1");
    expect(result).toEqual({ ok: false, reason: "invalid_status" });
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("atomically increments nextInvoiceNumber and assigns it", async () => {
    estimateFindFirst
      .mockResolvedValueOnce({
        id: 1,
        status: "scheduled",
        invoiceNumber: null,
      })
      .mockResolvedValueOnce({ id: 1, invoiceNumber: 7 });
    organizationUpdate.mockResolvedValueOnce({ nextInvoiceNumber: 8 });
    estimateUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await markEstimateAsInvoice(1, "org1");

    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: { nextInvoiceNumber: { increment: 1 } },
      })
    );
    expect(estimateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1", invoiceNumber: null },
        data: expect.objectContaining({ invoiceNumber: 7 }),
      })
    );
    expect(result.ok).toBe(true);
  });

  it("treats lost race (updateMany count 0) as already_invoiced", async () => {
    estimateFindFirst.mockResolvedValueOnce({
      id: 1,
      status: "scheduled",
      invoiceNumber: null,
    });
    organizationUpdate.mockResolvedValueOnce({ nextInvoiceNumber: 8 });
    estimateUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await markEstimateAsInvoice(1, "org1");
    expect(result).toEqual({ ok: false, reason: "already_invoiced" });
  });

  it("uses provided dueDate when given", async () => {
    const due = new Date("2026-12-31T00:00:00Z");
    estimateFindFirst
      .mockResolvedValueOnce({
        id: 1,
        status: "scheduled",
        invoiceNumber: null,
      })
      .mockResolvedValueOnce({ id: 1, invoiceNumber: 7, dueDate: due });
    organizationUpdate.mockResolvedValueOnce({ nextInvoiceNumber: 8 });
    estimateUpdateMany.mockResolvedValueOnce({ count: 1 });

    await markEstimateAsInvoice(1, "org1", { dueDate: due });

    expect(estimateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dueDate: due }),
      })
    );
  });

  it("defaults due date to ~30 days after invoicedAt", async () => {
    estimateFindFirst
      .mockResolvedValueOnce({
        id: 1,
        status: "scheduled",
        invoiceNumber: null,
      })
      .mockResolvedValueOnce({ id: 1, invoiceNumber: 7 });
    organizationUpdate.mockResolvedValueOnce({ nextInvoiceNumber: 8 });
    estimateUpdateMany.mockResolvedValueOnce({ count: 1 });

    await markEstimateAsInvoice(1, "org1");

    const call = estimateUpdateMany.mock.calls[0]?.[0];
    const data = (call as { data: { invoicedAt: Date; dueDate: Date } }).data;
    const diffMs = data.dueDate.getTime() - data.invoicedAt.getTime();
    expect(Math.round(diffMs / (24 * 60 * 60 * 1000))).toBe(30);
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
