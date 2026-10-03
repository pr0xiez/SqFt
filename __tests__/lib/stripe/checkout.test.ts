import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  buildCheckoutParams,
  describeStripeError,
  EXCLUDED_PAYMENT_METHOD_TYPES,
  isStripeError,
} from "@/lib/stripe/checkout";

describe("buildCheckoutParams", () => {
  const base = {
    invoiceNumber: 1012,
    balanceDueCents: 45000,
    orgId: "org_1",
    invoiceId: 77,
    successUrl: "https://app/inv/tok?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://app/inv/tok",
    expiresAt: 1_800_000_000,
  };

  it("creates a single line item for the exact balance, no platform fee", () => {
    const p = buildCheckoutParams(base);
    expect(p.mode).toBe("payment");
    expect(p.line_items).toHaveLength(1);
    expect(p.line_items?.[0]?.price_data?.unit_amount).toBe(45000);
    expect(p.line_items?.[0]?.quantity).toBe(1);
    // No application fee — SqFt takes nothing.
    expect(p.payment_intent_data?.application_fee_amount).toBeUndefined();
    // never set payment_method_types (best-practice rule)
    expect("payment_method_types" in p).toBe(false);
  });

  it("limits Checkout to card + ACH by excluding everything else — never via payment_method_types", () => {
    // Checkout otherwise offers whatever the connected account switched on in
    // its own Dashboard (QA saw Cash App Pay, Klarna, Affirm, Amazon Pay, Zip).
    // payment_method_types would switch dynamic payment methods off entirely.
    const p = buildCheckoutParams(base);
    expect(p.excluded_payment_method_types).toEqual([
      ...EXCLUDED_PAYMENT_METHOD_TYPES,
    ]);
    expect("payment_method_types" in p).toBe(false);
    // A copy, so a caller mutating the params can't edit the shared constant.
    expect(p.excluded_payment_method_types).not.toBe(
      EXCLUDED_PAYMENT_METHOD_TYPES
    );
  });

  it("caps the stale-session window with the caller's expires_at", () => {
    // Without expires_at a session stays completable for 24h, so a stale tab can
    // double-collect after the balance changes. The route passes a bucket-aligned
    // timestamp; buildCheckoutParams must forward it verbatim.
    const p = buildCheckoutParams(base);
    expect(p.expires_at).toBe(1_800_000_000);
  });

  it("carries invoice/org ids in metadata for the webhook", () => {
    const p = buildCheckoutParams(base);
    expect(p.metadata?.invoiceId).toBe("77");
    expect(p.metadata?.orgId).toBe("org_1");
    expect(p.payment_intent_data?.metadata?.invoiceId).toBe("77");
  });
});

describe("EXCLUDED_PAYMENT_METHOD_TYPES", () => {
  it("never excludes the methods SqFt takes: card (incl. wallets) and ACH debit", () => {
    expect(EXCLUDED_PAYMENT_METHOD_TYPES).not.toContain("card");
    expect(EXCLUDED_PAYMENT_METHOD_TYPES).not.toContain("us_bank_account");
  });

  it("excludes every BNPL / wallet Checkout surfaced in QA", () => {
    expect(EXCLUDED_PAYMENT_METHOD_TYPES).toEqual(
      expect.arrayContaining([
        "affirm",
        "afterpay_clearpay",
        "amazon_pay",
        "cashapp",
        "klarna",
        "zip",
      ])
    );
  });

  it("lists each method once", () => {
    expect(new Set(EXCLUDED_PAYMENT_METHOD_TYPES).size).toBe(
      EXCLUDED_PAYMENT_METHOD_TYPES.length
    );
  });
});

describe("isStripeError", () => {
  it("recognizes anything the Stripe SDK throws", () => {
    expect(isStripeError(new Stripe.errors.StripePermissionError())).toBe(true);
    expect(isStripeError(new Stripe.errors.StripeConnectionError())).toBe(true);
    expect(isStripeError(new Stripe.errors.StripeAPIError())).toBe(true);
  });

  it("rejects errors that didn't come from Stripe", () => {
    expect(isStripeError(new Error("boom"))).toBe(false);
    expect(isStripeError({ type: "StripeAPIError", message: "fake" })).toBe(
      false
    );
    expect(isStripeError(undefined)).toBe(false);
  });
});

describe("describeStripeError", () => {
  it("summarizes class, code, status, request id and param with Stripe's message", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      message: "Invalid excluded_payment_method_types[0]: must be one of card",
      code: "parameter_invalid_enum",
      statusCode: 400,
      requestId: "req_abc123",
      param: "excluded_payment_method_types[0]",
      headers: { "request-id": "req_abc123", "stripe-account": "acct_1" },
    });
    expect(describeStripeError(err)).toBe(
      "StripeInvalidRequestError code=parameter_invalid_enum status=400 requestId=req_abc123 param=excluded_payment_method_types[0]: Invalid excluded_payment_method_types[0]: must be one of card"
    );
  });

  it("names the network cause of a connection error and skips absent fields", () => {
    const err = new Stripe.errors.StripeConnectionError({
      message: "An error occurred with our connection to Stripe.",
      detail: new Error("getaddrinfo ENOTFOUND api.stripe.com"),
    });
    expect(describeStripeError(err)).toBe(
      "StripeConnectionError cause=getaddrinfo ENOTFOUND api.stripe.com: An error occurred with our connection to Stripe."
    );
  });
});
