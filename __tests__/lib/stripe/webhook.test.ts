import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

import { logError } from "@/lib/logger";
import { handleStripeEvent } from "@/lib/stripe/webhook";

beforeEach(() => {
  vi.mocked(logError).mockClear();
});

function deps() {
  const record = vi.fn().mockResolvedValue({ recorded: true, overpaid: false });
  const recordFailure = vi.fn().mockResolvedValue(undefined);
  const recordAnomaly = vi.fn().mockResolvedValue(undefined);
  const seen = new Set<string>();
  const markProcessed = vi.fn(async (id: string) => void seen.add(id));
  return {
    record,
    recordFailure,
    recordAnomaly,
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
        payment_status: "paid",
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
            payment_status: "paid",
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

  it("records an anomaly (not a Payment) when event.account resolves to no org", async () => {
    const d = deps();
    d.orgIdForAccount = vi.fn().mockResolvedValue(null);
    await handleStripeEvent(recordableEvent({ account: "acct_unknown" }), d);
    expect(d.record).not.toHaveBeenCalled();
    // Money moved but is unattributable → parked as a queryable anomaly, never
    // silently dropped (CONTEXT.md invariant 3).
    expect(d.recordAnomaly).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_1",
        accountId: "acct_unknown",
        paymentIntentId: "pi_1",
        amount: 450,
        reason: "unknown_account",
      })
    );
    // Still terminal — a phantom account will never resolve, so don't retry-loop.
    expect(d.markProcessed).toHaveBeenCalled();
  });

  // ── Finding: paid money with bad invoiceId metadata must not vanish ──────────

  it("records an anomaly when a paid session's invoiceId metadata is missing/non-numeric", async () => {
    const d = deps();
    await handleStripeEvent(
      recordableEvent({
        data: {
          object: {
            payment_intent: "pi_9",
            payment_status: "paid",
            metadata: { orgId: "org_1" }, // no invoiceId → Number(undefined) = NaN
            amount_total: 45000,
          },
        },
      }),
      d
    );
    expect(d.record).not.toHaveBeenCalled();
    expect(d.recordAnomaly).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: "pi_9",
        amount: 450,
        reason: "missing_invoice_metadata",
      })
    );
    expect(d.markProcessed).toHaveBeenCalled();
  });

  it("does NOT record an anomaly for an unpaid session with missing metadata (no money moved)", async () => {
    const d = deps();
    await handleStripeEvent(
      recordableEvent({
        data: {
          object: {
            payment_intent: "pi_10",
            payment_status: "unpaid",
            metadata: {},
            amount_total: 45000,
          },
        },
      }),
      d
    );
    expect(d.record).not.toHaveBeenCalled();
    expect(d.recordAnomaly).not.toHaveBeenCalled();
    expect(d.markProcessed).toHaveBeenCalled();
  });

  // ── Async (bank-debit) payment lifecycle ────────────────────────────────────

  it("does NOT record an unpaid completed session (async debit in flight)", async () => {
    // ACH: checkout.session.completed fires with payment_status "unpaid" days
    // before funds settle. Recording it would mark the invoice paid on money
    // that doesn't exist yet (and might bounce).
    const d = deps();
    await handleStripeEvent(
      recordableEvent({
        data: {
          object: {
            payment_intent: "pi_1",
            payment_status: "unpaid",
            metadata: { invoiceId: "77", orgId: "org_1" },
            amount_total: 45000,
          },
        },
      }),
      d
    );
    expect(d.record).not.toHaveBeenCalled();
    // Terminal for THIS event — settlement arrives as a different event id.
    expect(d.markProcessed).toHaveBeenCalled();
  });

  it("records settlement via checkout.session.async_payment_succeeded", async () => {
    const d = deps();
    await handleStripeEvent(
      recordableEvent({ type: "checkout.session.async_payment_succeeded" }),
      d
    );
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 77, orgId: "org_1", amount: 450 })
    );
  });

  it("records a payment_intent.succeeded (no payment_status field on a PI)", async () => {
    const d = deps();
    await handleStripeEvent(
      recordableEvent({
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_1",
            metadata: { invoiceId: "77" },
            amount: 45000,
          },
        },
      }),
      d
    );
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_1", amount: 450 })
    );
  });

  it("audit-trails async_payment_failed without touching the ledger", async () => {
    const d = deps();
    await handleStripeEvent(
      recordableEvent({
        type: "checkout.session.async_payment_failed",
        data: {
          object: {
            payment_intent: "pi_1",
            payment_status: "unpaid",
            metadata: { invoiceId: "77", orgId: "org_1" },
            amount_total: 45000,
          },
        },
      }),
      d
    );
    expect(d.record).not.toHaveBeenCalled();
    expect(d.recordFailure).toHaveBeenCalledWith({
      orgId: "org_1",
      invoiceId: 77,
      amount: 450,
      paymentIntentId: "pi_1",
    });
    expect(d.markProcessed).toHaveBeenCalled();
  });

  it("skips async_payment_failed when event.account resolves to no org", async () => {
    const d = deps();
    d.orgIdForAccount = vi.fn().mockResolvedValue(null);
    await handleStripeEvent(
      recordableEvent({
        type: "checkout.session.async_payment_failed",
        account: "acct_unknown",
      }),
      d
    );
    expect(d.recordFailure).not.toHaveBeenCalled();
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

  // ── Fee/net when the balance transaction lags the charge ────────────────────
  // retrieveCharge already re-read briefly; these cover what happens when the
  // balance transaction is STILL unreadable afterwards.

  const HOUR_S = 60 * 60;
  const nowS = () => Math.floor(Date.now() / 1000);
  const noBalanceTx = { id: "ch_1", balanceFee: null, balanceNet: null };

  it.each([
    ["a fresh", 0],
    ["a 23h-old", 23 * HOUR_S],
  ])("records the payment, then forces a retry, for %s event whose balance transaction is still missing", async (_label, ageS) => {
    const d = deps();
    d.retrieveCharge = vi.fn().mockResolvedValue(noBalanceTx);
    await expect(
      handleStripeEvent(recordableEvent({ created: nowS() - ageS }), d)
    ).rejects.toThrow(/balance transaction/);
    // Money first: the payment is recorded now, with fee/net unknown…
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: "ch_1",
        amount: 450,
        feeAmount: null,
        netAmount: null,
      })
    );
    // …but the event is NOT marked processed → the 500 makes Stripe redeliver.
    expect(d.markProcessed).not.toHaveBeenCalled();
  });

  it("on redelivery with the balance transaction readable, hands fee/net to record (backfill) and marks processed", async () => {
    const d = deps();
    d.retrieveCharge = vi
      .fn()
      .mockResolvedValueOnce(noBalanceTx)
      .mockResolvedValueOnce({
        id: "ch_1",
        balanceFee: 2.06,
        balanceNet: 58.69,
      });
    const ev = recordableEvent({ created: nowS() });

    await expect(handleStripeEvent(ev, d)).rejects.toThrow();
    // Stripe redelivers the same event; the charge is already recorded, so
    // recordStripePayment reports a duplicate (and backfills fee/net).
    d.record.mockResolvedValueOnce({ recorded: false, overpaid: false });
    await handleStripeEvent(ev, d);

    expect(d.record).toHaveBeenCalledTimes(2);
    expect(d.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chargeId: "ch_1",
        feeAmount: 2.06,
        netAmount: 58.69,
      })
    );
    expect(d.markProcessed).toHaveBeenCalledTimes(1);
    expect(d.markProcessed).toHaveBeenCalledWith(
      "evt_1",
      "checkout.session.completed"
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it("stops retrying an event older than 24h: records, logs, marks processed", async () => {
    const d = deps();
    d.retrieveCharge = vi.fn().mockResolvedValue(noBalanceTx);
    await handleStripeEvent(
      recordableEvent({ created: nowS() - 25 * HOUR_S }),
      d
    );
    // The money is still recorded (fee/net stay null)…
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: "ch_1",
        feeAmount: null,
        netAmount: null,
      })
    );
    // …and the event is terminal, so one odd charge can't fail the endpoint
    // for days — but it's logged for a human.
    expect(d.markProcessed).toHaveBeenCalledWith(
      "evt_1",
      "checkout.session.completed"
    );
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        errorMessage: expect.stringContaining("ch_1"),
      })
    );
  });

  it("neither retries nor logs when the balance transaction is readable", async () => {
    const d = deps();
    await handleStripeEvent(recordableEvent({ created: nowS() }), d);
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({ feeAmount: 1.43, netAmount: 448.57 })
    );
    expect(d.markProcessed).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });
});
