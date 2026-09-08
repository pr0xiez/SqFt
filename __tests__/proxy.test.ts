import { describe, expect, it, vi } from "vitest";

// proxy.ts wraps its middleware callback in NextAuth's `auth(...)` higher-order
// function, which normally resolves the session and injects it onto `req.auth`.
// That resolution needs a live NextAuth config (DB adapter, providers, etc.),
// which is out of scope here — see issue #184 for full auth-gate coverage.
// This test is scoped to a single, narrow regression: the shape of the 401
// body the middleware emits for unauthenticated API requests (issue #223).
// So `auth` is mocked to pass the callback straight through unwrapped, and the
// test constructs the callback's `req` argument itself, standing in for what
// NextAuth would normally build (an unauthenticated request has `req.auth`
// set to null).
vi.mock("@/lib/auth", () => ({
  auth: (handler: unknown) => handler,
}));

const { default: proxyMiddleware } = await import("../proxy");

function makeRequest(pathname: string, authed: boolean) {
  const url = `http://localhost${pathname}`;
  const req = new Request(url, { method: "GET" });
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  Object.defineProperty(req, "auth", {
    value: authed ? { user: { id: "u1" } } : null,
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper cast
  return req as any;
}

describe("proxy middleware — unauthenticated API 401 envelope", () => {
  it("returns the standard { error: { code, message } } envelope, not a bare string", async () => {
    const req = makeRequest("/api/customers", false);

    // biome-ignore lint/suspicious/noExplicitAny: proxyMiddleware is the raw callback here (see the @/lib/auth mock above)
    const res = await (proxyMiddleware as any)(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });
});
