import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvoiceLockedError,
  InvoiceOverbillError,
  InvoiceOverpayError,
} from "@/lib/api/errors";

// --- Prisma mock ----------------------------------------------------------
// createInvoice / voidInvoice / recordPayment /
// markInvoiceSent / markInvoiceViewed run inside
// prisma.$transaction(async (tx) => ...). We make $transaction invoke its
// callback with a `tx` object whose model delegates are the same vi.fn()s
// used for the non-transactional calls, so a single set of mocks covers both
// styles. getInvoice (voidInvoice's post-commit re-read) calls the top-level
// prisma client directly.

const estimateFindFirst = vi.fn();
const invoiceFindFirst = vi.fn();
const invoiceFindUnique = vi.fn();
const invoiceCreate = vi.fn();
const invoiceUpdate = vi.fn();
const invoiceUpdateMany = vi.fn();
const paymentCreate = vi.fn();
const invoiceEventCreate = vi.fn();
const orgFindUniqueOrThrow = vi.fn();
const orgUpdate = vi.fn();
// recordPayment's row lock (issue #206) — tagged-template $queryRaw.
const queryRaw = vi.fn();

const qboConnectionFindUnique = vi.fn().mockResolvedValue(null);
const qboSyncTaskUpsert = vi.fn();

const tx = {
  estimate: { findFirst: estimateFindFirst },
  invoice: {
    findFirst: invoiceFindFirst,
    findUnique: invoiceFindUnique,
    create: invoiceCreate,
    update: invoiceUpdate,
    updateMany: invoiceUpdateMany,
  },
  payment: { create: paymentCreate, findMany: vi.fn().mockResolvedValue([]) },
  invoiceEvent: { create: invoiceEventCreate },
  organization: {
    findUniqueOrThrow: orgFindUniqueOrThrow,
    update: orgUpdate,
  },
  // QBO enqueue-in-transaction (enqueueQboTaskTx): no connection → no-op.
  qboConnection: { findUnique: qboConnectionFindUnique },
  qboSyncTask: { upsert: qboSyncTaskUpsert },
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
  voidInvoice,
  recordPayment,
  markInvoiceSent,
  markInvoiceViewed,
  getInvoice,
  getInvoiceByToken,
  invoiceHasPublicToken,
  getOrCreateInvoicePublicToken,
} = await import("@/lib/repositories/invoiceRepo");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the row-lock query finds the invoice. Tests for the "not
  // found" path override this per-case.
  queryRaw.mockResolvedValue([{ id: 1 }]);
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

  // Regression for issue #298: the overbill decision must be serialized the
  // same way nextInvoiceNumber allocation already is, by locking the Estimate
  // row before reading it (and its invoices) — a plain read does not lock
  // under READ COMMITTED.

  it("locks the Estimate row (SELECT ... FOR UPDATE) before reading it and its invoices", async () => {
    estimateFindFirst.mockResolvedValue(estimateFixture({ total: 1000 }));
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 2,
      defaultPaymentInstructions: "",
    });
    invoiceCreate.mockResolvedValue({ id: 1 });
    queryRaw.mockResolvedValue(undefined);

    await createInvoice("org1", { estimateId: 1, amount: 100 });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0];
    const sql = (strings as unknown as string[]).join("");
    expect(sql).toContain("Estimate");
    expect(sql).toContain("FOR UPDATE");
    expect(values).toEqual([1, "org1"]);

    // The lock must be acquired before the estimate (with its invoices) is
    // read — that ordering is what serializes the overbill decision below.
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      estimateFindFirst.mock.invocationCallOrder[0]
    );
  });

  it("serializes two concurrent creates so the second sees the first's committed invoice and is rejected as overbill", async () => {
    // total 1000; two "concurrent" requests each try to bill 600 (sum 1200 >
    // 1000). Under READ COMMITTED a plain read of the estimate/invoices does
    // not block, so without the row lock both calls could read unbilled=1000
    // and both pass. The lock forces the second call's read to wait until the
    // first commits, so it observes the first invoice and is rejected here.
    queryRaw.mockResolvedValue(undefined);
    estimateFindFirst
      .mockResolvedValueOnce(estimateFixture({ total: 1000, invoices: [] }))
      .mockResolvedValueOnce(
        estimateFixture({
          total: 1000,
          invoices: [{ amount: 600, status: "draft", payments: [] }],
        })
      );
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 2,
      defaultPaymentInstructions: "",
    });
    invoiceCreate.mockResolvedValue({ id: 1 });

    const first = await createInvoice("org1", { estimateId: 1, amount: 600 });
    expect(first).toEqual({ id: 1 });

    await expect(
      createInvoice("org1", { estimateId: 1, amount: 600 })
    ).rejects.toBeInstanceOf(InvoiceOverbillError);

    // The lock is taken on every call (would serialize a real concurrent
    // pair), and only the first call's invoice was ever created.
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(invoiceCreate).toHaveBeenCalledTimes(1);
  });
});

