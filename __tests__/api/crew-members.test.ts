import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listCrewMembers: vi.fn(),
  createCrewMember: vi.fn(),
  updateCrewMember: vi.fn(),
  deleteCrewMember: vi.fn(),
  CrewMemberInUseError: class CrewMemberInUseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CrewMemberInUseError";
    }
  },
}));

vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

const {
  listCrewMembers,
  createCrewMember,
  updateCrewMember,
  deleteCrewMember,
  CrewMemberInUseError,
} = await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET, POST } = await import("@/app/api/crew-members/route");
const { PATCH, DELETE } = await import("@/app/api/crew-members/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockList = vi.mocked(listCrewMembers);
const mockCreate = vi.mocked(createCrewMember);
const mockUpdate = vi.mocked(updateCrewMember);
const mockDelete = vi.mocked(deleteCrewMember);

const ORG = "org1";

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrgId.mockResolvedValue(ORG);
});

describe("GET /api/crew-members", () => {
  it("returns active members by default", async () => {
    mockList.mockResolvedValue([
      {
        id: 1,
        orgId: ORG,
        name: "Carlos",
        role: "",
        archived: false,
        createdAt: new Date(),
        _count: { events: 3 },
        // biome-ignore lint/suspicious/noExplicitAny: test stub
      } as any,
    ]);
    const req = new NextRequest("http://x/api/crew-members");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(ORG, { includeArchived: false });
  });

  it("respects ?includeArchived=1", async () => {
    mockList.mockResolvedValue([]);
    const req = new NextRequest("http://x/api/crew-members?includeArchived=1");
    await GET(req);
    expect(mockList).toHaveBeenCalledWith(ORG, { includeArchived: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    const req = new NextRequest("http://x/api/crew-members");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/crew-members", () => {
  it("creates and returns 201", async () => {
    mockCreate.mockResolvedValue({
      id: 9,
      orgId: ORG,
      name: "Pat",
      role: "Helper",
      archived: false,
      createdAt: new Date(),
      // biome-ignore lint/suspicious/noExplicitAny: test stub
    } as any);
    const req = jsonReq("http://x/api/crew-members", {
      name: "Pat",
      role: "Helper",
    });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(ORG, {
      name: "Pat",
      role: "Helper",
    });
  });

  it("rejects empty name with 400", async () => {
    const req = jsonReq("http://x/api/crew-members", { name: "" });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/crew-members/[id]", () => {
  it("updates and returns the row", async () => {
    mockUpdate.mockResolvedValue({
      id: 5,
      orgId: ORG,
      name: "Mike",
      role: "Owner",
      archived: false,
      createdAt: new Date(),
      // biome-ignore lint/suspicious/noExplicitAny: test stub
    } as any);
    const req = jsonReq(
      "http://x/api/crew-members/5",
      { archived: true },
      "PATCH"
    );
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(5, ORG, { archived: true });
  });

  it("returns 404 when row missing for org", async () => {
    mockUpdate.mockResolvedValue(null);
    const req = jsonReq(
      "http://x/api/crew-members/999",
      { name: "X" },
      "PATCH"
    );
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("999")
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/crew-members/[id]", () => {
  it("returns 200 on successful hard delete", async () => {
    mockDelete.mockResolvedValue({ ok: true });
    const req = new Request("http://x/api/crew-members/5", {
      method: "DELETE",
    });
    const res = await DELETE(
      req as Parameters<typeof DELETE>[0],
      makeParams("5")
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    mockDelete.mockResolvedValue({ ok: false, reason: "not-found" });
    const req = new Request("http://x/api/crew-members/999", {
      method: "DELETE",
    });
    const res = await DELETE(
      req as Parameters<typeof DELETE>[0],
      makeParams("999")
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when crew member is in use", async () => {
    mockDelete.mockRejectedValue(new CrewMemberInUseError("in use"));
    const req = new Request("http://x/api/crew-members/5", {
      method: "DELETE",
    });
    const res = await DELETE(
      req as Parameters<typeof DELETE>[0],
      makeParams("5")
    );
    expect(res.status).toBe(409);
  });
});
