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

  it("is idempotent on event id", async () => {
    const d = deps();
    const ev = {
      id: "evt_2",
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as never;
    await handleStripeEvent(ev, d);
    await handleStripeEvent(ev, d);
    // second delivery short-circuits before doing work
    expect(d.record).toHaveBeenCalledTimes(0); // unrelated type, but still marked processed
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
