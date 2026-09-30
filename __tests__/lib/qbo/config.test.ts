import { afterEach, describe, expect, it, vi } from "vitest";
import { getQboConfig, mockProtectionHeaders } from "@/lib/qbo/config";

afterEach(() => vi.unstubAllEnvs());
describe("QBO endpoint safety", () => {
  it("adds preview protection credentials only to same-origin mock requests", () => {
    vi.stubEnv("QBO_ENVIRONMENT", "mock");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("PUBLIC_BASE_URL", "https://review.example");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-bypass");
    expect(
      mockProtectionHeaders("https://review.example/api/qbo-mock/token")
    ).toEqual({ "x-vercel-protection-bypass": "test-bypass" });
    for (const url of [
      "https://oauth.platform.intuit.com/api/qbo-mock/token",
      "https://review.example/api/qbo-mock-evil/token",
      "https://review.example/api/qbo/callback",
    ])
      expect(mockProtectionHeaders(url)).toEqual({});
    vi.stubEnv("QBO_ENVIRONMENT", "sandbox");
    expect(
      mockProtectionHeaders("https://review.example/api/qbo-mock/token")
    ).toEqual({});
    vi.stubEnv("QBO_ENVIRONMENT", "mock");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(
      mockProtectionHeaders("https://review.example/api/qbo-mock/token")
    ).toEqual({});
  });
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
