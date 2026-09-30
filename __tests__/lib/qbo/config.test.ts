import { afterEach, describe, expect, it, vi } from "vitest";
import { getQboConfig } from "@/lib/qbo/config";

afterEach(() => vi.unstubAllEnvs());
describe("QBO endpoint safety", () => {
  it("rejects unknown environments instead of silently using sandbox", () => {
    vi.stubEnv("QBO_CLIENT_ID", "test");
    vi.stubEnv("QBO_CLIENT_SECRET", "test");
    vi.stubEnv("QBO_ENVIRONMENT", "prodution");
    expect(getQboConfig).toThrow("Invalid QBO_ENVIRONMENT");
  });
  it("refuses the mock realm in production", () => {
    vi.stubEnv("QBO_CLIENT_ID", "test");
    vi.stubEnv("QBO_CLIENT_SECRET", "test");
    vi.stubEnv("QBO_ENVIRONMENT", "mock");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getQboConfig).toThrow("not allowed in production");
  });
});
