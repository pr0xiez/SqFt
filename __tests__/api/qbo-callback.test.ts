/** Tier C: the OAuth callback — state binding + failure redirects. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories/qboRepo", () => ({
  upsertQboConnection: vi.fn(),
}));

vi.mock("@/lib/qbo/connect", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/qbo/connect")>();
  return { ...mod, exchangeAuthCode: vi.fn() };
});

vi.mock("@/lib/qbo/client", () => ({ qboFetch: vi.fn() }));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { GET } from "@/app/api/qbo/callback/route";
import { auth } from "@/lib/auth";
import { qboFetch } from "@/lib/qbo/client";
import { exchangeAuthCode, signState } from "@/lib/qbo/connect";
import { upsertQboConnection } from "@/lib/repositories/qboRepo";
import { makeRequest, noParams } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockExchange = vi.mocked(exchangeAuthCode);
const mockUpsert = vi.mocked(upsertQboConnection);
const mockQboFetch = vi.mocked(qboFetch);

const ENV_KEYS = [
  "QBO_CLIENT_ID",
  "QBO_CLIENT_SECRET",
  "QBO_ENVIRONMENT",
  "PUBLIC_BASE_URL",
] as const;
const prevEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) prevEnv[key] = process.env[key];
  process.env.QBO_CLIENT_ID = "cid";
  process.env.QBO_CLIENT_SECRET = "csecret";
  process.env.QBO_ENVIRONMENT = "sandbox";
  process.env.PUBLIC_BASE_URL = "https://app.test";
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role: "admin" } } as any
  );
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (prevEnv[key] === undefined) delete process.env[key];
    else process.env[key] = prevEnv[key];
  }
});

function callbackRequest(query: Record<string, string>) {
  const url = new URL("http://localhost/api/qbo/callback");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return makeRequest("GET", url.toString());
}

function goodQuery(orgId = "org1") {
  return {
    code: "auth-code",
    state: signState(orgId, "csecret"),
    realmId: "realm-9",
  };
}

describe("GET /api/qbo/callback", () => {
  it("connects: exchanges the code, stores the realm, redirects to success", async () => {
    mockExchange.mockResolvedValueOnce({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    mockQboFetch.mockResolvedValueOnce({
      CompanyInfo: { CompanyName: "Mock Flooring Co" },
    });

    const res = await GET(callbackRequest(goodQuery()), noParams);
    expect(res.status).toBeGreaterThanOrEqual(302);
    expect(res.headers.get("location")).toBe(
      "https://app.test/settings/integrations?qbo=connected"
    );
    expect(mockUpsert).toHaveBeenCalledWith({
      orgId: "org1",
      realmId: "realm-9",
      tokens: expect.objectContaining({ refreshToken: "rt" }),
      companyName: "Mock Flooring Co",
    });
    expect(mockExchange).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "sandbox" }),
      "auth-code",
      "https://app.test/api/qbo/callback"
    );
  });

  it("exchanges and returns mock OAuth on the session's deployment origin", async () => {
    process.env.QBO_ENVIRONMENT = "mock";
    mockExchange.mockResolvedValueOnce({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    mockQboFetch.mockResolvedValueOnce({
      CompanyInfo: { CompanyName: "Mock Flooring Co" },
    });
    const url = new URL("https://immutable.test/api/qbo/callback");
    for (const [key, value] of Object.entries(goodQuery()))
      url.searchParams.set(key, value);
    const res = await GET(makeRequest("GET", url.toString()), noParams);
    expect(mockExchange).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "mock" }),
      "auth-code",
      "https://immutable.test/api/qbo/callback"
    );
    expect(res.headers.get("location")).toBe(
      "https://immutable.test/settings/integrations?qbo=connected"
    );
  });

  it("returns mock OAuth errors to the session's origin too", async () => {
    process.env.QBO_ENVIRONMENT = "mock";
    const res = await GET(callbackRequest(goodQuery("org_evil")), noParams);
    expect(res.headers.get("location")).toBe(
      "http://localhost/settings/integrations?qbo=error&reason=bad_state"
    );
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("rejects a state signed for a different org (no connection stored)", async () => {
    const res = await GET(callbackRequest(goodQuery("org_evil")), noParams);
    expect(res.headers.get("location")).toContain("qbo=error");
    expect(res.headers.get("location")).toContain("reason=bad_state");
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("redirects to the error state when the exchange fails", async () => {
    mockExchange.mockRejectedValueOnce(new Error("intuit down"));
    const res = await GET(callbackRequest(goodQuery()), noParams);
    expect(res.headers.get("location")).toContain("reason=exchange_failed");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("names the realm_in_use failure when the company belongs to another org", async () => {
    mockExchange.mockResolvedValueOnce({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    mockQboFetch.mockResolvedValueOnce({
      CompanyInfo: { CompanyName: "Mock Flooring Co" },
    });
    mockUpsert.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed on realmId"), {
        code: "P2002",
      })
    );
    const res = await GET(callbackRequest(goodQuery()), noParams);
    expect(res.headers.get("location")).toContain("reason=realm_in_use");
  });

  it("still connects when the company-name read fails (display-only)", async () => {
    mockExchange.mockResolvedValueOnce({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    mockQboFetch.mockRejectedValueOnce(new Error("companyinfo down"));
    const res = await GET(callbackRequest(goodQuery()), noParams);
    expect(res.headers.get("location")).toContain("qbo=connected");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: null })
    );
  });
});
