import { describe, expect, it, vi } from "vitest";
import { handleStripeEvent } from "@/lib/stripe/webhook";

function deps() {
  const record = vi.fn().mockResolvedValue({ recorded: true });
  const seen = new Set<string>();
  const markProcessed = vi.fn(async (id: string) => void seen.add(id));
  return {
    record,
    markProcessed,
    isProcessed: async (id: string) => seen.has(id),
    // Authoritative org resolved from the signed event.account.
    orgIdForAccount: vi.fn().mockResolvedValue("org_1"),
    retrieveCharge: vi
      .fn()
      .mockResolvedValue({ id: "ch_1", balanceFee: 1.43, balanceNet: 448.57 }),
  };
}

function recordableEvent(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  } as never;
}

describe("handleStripeEvent", () => {
  it("records a payment for checkout.session.completed", async () => {
    const d = deps();
    await handleStripeEvent(recordableEvent(), d);
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
    const ev = recordableEvent({ id: "evt_2" });
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

  // ── Finding #1: cross-org forgery ───────────────────────────────────────────

  it("records under the org that owns event.account, not the metadata orgId", async () => {
    // A malicious connected account forges metadata pointing at a VICTIM org.
    // The signed event.account is the only trustworthy owner, so the recorded
    // orgId must come from resolving that account — never from metadata.
    const d = deps();
    d.orgIdForAccount = vi.fn().mockResolvedValue("attacker_org");
    await handleStripeEvent(
      recordableEvent({
        account: "acct_attacker",
        data: {
          object: {
            payment_intent: "pi_x",
            metadata: { invoiceId: "77", orgId: "victim_org" },
            amount_total: 45000,
          },
        },
      }),
      d
    );
    expect(d.orgIdForAccount).toHaveBeenCalledWith("acct_attacker");
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "attacker_org", invoiceId: 77 })
    );
  });

  it("does not record when event.account resolves to no org", async () => {
    const d = deps();
    d.orgIdForAccount = vi.fn().mockResolvedValue(null);
    await handleStripeEvent(recordableEvent({ account: "acct_unknown" }), d);
    expect(d.record).not.toHaveBeenCalled();
    // Still terminal — a phantom account will never resolve, so don't retry-loop.
    expect(d.markProcessed).toHaveBeenCalled();
  });

  // ── Finding #6: require a real charge id ─────────────────────────────────────

  it("does not record and forces a retry when the charge is not yet attached", async () => {
    const d = deps();
    d.retrieveCharge = vi
      .fn()
      .mockResolvedValue({ id: null, balanceFee: null, balanceNet: null });
    await expect(handleStripeEvent(recordableEvent(), d)).rejects.toThrow();
    expect(d.record).not.toHaveBeenCalled();
    // NOT marked processed → the 500 makes Stripe redeliver once the charge lands.
    expect(d.markProcessed).not.toHaveBeenCalled();
  });
});
