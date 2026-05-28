import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { apiRoute } from "@/lib/api/route";
import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function makeRequest(method = "GET") {
  const req = new Request("http://localhost/api/admin/x", { method });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/admin/x"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

const noParams = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
});

describe("apiRoute({ superAdmin: true })", () => {
  it("401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const handler = apiRoute({ superAdmin: true }, async () => ({ ok: true }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("403 FORBIDDEN when session email is not in the allowlist", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "u1", orgId: "o1", role: "admin", email: "nobody@x.test" },
    } as any);
    const handler = apiRoute({ superAdmin: true }, async () => ({ ok: true }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 when the session user has no email", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "u1", orgId: "o1", role: "admin", email: null },
    } as any);
    const handler = apiRoute({ superAdmin: true }, async () => ({ ok: true }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
  });

  it("200 and runs the handler when email is in the allowlist (case-insensitive)", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "u1", orgId: "o1", role: "admin", email: "BOSS@SQFT.dev" },
    } as any);
    const handler = apiRoute({ superAdmin: true }, async ({ orgId }) => ({
      orgId,
    }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ orgId: "o1" });
  });
});
