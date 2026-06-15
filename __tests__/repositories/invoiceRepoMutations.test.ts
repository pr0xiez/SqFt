import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceLockedError, InvoiceOverbillError } from "@/lib/api/errors";

// --- Prisma mock ----------------------------------------------------------
// createInvoice / updateInvoice / recordPayment / markInvoiceSent /
// markInvoiceViewed run inside prisma.$transaction(async (tx) => ...).
// We make $transaction invoke its callback with a `tx` object whose model
// delegates are the same vi.fn()s used for the non-transactional calls, so a
// single set of mocks covers both styles. voidInvoice / getInvoice call the
// top-level prisma client directly.

const estimateFindFirst = vi.fn();
const invoiceFindFirst = vi.fn();
const invoiceFindUnique = vi.fn();
const invoiceCreate = vi.fn();
const invoiceUpdate = vi.fn();
const invoiceUpdateMany = vi.fn();
const paymentCreate = vi.fn();
const paymentAggregate = vi.fn();
const invoiceEventCreate = vi.fn();
const orgFindUniqueOrThrow = vi.fn();
const orgUpdate = vi.fn();
// recordPayment locks the invoice row with `tx.$queryRaw(... FOR UPDATE)`
// before reading the ledger. By default the lock "finds" the row; the
// not-found test overrides this to resolve `[]`.
const queryRaw = vi.fn().mockResolvedValue([{ id: 1 }]);

const tx = {
  estimate: { findFirst: estimateFindFirst },
  invoice: {
    findFirst: invoiceFindFirst,
    findUnique: invoiceFindUnique,
    create: invoiceCreate,
    update: invoiceUpdate,
    updateMany: invoiceUpdateMany,
  },
  payment: { create: paymentCreate, aggregate: paymentAggregate },
  invoiceEvent: { create: invoiceEventCreate },
  organization: {
    findUniqueOrThrow: orgFindUniqueOrThrow,
    update: orgUpdate,
  },
  $queryRaw: queryRaw,
};

// NOTE: this mock runs the callback inline and does NOT model rollback — calls
// recorded before a throw stay recorded. Don't write a test asserting a mutation
// was "rolled back" after an error; the mock can't observe that.
const $transaction = vi.fn((cb: (client: typeof tx) => unknown) => cb(tx));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...tx,
    $transaction,
  },
}));

const {
  createInvoice,
  updateInvoice,
  voidInvoice,
  recordPayment,
  markInvoiceSent,
  markInvoiceViewed,
} = await import("@/lib/repositories/invoiceRepo");

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks wipes the default implementation; re-arm the row lock so it
  // "finds" the invoice by default. paymentAggregate defaults to an empty sum.
  queryRaw.mockResolvedValue([{ id: 1 }]);
  paymentAggregate.mockResolvedValue({ _sum: { amount: 0 } });
});

/** A hydrated estimate whose computed view total is `total`. */
function estimateFixture(opts: {
  total: number;
  terms?: string;
  invoices?: Array<{
    id?: number;
    amount: number;
    status: string;
    payments: { amount: number }[];
  }>;
}) {
  return {
    id: 1,
    orgId: "org1",
    terms: opts.terms ?? "Net 30",
    markupPct: 0,
    convenienceFeeRate: 0,
    depositPct: 0,
    lineItems: [
      {
        id: 1,
        name: "Flooring",
        description: "Install",
        rate: opts.total,
        qtyMode: "manual",
        qty: 1,
        wastePct: 0,
        unitLabel: "job",
        linkedRoomIds: [],
        sortOrder: 0,
      },
    ],
    siteMeasure: { items: [] },
    invoices: opts.invoices ?? [],
  };
}

