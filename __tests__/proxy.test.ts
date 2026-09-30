import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// proxy.ts's default export is `auth(handler)`, where `auth` is NextAuth's
// wrapper: normally it resolves the session, attaches it as `req.auth`, and
// invokes the inner handler. To exercise the inner handler directly (as the
// issue's suggested coverage describes), mock `auth` as an identity function
// so the default export IS the inner handler, and drive it with a synthetic
// request whose `.auth` we control ourselves.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn((handler: unknown) => handler),
}));

// Imported after the mock above so proxy.ts's module-level
// `auth((req) => ...)` resolves through the identity mock.
import proxyHandler from "@/proxy";

type ProxyHandler = (req: NextRequest & { auth: unknown }) => Response;
const handler = proxyHandler as unknown as ProxyHandler;

const fakeSession = {
  user: {
    id: "u1",
    orgId: "org1",
    role: "admin",
    isSuperAdmin: false,
  },
};

function makeRequest(pathname: string, authed: boolean, method = "GET") {
  const url = `http://localhost${pathname}`;
  const req = new Request(url, { method });
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  Object.defineProperty(req, "auth", {
    value: authed ? fakeSession : null,
    writable: false,
  });
  return req as unknown as NextRequest & { auth: unknown };
}

// NextResponse.next() carries this header and a 200 status — no other
// branch in proxy.ts produces it, so it's a reliable passthrough signal.
function expectPassthrough(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("x-middleware-next")).toBe("1");
}

function expectRedirectTo(res: Response, path: string) {
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  const location = res.headers.get("location");
  expect(location).toBe(`http://localhost${path}`);
}

describe("proxy", () => {
  it("passes /api/auth/* through unconditionally, authed or not", () => {
    expectPassthrough(handler(makeRequest("/api/auth/session", false)));
    expectPassthrough(
      handler(makeRequest("/api/auth/callback/credentials", true))
    );
  });

  it("passes public token-authed review paths through even when unauthenticated (delegates to isPublicReviewPath)", () => {
    // These are exactly the prefixes isPublicReviewPath (lib/publicRoutes.ts)
    // allowlists — proving the proxy defers to it rather than re-implementing
    // its own list.
    expectPassthrough(
      handler(makeRequest("/estimate-review/some-token-abc123", false))
    );
    expectPassthrough(
      handler(
        makeRequest("/api/estimate-review/some-token-abc123/approve", false)
      )
    );
    expectPassthrough(
      handler(makeRequest("/invoice-review/some-token-abc123", false))
    );
    expectPassthrough(
      handler(
        makeRequest("/api/invoice-review/some-token-abc123/checkout", false)
      )
    );
    expectPassthrough(handler(makeRequest("/api/webhooks/stripe", false)));
  });

  it("returns 401 JSON (not a redirect) for an unauthenticated API route", async () => {
    const res = handler(makeRequest("/api/estimates", false));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("redirects an unauthenticated page route to /login", () => {
    expectRedirectTo(handler(makeRequest("/customers", false)), "/login");
  });

  it("redirects an authenticated request away from /login to /", () => {
    expectRedirectTo(handler(makeRequest("/login", true)), "/");
  });

  it("passes an authenticated page route through", () => {
    expectPassthrough(handler(makeRequest("/customers", true)));
  });

  it("redirects a logged-out request to a non-allowlisted, public-review-look-alike path", () => {
    // Guards the "missing allowlist entry" gotcha at the proxy level: these
    // paths resemble the public review prefixes but aren't in
    // PUBLIC_REVIEW_PREFIXES (no trailing slash / wrong prefix), so
    // isPublicReviewPath returns false and the proxy must fall back to its
    // normal unauthenticated-page redirect rather than leaking through.
    expectRedirectTo(handler(makeRequest("/invoice-review", false)), "/login");
    expectRedirectTo(
      handler(makeRequest("/estimate-reviewx/some-token", false)),
      "/login"
    );
  });
});
