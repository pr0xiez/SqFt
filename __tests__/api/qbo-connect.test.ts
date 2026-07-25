/**
 * Tier C: POST /api/qbo/connect + GET /api/qbo/status. Session-mocking
 * pattern mirrors org-stripe-connect.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories/qboRepo", () => ({
  getQboConnection: vi.fn(),
  getQboSyncHealth: vi.fn(),
}));

vi.mock("@/lib/qbo/runner", () => ({
  runQboSyncForOrg: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { POST as connectPost } from "@/app/api/qbo/connect/route";
import { GET as statusGet } from "@/app/api/qbo/status/route";
import { auth } from "@/lib/auth";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import { getQboConnection, getQboSyncHealth } from "@/lib/repositories/qboRepo";
import { makeRequest, noParams } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockGetConnection = vi.mocked(getQboConnection);
const mockGetHealth = vi.mocked(getQboSyncHealth);

function asRole(role: string) {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role } } as any
  );
}

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
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (prevEnv[key] === undefined) delete process.env[key];
    else process.env[key] = prevEnv[key];
  }
});

describe("POST /api/qbo/connect", () => {
  it("401s without a session and for non-admin roles", async () => {
    mockAuth.mockResolvedValueOnce(null);
    expect((await connectPost(makeRequest("POST"), noParams)).status).toBe(401);
    asRole("lead");
    expect((await connectPost(makeRequest("POST"), noParams)).status).toBe(401);
  });

  it("404s when QBO env is not configured", async () => {
    asRole("admin");
    delete process.env.QBO_CLIENT_ID;
    const res = await connectPost(makeRequest("POST"), noParams);
    expect(res.status).toBe(404);
  });

  it("returns the Intuit authorize URL with signed state + our callback", async () => {
    asRole("admin");
    const res = await connectPost(makeRequest("POST"), noParams);
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://appcenter.intuit.com/connect/oauth2"
    );
    expect(parsed.searchParams.get("client_id")).toBe("cid");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.test/api/qbo/callback"
    );
    expect(parsed.searchParams.get("state")).toContain("org1.");
  });
});

describe("GET /api/qbo/status", () => {
  it("reports unconfigured without touching the DB", async () => {
    asRole("admin");
    delete process.env.QBO_CLIENT_ID;
    const res = await statusGet(makeRequest("GET"), noParams);
    expect(await res.json()).toEqual({
      configured: false,
      connection: null,
      health: null,
    });
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it("returns connection + health and sweeps opportunistically", async () => {
    asRole("admin");
    mockGetConnection.mockResolvedValueOnce({
      status: "active",
      companyName: "Mock Flooring Co",
      realmId: "mock-realm-1",
      connectedAt: new Date("2026-07-01T00:00:00Z"),
      lastSyncedAt: new Date("2026-07-20T00:00:00Z"),
      // biome-ignore lint/suspicious/noExplicitAny: partial row stub
    } as any);
    mockGetHealth.mockResolvedValueOnce({
      pending: 1,
      failed: 2,
      done: 3,
      pausedAuth: 0,
      lastSyncedAt: null,
      recentErrors: [],
    });
    const res = await statusGet(makeRequest("GET"), noParams);
    const body = (await res.json()) as {
      connection: { companyName: string };
      health: { failed: number };
    };
    expect(body.connection.companyName).toBe("Mock Flooring Co");
    expect(body.health.failed).toBe(2);
    expect(vi.mocked(runQboSyncForOrg)).toHaveBeenCalledWith("org1");
  });

  it("returns null connection when the org never connected", async () => {
    asRole("admin");
    mockGetConnection.mockResolvedValueOnce(null);
    const res = await statusGet(makeRequest("GET"), noParams);
    const body = (await res.json()) as { connection: null };
    expect(body.connection).toBeNull();
    expect(vi.mocked(runQboSyncForOrg)).not.toHaveBeenCalled();
  });
});
