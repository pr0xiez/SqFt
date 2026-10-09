/** Tier C: POST /api/invoices/[id]/void. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories", () => ({ voidInvoice: vi.fn() }));

vi.mock("@/lib/qbo/runner", () => ({
  runQboSyncForOrg: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { POST } from "@/app/api/invoices/[id]/void/route";
import { auth } from "@/lib/auth";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import { voidInvoice } from "@/lib/repositories";
import { makeRequest, params } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockVoid = vi.mocked(voidInvoice);

function asRole(role: string) {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role } } as any
  );
}

describe("POST /api/invoices/[id]/void", () => {
  it("403s for crew without voiding", async () => {
    asRole("crew");
    const res = await POST(makeRequest("POST"), params({ id: "5" }));
    expect(res.status).toBe(403);
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it("404s NOT_FOUND when the invoice is missing or outside the org", async () => {
    asRole("lead");
    mockVoid.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST"), params({ id: "999" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockVoid).toHaveBeenCalledWith(999, "org1");
    expect(vi.mocked(runQboSyncForOrg)).not.toHaveBeenCalled();
  });

  it("returns the voided invoice and kicks a QBO sync for a lead", async () => {
    asRole("lead");
    // biome-ignore lint/suspicious/noExplicitAny: partial row stub
    mockVoid.mockResolvedValueOnce({ id: 5, status: "void" } as any);
    const res = await POST(makeRequest("POST"), params({ id: "5" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 5, status: "void" });
    expect(mockVoid).toHaveBeenCalledWith(5, "org1");
    expect(vi.mocked(runQboSyncForOrg)).toHaveBeenCalledWith("org1");
  });
});
