import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrewMemberInUseError } from "@/lib/api/errors";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listCrewMembers: vi.fn(),
  createCrewMember: vi.fn(),
  updateCrewMember: vi.fn(),
  deleteCrewMember: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockResolvedValue("org1"),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const {
  listCrewMembers,
  createCrewMember,
  updateCrewMember,
  deleteCrewMember,
} = await import("@/lib/repositories");
const { GET, POST } = await import("@/app/api/crew-members/route");
const { PATCH, DELETE } = await import("@/app/api/crew-members/[id]/route");

const mockList = vi.mocked(listCrewMembers);
const mockCreate = vi.mocked(createCrewMember);
const mockUpdate = vi.mocked(updateCrewMember);
const mockDelete = vi.mocked(deleteCrewMember);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/crew-members", () => {
  it("calls listCrewMembers with includeArchived=false by default", async () => {
    mockList.mockResolvedValue([]);
    await GET(makeRequest("GET", "http://x/api/crew-members"), params({}));
    expect(mockList).toHaveBeenCalledWith("org1", { includeArchived: false });
  });

  it("respects ?includeArchived=1", async () => {
    mockList.mockResolvedValue([]);
    await GET(
      makeRequest("GET", "http://x/api/crew-members?includeArchived=1"),
      params({})
    );
    expect(mockList).toHaveBeenCalledWith("org1", { includeArchived: true });
  });
});

describe("POST /api/crew-members", () => {
  it("creates and returns 201 with the input forwarded", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 9, name: "Pat", role: "Helper" } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/crew-members", {
        name: "Pat",
        role: "Helper",
      }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith("org1", {
      name: "Pat",
      role: "Helper",
    });
  });
});

describe("PATCH /api/crew-members/[id]", () => {
  it("calls updateCrewMember with parsed id, org, and input", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValue({ id: 5, archived: true } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/crew-members/5", { archived: true }),
      params({ id: "5" })
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(5, "org1", { archived: true });
  });

  it("returns NOT_FOUND when updateCrewMember returns null", async () => {
    mockUpdate.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/crew-members/99", { name: "X" }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("DELETE /api/crew-members/[id]", () => {
  it("returns 204 on successful delete", async () => {
    mockDelete.mockResolvedValue({ ok: true });
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/crew-members/5"),
      params({ id: "5" })
    );
    expect(res.status).toBe(204);
  });

  it("returns NOT_FOUND when the crew member doesn't exist", async () => {
    mockDelete.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/crew-members/99"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });

  it("maps CrewMemberInUseError to a CREW_MEMBER_IN_USE 409", async () => {
    mockDelete.mockRejectedValue(new CrewMemberInUseError("in use"));
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/crew-members/5"),
      params({ id: "5" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CREW_MEMBER_IN_USE");
  });
});
