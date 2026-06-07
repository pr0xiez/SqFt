import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listAssignableUsers: vi.fn(),
}));

const stubSession = { user: { id: "u1", orgId: "org1", role: "lead" } };

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  requireSession: vi.fn().mockResolvedValue(stubSession as any),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const { listAssignableUsers } = await import("@/lib/repositories");
const { GET } = await import("@/app/api/users/assignable/route");
const mockList = vi.mocked(listAssignableUsers);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/users/assignable", () => {
  it("returns the org's assignable users", async () => {
    mockList.mockResolvedValue([{ id: "u2", name: "Cody", title: null }]);
    const res = await GET(
      makeRequest("GET", "http://x/api/users/assignable"),
      params({})
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("org1");
    expect(await res.json()).toEqual([{ id: "u2", name: "Cody", title: null }]);
  });
});
