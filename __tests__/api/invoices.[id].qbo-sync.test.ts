/** Tier C: POST /api/invoices/[id]/qbo-sync (manual Sync now / retry). */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories/qboRepo", () => ({
  getQboConnection: vi.fn(),
  requeueInvoiceSync: vi.fn(),
}));

vi.mock("@/lib/qbo/runner", () => ({
  runQboSyncForOrg: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { POST } from "@/app/api/invoices/[id]/qbo-sync/route";
import { auth } from "@/lib/auth";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import {
  getQboConnection,
  requeueInvoiceSync,
} from "@/lib/repositories/qboRepo";
import { makeRequest, params } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockGetConnection = vi.mocked(getQboConnection);
const mockRequeue = vi.mocked(requeueInvoiceSync);

function asLead() {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role: "lead" } } as any
  );
}

function connection(status: string) {
  // biome-ignore lint/suspicious/noExplicitAny: partial row stub
  return { status } as any;
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } };
  return body.error.code;
}

describe("POST /api/invoices/[id]/qbo-sync", () => {
  it("403s for crew", async () => {
    mockAuth.mockResolvedValue(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "crew" } } as any
    );
    const res = await POST(makeRequest("POST"), params({ id: "5" }));
    expect(res.status).toBe(403);
  });

  it("QBO_NOT_CONNECTED when the org has no connection", async () => {
    asLead();
    mockGetConnection.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST"), params({ id: "5" }));
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("QBO_NOT_CONNECTED");
    expect(mockRequeue).not.toHaveBeenCalled();
  });

  it("QBO_AUTH_EXPIRED when the connection is disconnected", async () => {
    asLead();
    mockGetConnection.mockResolvedValueOnce(connection("disconnected"));
    const res = await POST(makeRequest("POST"), params({ id: "5" }));
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("QBO_AUTH_EXPIRED");
  });

  it("404s for an invoice outside the org", async () => {
    asLead();
    mockGetConnection.mockResolvedValueOnce(connection("active"));
    mockRequeue.mockResolvedValueOnce(false);
    const res = await POST(makeRequest("POST"), params({ id: "999" }));
    expect(res.status).toBe(404);
  });

  it("requeues and kicks an opportunistic sync", async () => {
    asLead();
    mockGetConnection.mockResolvedValueOnce(connection("active"));
    mockRequeue.mockResolvedValueOnce(true);
    const res = await POST(makeRequest("POST"), params({ id: "5" }));
    expect(res.status).toBe(200);
    expect(mockRequeue).toHaveBeenCalledWith("org1", 5);
    expect(vi.mocked(runQboSyncForOrg)).toHaveBeenCalledWith("org1");
  });
});