describe("voidInvoice", () => {
  it("voids a non-void invoice, logs the event atomically, and re-reads it", async () => {
    invoiceUpdateMany.mockResolvedValue({ count: 1 });
    invoiceEventCreate.mockResolvedValue({});
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "void",
      estimate: {
        id: 7,
        estimateNumber: 5007,
        siteMeasure: {
          id: 3,
          siteMeasureNumber: 1003,
          location: {
            address: "1 Main St",
            customer: { id: 9, name: "Janet", email: "janet@example.com" },
          },
        },
      },
    });

    const result = await voidInvoice(1, "org1");

    // Both writes happen inside the same $transaction (issue #160), not as
    // two separate top-level prisma calls.
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1", status: { not: "void" } },
        data: expect.objectContaining({ status: "void" }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "voided", source: "builder" }),
      })
    );
    // The event write must happen after the status update within the
    // transaction (mock invokes calls synchronously in call order).
    const updateOrder = invoiceUpdateMany.mock.invocationCallOrder[0];
    const eventOrder = invoiceEventCreate.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(eventOrder);
    // The post-commit re-read happens outside the transaction, after both
    // writes landed.
    expect(result).toEqual({
      id: 1,
      status: "void",
      customerEmail: "janet@example.com",
      trail: {
        customer: { id: 9, name: "Janet" },
        siteMeasure: { id: 3, siteMeasureNumber: 1003 },
        estimate: { id: 7, estimateNumber: 5007 },
        address: "1 Main St",
      },
    });
  });

  it("returns null and writes no event when the invoice was already void (no-op transaction)", async () => {
    invoiceUpdateMany.mockResolvedValue({ count: 0 });

    expect(await voidInvoice(1, "org1")).toBeNull();
    expect($transaction).toHaveBeenCalledTimes(1);
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

  it("returns null when the row lock finds no matching invoice, without reading payments", async () => {
    // Issue #206: an empty FOR UPDATE result (wrong org, or missing row) is
    // treated the same as "not found" — and short-circuits before the
    // payments read, not just before the write.
    queryRaw.mockResolvedValue([]);
    expect(
      await recordPayment(1, "wrong-org", { ...paymentInput, amount: 10 })
    ).toBeNull();
    expect(invoiceFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("row-locks the invoice via FOR UPDATE before reading its payments (issue #206)", async () => {
    // Pins the fix for the lost-update race: two concurrent recordPayment
    // calls must serialize on this lock instead of both reading the same
    // stale `payments` sum. We can't spin up two real Postgres transactions
    // in this mocked-Prisma unit test, so we assert the mechanism instead —
    // the lock statement is issued, targets the right invoice/org, uses
    // FOR UPDATE, and runs strictly before the payments-bearing findFirst.
    const callOrder: string[] = [];
    queryRaw.mockImplementation(async () => {
      callOrder.push("lock");
      return [{ id: 1 }];
    });
    invoiceFindFirst.mockImplementationOnce(async () => {
      callOrder.push("read");
      return { id: 1, status: "sent", amount: 100, payments: [] };
    });
    // Final re-read after the write; irrelevant to lock ordering.
    invoiceFindFirst.mockResolvedValueOnce({ id: 1, status: "sent" });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", { ...paymentInput, amount: 25 });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0];
    expect(strings.join("")).toContain("FOR UPDATE");
    expect(strings.join("")).toContain('"Invoice"');
    expect(strings.join("")).toContain('"orgId"');
    expect(values).toEqual([1, "org1"]);
    expect(callOrder).toEqual(["lock", "read"]);
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
      .mockResolvedValueOnce({
        id: 1,
        status: "sent",
        amount: 100,
        payments: [{ amount: 20 }],
      })
      .mockResolvedValueOnce({ id: 1, status: "partial" });
    paymentCreate.mockResolvedValue({});
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
      .mockResolvedValueOnce({
        id: 1,
        status: "partial",
        amount: 100,
        payments: [{ amount: 60 }],
      })
      .mockResolvedValueOnce({ id: 1, status: "paid" });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordPayment(1, "org1", { ...paymentInput, amount: 40 });

    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("paid");
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it("throws InvoiceOverpayError when the payment exceeds the outstanding balance, without creating a Payment row", async () => {
    // total 100, already paid 20 → outstanding 80. A 150 payment overshoots.
    invoiceFindFirst.mockResolvedValueOnce({
      id: 1,
      status: "sent",
      amount: 100,
      payments: [{ amount: 20 }],
    });

    const err = await recordPayment(1, "org1", {
      ...paymentInput,
      amount: 150,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(InvoiceOverpayError);
    expect((err as InstanceType<typeof InvoiceOverpayError>).outstanding).toBe(
      80
    );
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("accepts a payment that lands within epsilon of paid-in-full", async () => {
    // outstanding is 100; a payment of 100.005 is within OVERBILL_EPSILON
    // (0.005) of fully paid, mirroring nextInvoiceStatus's own +0.005 tolerance.
    invoiceFindFirst
      .mockResolvedValueOnce({
        id: 1,
        status: "sent",
        amount: 100,
        payments: [],
      })
      .mockResolvedValueOnce({ id: 1, status: "paid" });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await expect(
      recordPayment(1, "org1", { ...paymentInput, amount: 100.005 })
    ).resolves.not.toThrow();

    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 1, amount: 100.005 }),
      })
    );
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

  it("enqueues payment syncs with a single connection lookup (no N+1)", async () => {
    invoiceFindFirst.mockResolvedValue({ id: 1, status: "sent", sentAt: null });
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});
    qboConnectionFindUnique.mockResolvedValue({ status: "active" });
    vi.mocked(tx.payment.findMany).mockResolvedValueOnce([
      { id: 10 },
      { id: 11 },
      { id: 12 },
    ] as never);

    await markInvoiceSent(1, "org1", sentInput);

    // 1 lookup for sync_invoice + 1 for the whole payment batch.
    expect(qboConnectionFindUnique).toHaveBeenCalledTimes(2);
    expect(qboSyncTaskUpsert).toHaveBeenCalledTimes(4);
    const payIds = qboSyncTaskUpsert.mock.calls
      .map((c) => c[0].where.orgId_kind_entityId)
      .filter((w) => w.kind === "sync_payment")
      .map((w) => w.entityId);
    expect(payIds).toEqual([10, 11, 12]);
    qboConnectionFindUnique.mockResolvedValue(null);
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
    invoiceFindFirst.mockResolvedValue({ status: "sent" });
    invoiceUpdateMany.mockResolvedValue({ count: 1 });
    invoiceEventCreate.mockResolvedValue({});

    await markInvoiceViewed(1, "org1", { ip: "1.2.3.4", userAgent: "UA" });

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, orgId: "org1" } })
    );
    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, orgId: "org1", status: "sent" },
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
    invoiceFindFirst.mockResolvedValue({ status: "paid" });
    invoiceEventCreate.mockResolvedValue({});

    await markInvoiceViewed(1, "org1", { ip: null, userAgent: null });

    expect(invoiceUpdateMany).not.toHaveBeenCalled();
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "viewed" }),
      })
    );
  });

  it("does nothing when the invoice does not exist", async () => {
    invoiceFindFirst.mockResolvedValue(null);

    await markInvoiceViewed(99, "org1", { ip: null, userAgent: null });

    expect(invoiceUpdateMany).not.toHaveBeenCalled();
    expect(invoiceEventCreate).not.toHaveBeenCalled();
  });

  it("is org-scoped: a wrong orgId finds nothing and mutates nothing (issue #258)", async () => {
    // The invoice exists (id 1) but belongs to a different org than the
    // caller supplies — findFirst's {id, orgId} where clause must miss it.
    invoiceFindFirst.mockResolvedValue(null);

    await markInvoiceViewed(1, "wrong-org", { ip: null, userAgent: null });

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, orgId: "wrong-org" } })
    );
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
    expect(invoiceEventCreate).not.toHaveBeenCalled();
  });
});