describe("createInvoice", () => {
  it("returns null when the estimate is not found in the org", async () => {
    estimateFindFirst.mockResolvedValue(null);
    expect(await createInvoice("org1", { estimateId: 99 })).toBeNull();
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99, orgId: "org1" } })
    );
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("flat-amount path: stores the rounded amount and null pct", async () => {
    estimateFindFirst.mockResolvedValue(estimateFixture({ total: 1000 }));
    // Atomic increment returns the post-increment counter; reserved number is -1.
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 8,
      defaultPaymentInstructions: "Pay here",
    });
    invoiceCreate.mockResolvedValue({ id: 10 });

    await createInvoice("org1", { estimateId: 1, amount: 250.005 });

    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org1",
          estimateId: 1,
          invoiceNumber: 7,
          status: "draft",
          amount: 250.01,
          pct: null,
          paymentInstructions: "Pay here",
        }),
      })
    );
  });

  it("pct-of-total path: derives amount from estimate total and stores pct", async () => {
    estimateFindFirst.mockResolvedValue(estimateFixture({ total: 1000 }));
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 2,
      defaultPaymentInstructions: "",
    });
    invoiceCreate.mockResolvedValue({ id: 11 });

    await createInvoice("org1", { estimateId: 1, pct: 0.25 });

    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 250, pct: 0.25 }),
      })
    );
  });

  it("atomically increments the org's nextInvoiceNumber via an increment-returning update", async () => {
    estimateFindFirst.mockResolvedValue(estimateFixture({ total: 1000 }));
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 43,
      defaultPaymentInstructions: "",
    });
    invoiceCreate.mockResolvedValue({ id: 12 });

    await createInvoice("org1", { estimateId: 1, amount: 100 });

    // Must not read the counter via a non-locking findUniqueOrThrow (issue #159).
    expect(orgFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, defaultPaymentInstructions: true },
    });
    // Reserved number is the pre-increment value (returned - 1).
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceNumber: 42 }),
      })
    );
  });

  it("falls back to the estimate's terms when none are supplied", async () => {
    estimateFindFirst.mockResolvedValue(
      estimateFixture({ total: 1000, terms: "Due on receipt" })
    );
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 2,
      defaultPaymentInstructions: "",
    });
    invoiceCreate.mockResolvedValue({ id: 13 });

    await createInvoice("org1", { estimateId: 1, amount: 100 });

    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ terms: "Due on receipt" }),
      })
    );
  });

  it("throws InvoiceOverbillError when the amount exceeds the unbilled balance", async () => {
    // total 1000, already billed 900 (non-void) → unbilled 100.
    estimateFindFirst.mockResolvedValue(
      estimateFixture({
        total: 1000,
        invoices: [{ amount: 900, status: "sent", payments: [] }],
      })
    );

    await expect(
      createInvoice("org1", { estimateId: 1, amount: 200 })
    ).rejects.toBeInstanceOf(InvoiceOverbillError);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });
});

describe("updateInvoice", () => {
  it("returns null when the invoice is not found in the org", async () => {
    invoiceFindFirst.mockResolvedValue(null);
    expect(await updateInvoice(99, "org1", { memo: "x" })).toBeNull();
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("throws InvoiceLockedError when the invoice is not a draft", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      estimate: estimateFixture({ total: 1000 }),
    });
    await expect(
      updateInvoice(1, "org1", { memo: "x" })
    ).rejects.toBeInstanceOf(InvoiceLockedError);
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("only writes the metadata fields that are present in the patch", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "draft",
      estimate: estimateFixture({ total: 1000 }),
    });
    invoiceUpdate.mockResolvedValue({ id: 1 });

    await updateInvoice(1, "org1", { memo: "hello", coverNote: "note" });

    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1 });
    expect(call.data).toEqual({ memo: "hello", coverNote: "note" });
    // amount/pct untouched when not in the patch.
    expect(call.data.amount).toBeUndefined();
    expect(call.data.pct).toBeUndefined();
  });

  it("recomputes amount/pct and writes them when amount is patched", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "draft",
      estimate: estimateFixture({ total: 1000 }),
    });
    invoiceUpdate.mockResolvedValue({ id: 1 });

    await updateInvoice(1, "org1", { pct: 0.5 });

    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.data.amount).toBe(500);
    expect(call.data.pct).toBe(0.5);
  });

  it("excludes the invoice's own amount from the overbill check", async () => {
    // total 1000, this invoice already counts for 600 plus a sibling at 0.
    // Patching it back up to 1000 must be allowed (its old amount is excluded).
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "draft",
      estimate: estimateFixture({
        total: 1000,
        invoices: [
          { id: 1, amount: 600, status: "draft", payments: [] },
          { id: 2, amount: 0, status: "draft", payments: [] },
        ],
      }),
    });
    invoiceUpdate.mockResolvedValue({ id: 1 });

    await updateInvoice(1, "org1", { amount: 1000 });
    expect(invoiceUpdate).toHaveBeenCalled();
  });

  it("throws InvoiceOverbillError when the new amount exceeds unbilled", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "draft",
      estimate: estimateFixture({
        total: 1000,
        invoices: [
          { id: 1, amount: 100, status: "draft", payments: [] },
          { id: 2, amount: 900, status: "sent", payments: [] },
        ],
      }),
    });

    await expect(
      updateInvoice(1, "org1", { amount: 500 })
    ).rejects.toBeInstanceOf(InvoiceOverbillError);
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });
});

