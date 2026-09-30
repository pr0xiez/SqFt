import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@ducanh2912/next-pwa", () => ({
  default: () => (config: unknown) => config,
}));

async function configuredHeaders(mode: string, environment: string) {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("VERCEL_ENV", environment);
  vi.resetModules();
  const { default: config } = await import("../next.config");
  if (!config.headers) throw new Error("Security headers missing");
  return config.headers();
}

afterEach(() => vi.unstubAllEnvs());

describe("security headers", () => {
  it("denies framing and avoids sending bearer-token URLs as referrers", async () => {
    const rules = await configuredHeaders("production", "production");
    const global = rules.find((rule) => rule.source === "/:path*");
    if (!global) throw new Error("Global security headers missing");
    const values = Object.fromEntries(
      global.headers.map(({ key, value }) => [key, value])
    );
    expect(values["X-Frame-Options"]).toBe("DENY");
    expect(values["X-Content-Type-Options"]).toBe("nosniff");
    expect(values["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(values["Content-Security-Policy"]).toContain(
      "img-src 'self' blob: data: https:"
    );
    expect(values["Content-Security-Policy"]).not.toContain("vercel.live");
    for (const prefix of ["estimate-review", "invoice-review"]) {
      expect(
        rules.find((rule) => rule.source === `/${prefix}/:path*`)?.headers
      ).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    }
  });

  it("allows the preview toolbar while keeping pages protected from embedding", async () => {
    const rules = await configuredHeaders("production", "preview");
    const csp = rules[0].headers.find(
      ({ key }) => key === "Content-Security-Policy"
    )?.value;
    expect(csp).toContain("https://vercel.live");
    expect(csp).toContain("https://assets.vercel.com");
    expect(csp).toContain("wss://ws-us3.pusher.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("keeps HTTP LAN development usable", async () => {
    const rules = await configuredHeaders("development", "");
    const csp = rules[0].headers.find(
      ({ key }) => key === "Content-Security-Policy"
    )?.value;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(
      rules[0].headers.some(({ key }) => key === "Strict-Transport-Security")
    ).toBe(false);
  });
});
