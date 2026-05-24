import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { adminRoute } from "@/lib/api/route";
import { auth } from "@/lib/auth";

// vi.mocked(auth) resolves to the NextMiddleware overload; cast to the session overload
const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function makeRequest(method = "GET", url = "http://localhost/api/x") {
  const req = new Request(url, { method });
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}
const noParams = { params: Promise.resolve({}) };

describe("adminRoute", () => {
  it("returns 401 UNAUTHORIZED when there is no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const handler = adminRoute(async () => ({ ok: true }));
    const res = await handler(makeRequest(), noParams);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("returns 401 UNAUTHORIZED when role is not admin", async () => {
    mockAuth.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { orgId: "org1", role: "crew" } } as any
    );
    const handler = adminRoute(async () => ({ ok: true }));
    const res = await handler(makeRequest(), noParams);
    expect(res.status).toBe(401);
  });

  it("invokes the handler with orgId when role is admin", async () => {
    mockAuth.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { orgId: "org1", role: "admin" } } as any
    );
    const inner = vi.fn(async () => ({ ok: true }));
    const handler = adminRoute(inner);
    const res = await handler(makeRequest(), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(inner).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org1" })
    );
  });
});