describe("voidInvoice", () => {
  it("voids a non-void invoice, logs the event, and re-reads it", async () => {
    invoiceUpdateMany.mockResolvedValue({ count: 1 });
    invoiceEventCreate.mockResolvedValue({});
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "void",
      estimate: {
        siteMeasure: {
          location: { customer: { email: "janet@example.com" } },
        },
      },
    });

    const result = await voidInvoice(1, "org1");

    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1", status: { not: "void" } },
        data: expect.objectContaining({ status: "void" }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "voided" }),
      })
    );
    expect(result).toEqual({
      id: 1,
      status: "void",
      customerEmail: "janet@example.com",
    });
  });

  it("returns null and does not log when the invoice was already void", async () => {
    invoiceUpdateMany.mockResolvedValue({ count: 0 });

    expect(await voidInvoice(1, "org1")).toBeNull();
    expect(invoiceEventCreate).not.toHaveBeenCalled();
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });
});

describe("recordPayment", () => {
  const paymentInput = {
    amount: 0,
    method: "cash",
    recordedByEmail: "a@b.com",
    recordedByName: "Alex",
  };

  it("returns null when the invoice is not found in the org", async () => {
    invoiceFindFirst.mockResolvedValue(null);
    expect(
      await recordPayment(99, "org1", { ...paymentInput, amount: 10 })
    ).toBeNull();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("locks the org-scoped invoice row FOR UPDATE before reading the ledger", async () => {
    // Serialization guard (issue #206): concurrent recordPayment calls must
    // serialize on a SELECT ... FOR UPDATE row lock so each sees the other's
    // committed payment, and the paid sum is a DB-side aggregate inside the
    // lock — never a pre-lock read. Assert the lock fires, it is org-scoped,
    // and the status is derived from the aggregate (not inv.payments).
    invoiceFindFirst
      .mockResolvedValueOnce({ id: 1, status: "partial", amount: 100 })
      .mockResolvedValueOnce({ id: 1, status: "paid" });
    paymentCreate.mockResolvedValue({});
    paymentAggregate.mockResolvedValue({ _sum: { amount: 100 } });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", { ...paymentInput, amount: 40 });

    // The lock is taken before the payment INSERT and before the aggregate.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const lockSql = JSON.stringify(queryRaw.mock.calls[0][0]);
    expect(lockSql).toContain("FOR UPDATE");
    // Org-scoped parameters carried into the locking query.
    expect(queryRaw.mock.calls[0][0].values).toEqual([1, "org1"]);
    expect(paymentAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: 1 },
        _sum: { amount: true },
      })
    );
    expect(invoiceUpdate.mock.calls[0][0].data.status).toBe("paid");
  });

  it("returns null without inserting when the FOR UPDATE lock finds no row", async () => {
    // The row lock is the org-scoped existence check now; if it matches nothing
    // (wrong id or foreign org) we must bail before touching the ledger.
    queryRaw.mockResolvedValue([]);

    expect(
      await recordPayment(99, "org1", { ...paymentInput, amount: 10 })
    ).toBeNull();
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("throws InvoiceLockedError when the invoice is void", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "void",
      amount: 100,
      payments: [],
    });
    await expect(
      recordPayment(1, "org1", { ...paymentInput, amount: 10 })
    ).rejects.toBeInstanceOf(InvoiceLockedError);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("stays unpaid (sent) when the payment is zero", async () => {
    invoiceFindFirst
      .mockResolvedValueOnce({
        id: 1,
        status: "sent",
        amount: 100,
        payments: [],
      })
      .mockResolvedValueOnce({ id: 1, status: "sent" });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", { ...paymentInput, amount: 0 });

    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "sent", paidAt: null } })
    );
  });

  it("becomes partial when some but not all is paid", async () => {
    invoiceFindFirst
      .mockResolvedValueOnce({ id: 1, status: "sent", amount: 100 })
      .mockResolvedValueOnce({ id: 1, status: "partial" });
    paymentCreate.mockResolvedValue({});
    // Locked-ledger aggregate: prior 20 + the 30 just inserted = 50 of 100.
    paymentAggregate.mockResolvedValue({ _sum: { amount: 50 } });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", { ...paymentInput, amount: 30 });

    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "partial", paidAt: null } })
    );
    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 1, amount: 30 }),
      })
    );
  });

  it("becomes paid (with paidAt set) when fully covered", async () => {
    invoiceFindFirst
      .mockResolvedValueOnce({ id: 1, status: "partial", amount: 100 })
      .mockResolvedValueOnce({ id: 1, status: "paid" });
    paymentCreate.mockResolvedValue({});
    // Locked-ledger aggregate: prior 60 + the 40 just inserted = 100 of 100.
    paymentAggregate.mockResolvedValue({ _sum: { amount: 100 } });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", { ...paymentInput, amount: 40 });

    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("paid");
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it("allows over-payment and still reaches paid (no overbill guard, by design)", async () => {
    // CONTEXT.md: the payment ledger is free-form — recordPayment has no
    // overbill guard (unlike create/updateInvoice). A payment exceeding the
    // invoice amount must be accepted and the invoice settles to "paid".
    invoiceFindFirst
      .mockResolvedValueOnce({ id: 1, status: "sent", amount: 100 })
      .mockResolvedValueOnce({ id: 1, status: "paid" });
    paymentCreate.mockResolvedValue({});
    // Locked-ledger aggregate: the single 150 payment exceeds the 100 amount.
    paymentAggregate.mockResolvedValue({ _sum: { amount: 150 } });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await expect(
      recordPayment(1, "org1", { ...paymentInput, amount: 150 })
    ).resolves.not.toThrow();

    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 1, amount: 150 }),
      })
    );
    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("paid");
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it("logs a payment_recorded event with the actor and metadata", async () => {
    invoiceFindFirst
      .mockResolvedValueOnce({
        id: 1,
        status: "sent",
        amount: 100,
        payments: [],
      })
      .mockResolvedValueOnce({ id: 1 });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", {
      ...paymentInput,
      amount: 50,
      method: "card",
    });

    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "payment_recorded",
          actorEmail: "a@b.com",
          actorName: "Alex",
          metadata: { amount: 50, method: "card" },
        }),
      })
    );
  });
});

