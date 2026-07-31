import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceLockedError, InvoiceOverbillError } from "@/lib/api/errors";

// --- Prisma mock ----------------------------------------------------------
// createInvoice / recordPayment / markInvoiceSent /
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
const invoiceEventCreate = vi.fn();
const orgFindUniqueOrThrow = vi.fn();
const orgUpdate = vi.fn();

const tx = {
  estimate: { findFirst: estimateFindFirst },
  invoice: {
    findFirst: invoiceFindFirst,
    findUnique: invoiceFindUnique,
    create: invoiceCreate,
    update: invoiceUpdate,
    updateMany: invoiceUpdateMany,
  },
  payment: { create: paymentCreate },
  invoiceEvent: { create: invoiceEventCreate },
  organization: {
    findUniqueOrThrow: orgFindUniqueOrThrow,
    update: orgUpdate,
  },
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
} = await import("@/lib/repositories/invoiceRepo");

beforeEach(() => vi.clearAllMocks());

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

  it("allows over-payment and still reaches paid (no overbill guard, by design)", async () => {
    // CONTEXT.md: the payment ledger is free-form — recordPayment has no
    // overbill guard (unlike createInvoice). A payment exceeding the
    // invoice amount must be accepted and the invoice settles to "paid".
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