// Regression coverage for #319 (CWE-201/522): `publicToken` is the sole
// bearer credential for the unauthenticated `/invoice-review/[token]` page —
// none of the authenticated reads/writes below may select it.
describe("publicToken is never selected by authenticated reads/writes", () => {
  it("getInvoice", async () => {
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      estimate: {
        siteMeasure: { location: { customer: { email: "j@example.com" } } },
      },
    });
    await getInvoice(1, "org1");
    const call = invoiceFindFirst.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(call.select).not.toHaveProperty("publicToken");
  });

  it("getInvoiceByToken", async () => {
    invoiceFindUnique.mockResolvedValue(null);
    await getInvoiceByToken("abc123");
    const call = invoiceFindUnique.mock.calls[0][0] as {
      where: unknown;
      select: Record<string, unknown>;
    };
    expect(call.where).toEqual({ publicToken: "abc123" });
    expect(call.select).not.toHaveProperty("publicToken");
  });

  it("createInvoice", async () => {
    estimateFindFirst.mockResolvedValue(estimateFixture({ total: 1000 }));
    orgUpdate.mockResolvedValue({
      nextInvoiceNumber: 2,
      defaultPaymentInstructions: "",
    });
    invoiceCreate.mockResolvedValue({ id: 1 });
    await createInvoice("org1", { estimateId: 1, amount: 100 });
    const call = invoiceCreate.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(call.select).not.toHaveProperty("publicToken");
  });

  it("recordPayment", async () => {
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
      amount: 10,
      method: "cash",
      recordedByEmail: "a@b.com",
      recordedByName: "Alex",
    });
    const call = invoiceFindFirst.mock.calls[1][0] as {
      select: Record<string, unknown>;
    };
    expect(call.select).not.toHaveProperty("publicToken");
  });
});

