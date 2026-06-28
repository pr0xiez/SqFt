import { describe, expect, it, vi } from "vitest";
import { handleStripeEvent } from "@/lib/stripe/webhook";

function deps() {
  const record = vi.fn().mockResolvedValue({ recorded: true });
  const seen = new Set<string>();
  return {
    record,
    isProcessed: async (id: string) => seen.has(id),
    markProcessed: async (id: string) => void seen.add(id),
    retrieveCharge: vi
      .fn()
      .mockResolvedValue({ id: "ch_1", balanceFee: 1.43, balanceNet: 448.57 }),
  };
}

describe("handleStripeEvent", () => {
  it("records a payment for checkout.session.completed", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_1",
        type: "checkout.session.completed",
        account: "acct_1",
        data: {
          object: {
            payment_intent: "pi_1",
            metadata: { invoiceId: "77", orgId: "org_1" },
            amount_total: 45000,
          },
        },
      } as never,
      d
    );
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 77,
        orgId: "org_1",
        paymentIntentId: "pi_1",
        amount: 450,
      })
    );
  });

  it("is idempotent on event id — a duplicate delivery records nothing", async () => {
    const d = deps();
    // A complete, recordable event so the first delivery DOES record — the
    // point is that re-delivering the SAME event id must not record twice.
    const ev = {
      id: "evt_2",
      type: "checkout.session.completed",
      account: "acct_1",
      data: {
        object: {
          payment_intent: "pi_2",
          metadata: { invoiceId: "88", orgId: "org_1" },
          amount_total: 12000,
        },
      },
    } as never;
    await handleStripeEvent(ev, d);
    await handleStripeEvent(ev, d); // same event id re-delivered
    // First records; second short-circuits on isProcessed → exactly one record.
    expect(d.record).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated event types", async () => {
    const d = deps();
    await handleStripeEvent(
      { id: "evt_3", type: "customer.created", data: { object: {} } } as never,
      d
    );
    expect(d.record).not.toHaveBeenCalled();
  });
});
