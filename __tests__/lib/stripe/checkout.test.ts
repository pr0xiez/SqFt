import { describe, expect, it } from "vitest";
import { buildCheckoutParams } from "@/lib/stripe/checkout";

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
