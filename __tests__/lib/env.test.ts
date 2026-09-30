import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "@/lib/env";

afterEach(() => vi.unstubAllEnvs());

describe("server environment", () => {
  it("tolerates empty optional configuration and retains email defaults", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@localhost/unused");
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "GEOAPIFY_API_KEY",
      "PUBLIC_BASE_URL",
      "EMAIL_FROM",
    ])
      vi.stubEnv(key, " ");
    const env = getEnv();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.STRIPE_WEBHOOK_SECRET).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.GEOAPIFY_API_KEY).toBeUndefined();
    expect(env.PUBLIC_BASE_URL).toBeUndefined();
    expect(env.EMAIL_FROM).toBe("SqFt Estimates <estimates@sqft.dev>");
  });

  it("still rejects a missing required database without exposing configuration values", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "private-test-value");
    expect(getEnv).toThrow("DATABASE_URL is required");
    expect(getEnv).not.toThrow("private-test-value");
  });

  it("reads configuration again after a value changes", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@localhost/unused");
    vi.stubEnv("PUBLIC_BASE_URL", "https://one.example");
    expect(getEnv().PUBLIC_BASE_URL).toBe("https://one.example");
    vi.stubEnv("PUBLIC_BASE_URL", "https://two.example");
    expect(getEnv().PUBLIC_BASE_URL).toBe("https://two.example");
  });
});
