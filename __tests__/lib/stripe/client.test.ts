import { afterEach, describe, expect, it, vi } from "vitest";

describe("getStripeClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when STRIPE_SECRET_KEY is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { getStripeClient } = await import("@/lib/stripe/client");
    expect(getStripeClient()).toBeNull();
  });

  it("returns a singleton when the key is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const { getStripeClient } = await import("@/lib/stripe/client");
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
