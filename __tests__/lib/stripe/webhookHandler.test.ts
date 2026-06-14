import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeGateway } from "@/lib/stripe/fakeGateway";
import {
  handleStripeEvent,
  type StripeWebhookDeps,
} from "@/lib/stripe/webhookHandler";

function deps(over: Partial<StripeWebhookDeps> = {}): StripeWebhookDeps & {
  recorded: unknown[];
  events: unknown[];
  mirrored: unknown[];
} {
  const recorded: unknown[] = [];
  const events: unknown[] = [];
  const mirrored: unknown[] = [];
  return {
    recorded,
    events,
    mirrored,
    gateway: makeFakeGateway(),
    // The deps signature is (invoiceId, orgId, input); fold invoiceId into the
    // captured object so assertions can read it alongside the input fields.
    recordStripePayment: async (invoiceId, _orgId, input) => {
      recorded.push({ invoiceId, ...input });
      return "recorded";
    },
    resolvePaymentContext: async () => ({
      invoiceId: 42,
      orgId: "org1",
      orgConnectAccountId: "acct_org",
    }),
    appendInvoiceEvent: async (a) => {
      events.push(a);
    },
    mirrorAccountStatus: async (a) => {
      mirrored.push(a);
    },
    ...over,
  };
}

function pi(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_1",
    amount: 50000,
    amount_received: 50000,
    latest_charge: { id: "ch_1", payment_method_details: { type: "card" } },
    transfer_data: { destination: "acct_org" },
    metadata: { invoiceId: "42", orgId: "org1" },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("handleStripeEvent", () => {
  it("records a card payment on checkout.session.completed (paid)", async () => {
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: pi() as never } }),
    });
    await handleStripeEvent(
      {
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { payment_status: "paid", payment_intent: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(1);
    expect(d.recorded[0]).toMatchObject({
      invoiceId: 42,
      method: "card",
      amount: 500,
      stripeChargeId: "ch_1",
    });
  });

  it("marks ACH processing (no ledger write) on completed unpaid", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_2",
        type: "checkout.session.completed",
        data: {
          object: {
            payment_status: "unpaid",
            payment_intent: "pi_1",
            metadata: { invoiceId: "42" },
          },
        },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "ach_processing" });
  });

  it("records an ACH payment on async_payment_succeeded", async () => {
    const achPi = pi({
      latest_charge: {
        id: "ch_2",
        payment_method_details: { type: "us_bank_account" },
      },
    });
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: achPi as never } }),
    });
    await handleStripeEvent(
      {
        id: "evt_3",
        type: "checkout.session.async_payment_succeeded",
        data: { object: { payment_intent: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded[0]).toMatchObject({
      method: "ach",
      stripeChargeId: "ch_2",
    });
  });

  it("logs ach_failed on async_payment_failed and records nothing", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_4",
        type: "checkout.session.async_payment_failed",
        data: {
          object: { payment_intent: "pi_1", metadata: { invoiceId: "42" } },
        },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "ach_failed" });
  });

  it("mirrors account status on account.updated", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_5",
        type: "account.updated",
        data: { object: { id: "acct_org", charges_enabled: true } },
      } as never,
      d
    );
    expect(d.mirrored).toHaveLength(1);
  });

  it("skips recording on an org/destination mismatch", async () => {
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: pi() as never } }),
      resolvePaymentContext: async () => ({
        invoiceId: 42,
        orgId: "org1",
        orgConnectAccountId: "acct_DIFFERENT",
      }),
    });
    await handleStripeEvent(
      {
        id: "evt_6",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "stripe_org_mismatch" });
  });

  it("rejects a settled charge when the invoice's org has no connected account", async () => {
    // A PaymentIntent carrying a real-looking destination must NOT be recorded
    // onto an invoice whose org never onboarded (orgConnectAccountId === null):
    // any present destination that doesn't equal the org's account is a mismatch.
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: pi() as never } }),
      resolvePaymentContext: async () => ({
        invoiceId: 42,
        orgId: "org1",
        orgConnectAccountId: null,
      }),
    });
    await handleStripeEvent(
      {
        id: "evt_8",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "stripe_org_mismatch" });
  });

  it("ignores unrelated events without throwing", async () => {
    const d = deps();
    await expect(
      handleStripeEvent(
        {
          id: "evt_7",
          type: "customer.created",
          data: { object: {} },
        } as never,
        d
      )
    ).resolves.toBeUndefined();
    expect(d.recorded).toHaveLength(0);
  });
});
