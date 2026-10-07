import { beforeEach, describe, expect, it, vi } from "vitest";

// Issue #350: recordStripePayment must row-lock the invoice (SELECT ... FOR
// UPDATE) before reading its payments, exactly like recordPayment (#206).

const order: string[] = [];
const lockImpl = async () => {
  order.push("lock");
  return [{ id: 7 }];
};
const queryRaw = vi.fn(lockImpl);
const invoiceFindFirst = vi.fn(async () => {
  order.push("read");
  return {
    id: 7,
    status: "sent",
    amount: 500,
    viewedAt: null,
    payments: [{ amount: 100 }],
  };
});
const tx = {
  $queryRaw: queryRaw,
  invoice: { findFirst: invoiceFindFirst, update: vi.fn() },
  payment: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    updateMany: vi.fn(),
  },
  invoiceEvent: { create: vi.fn() },
  qboConnection: { findUnique: vi.fn().mockResolvedValue(null) },
  qboSyncTask: { upsert: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { ...tx, $transaction: (cb: (c: typeof tx) => unknown) => cb(tx) },
}));

const { recordStripePayment } = await import("@/lib/repositories/invoiceRepo");

const input = {
  paymentIntentId: "pi_1",
  chargeId: "ch_1",
  orgId: "org1",
  invoiceId: 7,
  amount: 400,
  feeAmount: null,
  netAmount: null,
};

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  queryRaw.mockImplementation(lockImpl);
});

describe("recordStripePayment invoice row lock", () => {
  it("locks the invoice before reading payments, then records", async () => {
    const res = await recordStripePayment(input);
    expect(res).toEqual({ recorded: true, overpaid: false });
    expect(order.slice(0, 2)).toEqual(["lock", "read"]);
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid" }),
      })
    );
  });

  it("records nothing when the locked invoice is not in the org", async () => {
    queryRaw.mockResolvedValueOnce([]);
    const res = await recordStripePayment(input);
    expect(res).toEqual({ recorded: false, overpaid: false });
    expect(invoiceFindFirst).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
