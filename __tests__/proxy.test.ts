import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `auth()` from next-auth wraps a callback into a middleware function. We
// don't need real session verification here — only that proxy.ts's
// console.log line (evaluated before the public-review allowlist check)
// never leaks a raw token. Mocking `auth` to the identity function exposes
// the inner callback directly as the module's default export.
vi.mock("@/lib/auth", () => ({
  auth: (fn: unknown) => fn,
}));

function captureOutput() {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((chunk) => {
    lines.push(String(chunk));
  });
  return lines;
}

function makeReq(pathname: string, method = "GET") {
  return {
    nextUrl: { pathname },
    method,
    auth: null,
    url: `http://localhost${pathname}`,
    // biome-ignore lint/suspicious/noExplicitAny: test stub request
  } as any;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proxy.ts request logging", () => {
  it("redacts the token segment for an estimate-review approve path", async () => {
    const lines = captureOutput();
    const { default: middleware } = await import("../proxy");

    // biome-ignore lint/suspicious/noExplicitAny: middleware typed via auth() wrapper
    (middleware as any)(
      makeReq("/api/estimate-review/SUPER_SECRET_TOKEN/approve", "POST")
    );

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe("proxy_request");
    expect(entry.path).toBe("/api/estimate-review/[REDACTED]/approve");
    expect(JSON.stringify(entry)).not.toContain("SUPER_SECRET_TOKEN");
  });

  it("redacts the token segment for an invoice-review checkout path", async () => {
    const lines = captureOutput();
    const { default: middleware } = await import("../proxy");

    // biome-ignore lint/suspicious/noExplicitAny: middleware typed via auth() wrapper
    (middleware as any)(
      makeReq("/api/invoice-review/ANOTHER_SECRET_TOKEN/checkout", "POST")
    );

    const entry = JSON.parse(lines[0]);
    expect(entry.path).toBe("/api/invoice-review/[REDACTED]/checkout");
    expect(JSON.stringify(entry)).not.toContain("ANOTHER_SECRET_TOKEN");
  });

  it("leaves a non-review API path completely unchanged", async () => {
    const lines = captureOutput();
    const { default: middleware } = await import("../proxy");

    // biome-ignore lint/suspicious/noExplicitAny: middleware typed via auth() wrapper
    (middleware as any)(makeReq("/api/estimates/5", "GET"));

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.path).toBe("/api/estimates/5");
  });

  it("does not log at all for non-API paths", async () => {
    const lines = captureOutput();
    const { default: middleware } = await import("../proxy");

    // biome-ignore lint/suspicious/noExplicitAny: middleware typed via auth() wrapper
    (middleware as any)(makeReq("/estimate-review/SOME_TOKEN", "GET"));

    expect(lines).toHaveLength(0);
  });
});
