import { beforeEach, describe, expect, it, vi } from "vitest";

const invoiceFindFirst = vi.fn();
const paymentFindUnique = vi.fn();
const paymentCreate = vi.fn();
const invoiceUpdate = vi.fn();
const invoiceEventCreate = vi.fn();

const tx = {
  invoice: { findFirst: invoiceFindFirst, update: invoiceUpdate },
  payment: { findUnique: paymentFindUnique, create: paymentCreate },
  invoiceEvent: { create: invoiceEventCreate },
};
const $transaction = vi.fn((cb: (c: typeof tx) => unknown) => cb(tx));

vi.mock("@/lib/prisma", () => ({ prisma: { ...tx, $transaction } }));

const { recordStripePayment } = await import("@/lib/repositories/invoiceRepo");

beforeEach(() => vi.clearAllMocks());

const input = {
  amount: 100,
  method: "card" as const,
  stripeChargeId: "ch_1",
  stripePaymentIntentId: "pi_1",
};

describe("recordStripePayment", () => {
  it("returns 'duplicate' when the charge id already exists (replay)", async () => {
    paymentFindUnique.mockResolvedValue({ id: 9 });
    expect(await recordStripePayment(1, "org1", input)).toBe("duplicate");
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("returns 'not_found' when the invoice is missing in the org", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue(null);
    expect(await recordStripePayment(1, "org1", input)).toBe("not_found");
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("records with no human recorder and recomputes status to partial", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      amount: 500,
      payments: [{ amount: 100 }],
    });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    expect(await recordStripePayment(1, "org1", input)).toBe("recorded");

    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 1,
          amount: 100,
          method: "card",
          recordedByEmail: null,
          recordedByName: "Stripe",
          stripeChargeId: "ch_1",
        }),
      })
    );
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "partial",
          paidAt: null,
          stripePaymentIntentId: "pi_1",
        }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "payment_recorded",
          source: "system",
        }),
      })
    );
  });

  it("settles to paid (paidAt set) when fully covered", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      amount: 100,
      payments: [],
    });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordStripePayment(1, "org1", input);

    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("paid");
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it("treats a P2002 unique-violation on create as 'duplicate'", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      amount: 100,
      payments: [],
    });
    paymentCreate.mockRejectedValue({ code: "P2002" });

    expect(await recordStripePayment(1, "org1", input)).toBe("duplicate");
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("does not record onto a void invoice", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "void",
      amount: 100,
      payments: [],
    });
    expect(await recordStripePayment(1, "org1", input)).toBe("duplicate");
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});
