import { afterEach, describe, expect, it } from "vitest";
import { isStripeConfigured, stripeMode } from "@/lib/stripe/client";

describe("stripe client mode detection", () => {
  const original = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  });

  it("reports test mode for an rk_test_ key", () => {
    process.env.STRIPE_SECRET_KEY = "rk_test_abc123";
    expect(stripeMode()).toBe("test");
    expect(isStripeConfigured()).toBe(true);
  });

  it("reports live mode for an rk_live_ key", () => {
    process.env.STRIPE_SECRET_KEY = "rk_live_abc123";
    expect(stripeMode()).toBe("live");
  });

  it("reports unconfigured when the key is absent", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeMode()).toBe("unconfigured");
    expect(isStripeConfigured()).toBe(false);
  });
});