describe("markInvoiceSent", () => {
  const sentInput = {
    to: "c@d.com",
    subject: "Your invoice",
    sentByEmail: "a@b.com",
    sentByName: "Alex",
    snapshot: {},
  };

  it("returns false when the invoice is not found", async () => {
    invoiceFindFirst.mockResolvedValue(null);
    expect(await markInvoiceSent(99, "org1", sentInput)).toBe(false);
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("flips a draft to sent and logs a 'sent' event on first send", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "draft",
      sentAt: null,
    });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    expect(await markInvoiceSent(1, "org1", sentInput)).toBe(true);
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "sent" }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "sent" }),
      })
    );
  });

  it("keeps a non-draft status and logs a 'resent' event when already sent", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "viewed",
      sentAt: new Date(),
    });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await markInvoiceSent(1, "org1", sentInput);
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "viewed" }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "resent" }),
      })
    );
  });
});

describe("markInvoiceViewed", () => {
  it("flips a sent invoice to viewed and always logs the open", async () => {
    invoiceFindUnique.mockResolvedValue({ status: "sent" });
    invoiceUpdateMany.mockResolvedValue({ count: 1 });
    invoiceEventCreate.mockResolvedValue({});

    await markInvoiceViewed(1, { ip: "1.2.3.4", userAgent: "UA" });

    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, status: "sent" },
        data: expect.objectContaining({ status: "viewed" }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "viewed", source: "customer" }),
      })
    );
  });

  it("does not re-status a non-sent invoice but still logs the open", async () => {
    invoiceFindUnique.mockResolvedValue({ status: "paid" });
    invoiceEventCreate.mockResolvedValue({});

    await markInvoiceViewed(1, { ip: null, userAgent: null });

    expect(invoiceUpdateMany).not.toHaveBeenCalled();
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "viewed" }),
      })
    );
  });

  it("does nothing when the invoice does not exist", async () => {
    invoiceFindUnique.mockResolvedValue(null);

    await markInvoiceViewed(99, { ip: null, userAgent: null });

    expect(invoiceUpdateMany).not.toHaveBeenCalled();
    expect(invoiceEventCreate).not.toHaveBeenCalled();
  });
});