describe("invoiceHasPublicToken", () => {
  it("collapses a present token to true without returning it", async () => {
    invoiceFindFirst.mockResolvedValue({ publicToken: "secret" });
    expect(await invoiceHasPublicToken(1, "org1")).toBe(true);
    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      select: { publicToken: true },
    });
  });

  it("returns false when there's no token, or the invoice isn't in the org", async () => {
    invoiceFindFirst.mockResolvedValue({ publicToken: null });
    expect(await invoiceHasPublicToken(1, "org1")).toBe(false);
    invoiceFindFirst.mockResolvedValue(null);
    expect(await invoiceHasPublicToken(99, "org1")).toBe(false);
  });
});

describe("getOrCreateInvoicePublicToken", () => {
  it("returns the existing token without minting a new one", async () => {
    invoiceFindFirst.mockResolvedValue({ publicToken: "existing-token" });
    expect(await getOrCreateInvoicePublicToken(1, "org1")).toBe(
      "existing-token"
    );
    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      select: { publicToken: true },
    });
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
  });

  it("mints and persists a token when none exists yet", async () => {
    invoiceFindFirst.mockResolvedValue({ publicToken: null });
    invoiceUpdateMany.mockResolvedValue({ count: 1 });
    const token = await getOrCreateInvoicePublicToken(1, "org1");
    expect(token).toEqual(expect.any(String));
    expect(invoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { publicToken: token },
    });
  });

  it("returns null when the invoice isn't in the org", async () => {
    invoiceFindFirst.mockResolvedValue(null);
    expect(await getOrCreateInvoicePublicToken(99, "org1")).toBeNull();
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
  });
});
