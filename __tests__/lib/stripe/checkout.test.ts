import { describe, expect, it } from "vitest";
import { buildCheckoutSessionParams } from "@/lib/stripe/checkout";

const base = {
  invoiceId: 42,
  orgId: "org1",
  connectAccountId: "acct_org",
  amountCents: 740350,
  invoiceNumber: 7465,
  customerEmail: "alex@example.com",
  successUrl: "https://app.test/invoice-review/tok?paid=1",
  cancelUrl: "https://app.test/invoice-review/tok",
};

describe("buildCheckoutSessionParams", () => {
  it("is a one-time payment for the exact balance in cents", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.mode).toBe("payment");
    const item = p.line_items?.[0];
    expect(item?.quantity).toBe(1);
    expect(item?.price_data?.unit_amount).toBe(740350);
    expect(item?.price_data?.currency).toBe("usd");
  });

  it("accepts cards and ACH", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(p.payment_method_options?.us_bank_account?.verification_method).toBe(
      "instant"
    );
  });

  it("routes to the connected account via destination + on_behalf_of", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.payment_intent_data?.transfer_data?.destination).toBe("acct_org");
    expect(p.payment_intent_data?.on_behalf_of).toBe("acct_org");
  });

  it("stamps invoiceId on BOTH the session and the payment_intent metadata", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.metadata?.invoiceId).toBe("42");
    expect(p.payment_intent_data?.metadata?.invoiceId).toBe("42");
  });

  it("passes the customer email and return URLs", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.customer_email).toBe("alex@example.com");
    expect(p.success_url).toBe(base.successUrl);
    expect(p.cancel_url).toBe(base.cancelUrl);
  });
});
