/** Tier C: POST /api/estimates/[id]/approval-token (rotate review link). */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/repositories", () => ({ rotateApprovalToken: vi.fn() }));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { POST } from "@/app/api/estimates/[id]/approval-token/route";
import { auth } from "@/lib/auth";
import { rotateApprovalToken } from "@/lib/repositories";
import { makeRequest, params } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockRotate = vi.mocked(rotateApprovalToken);

function asRole(role: string) {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role } } as any
  );
}

describe("POST /api/estimates/[id]/approval-token", () => {
  it("403s for crew without rotating", async () => {
    asRole("crew");
    const res = await POST(makeRequest("POST"), params({ id: "7" }));
    expect(res.status).toBe(403);
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("404s NOT_FOUND when the estimate is missing or outside the org", async () => {
    asRole("lead");
    mockRotate.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST"), params({ id: "999" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockRotate).toHaveBeenCalledWith(999, "org1");
  });

  it("returns { approvalToken } for a lead", async () => {
    asRole("lead");
    mockRotate.mockResolvedValueOnce("new-token");
    const res = await POST(makeRequest("POST"), params({ id: "7" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approvalToken: "new-token" });
    expect(mockRotate).toHaveBeenCalledWith(7, "org1");
  });
});
