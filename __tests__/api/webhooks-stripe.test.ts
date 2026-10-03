/**
 * Tests for POST /api/webhooks/stripe.
 * This route is a bare POST export (not wrapped in apiRoute/publicRoute), so
 * it gets none of wrapHandler's automatic logError calls — the outer catch
 * has to log explicitly or a handler failure (including the deliberate
 * "charge not yet attached" retry throw in lib/stripe/webhook.ts) leaves zero
 * application-side trace. See GitHub issue #309.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest } from "./_helpers";

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    processedStripeEvent: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/repositories/invoiceRepo", () => ({
  recordStripePayment: vi.fn(),
  recordStripePaymentFailure: vi.fn(),
  recordStripeAnomaly: vi.fn(),
}));

vi.mock("@/lib/repositories/organizationRepo", () => ({
  getOrgIdByConnectAccount: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: vi.fn(),
}));

// Zero back-off so the balance-transaction re-read runs without real sleeps
// (the delays themselves are covered in __tests__/lib/stripe/chargeFees.test.ts).
vi.mock("@/lib/stripe/chargeFees", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/stripe/chargeFees")>();
  return {
    ...mod,
    retryForBalance: (
      first: Parameters<typeof mod.retryForBalance>[0],
      reread: Parameters<typeof mod.retryForBalance>[1]
    ) =>
      mod.retryForBalance(
        first,
        reread,
        mod.BALANCE_TX_RETRY_DELAYS_MS.map(() => 0)
      ),
  };
});

vi.mock("@/lib/stripe/webhook", () => ({
  constructStripeEvent: vi.fn(),
  handleStripeEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "stripe-signature": "sig_test" })),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { logError } from "@/lib/logger";
import { getStripe } from "@/lib/stripe/client";
import { constructStripeEvent, handleStripeEvent } from "@/lib/stripe/webhook";

const mockLogError = vi.mocked(logError);
const mockConstructStripeEvent = vi.mocked(constructStripeEvent);
const mockHandleStripeEvent = vi.mocked(handleStripeEvent);

const EVENT = {
  id: "evt_test_123",
  type: "checkout.session.completed",
};

function postRequest() {
  return makeRequest("POST", "http://localhost/api/webhooks/stripe", "{}");
}

describe("POST /api/webhooks/stripe", () => {
  const prevSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockConstructStripeEvent.mockReturnValue(EVENT as never);
  });

  afterAll(() => {
    if (prevSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevSecret;
  });

  it("returns 200 and does not log when the handler succeeds", async () => {
    mockHandleStripeEvent.mockResolvedValueOnce(undefined);

    const res = await POST(postRequest());

    expect(res.status).toBe(200);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("logs a missing webhook secret and fails closed", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(postRequest());
    expect(res.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "Stripe webhook secret is not configured",
      })
    );
    expect(mockConstructStripeEvent).not.toHaveBeenCalled();
    expect(mockHandleStripeEvent).not.toHaveBeenCalled();
  });

  it("logs the event id/type and still returns 500 when the handler throws", async () => {
    // Mirrors the deliberate retry throw in lib/stripe/webhook.ts
    // ("Stripe charge not yet attached; will retry").
    mockHandleStripeEvent.mockRejectedValueOnce(
      new Error("Stripe charge not yet attached; will retry")
    );

    const res = await POST(postRequest());

    // Behavior is unchanged: Stripe still sees a 500 and retries.
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("handler error");

    // But now it's logged server-side, with enough context to find the event.
    expect(mockLogError).toHaveBeenCalledTimes(1);
    const call = mockLogError.mock.calls[0]?.[0];
    expect(call?.path).toBe("api/webhooks/stripe");
    expect(call?.errorMessage).toContain(EVENT.id);
    expect(call?.errorMessage).toContain(EVENT.type);
    expect(call?.err).toBeInstanceOf(Error);
  });

  it("wires retrieveCharge to re-read until the charge's lagging balance transaction is readable", async () => {
    mockHandleStripeEvent.mockResolvedValueOnce(undefined);
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({
        latest_charge: { id: "ch_1", balance_transaction: null },
      })
      .mockResolvedValueOnce({
        latest_charge: {
          id: "ch_1",
          balance_transaction: { fee: 206, net: 5869 },
        },
      });
    vi.mocked(getStripe).mockReturnValueOnce({
      paymentIntents: { retrieve },
    } as never);

    await POST(postRequest());
    const deps = mockHandleStripeEvent.mock.calls[0]?.[1];
    const charge = await deps?.retrieveCharge("acct_1", "pi_1");

    expect(charge).toEqual({ id: "ch_1", balanceFee: 2.06, balanceNet: 58.69 });
    expect(retrieve).toHaveBeenCalledTimes(2);
    // Direct charge: read on the connected account, BT expanded.
    expect(retrieve).toHaveBeenCalledWith(
      "pi_1",
      { expand: ["latest_charge.balance_transaction"] },
      { stripeAccount: "acct_1" }
    );
  });

  it("returns 400 without logging when the signature is invalid", async () => {
    mockConstructStripeEvent.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });

    const res = await POST(postRequest());

    expect(res.status).toBe(400);
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
