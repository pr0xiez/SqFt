/**
 * Tier-B route tests for the line-item-template routes: verify each handler
 * wires to the right repo function with the org and parsed input, returns its
 * result, and maps missing rows to the NOT_FOUND envelope. Auth/org scoping is
 * exercised via the mocked @/lib/tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listLineItemTemplates: vi.fn(),
  createLineItemTemplate: vi.fn(),
  updateLineItemTemplate: vi.fn(),
  deleteLineItemTemplate: vi.fn(),
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

const { requireSession } = await import("@/lib/tenant");
const mockRequireSession = vi.mocked(requireSession);

const {
  listLineItemTemplates,
  createLineItemTemplate,
  updateLineItemTemplate,
  deleteLineItemTemplate,
} = await import("@/lib/repositories");
const { GET, POST } = await import("@/app/api/line-item-templates/route");
const { PATCH, DELETE } = await import(
  "@/app/api/line-item-templates/[id]/route"
);

const mockList = vi.mocked(listLineItemTemplates);
const mockCreate = vi.mocked(createLineItemTemplate);
const mockUpdate = vi.mocked(updateLineItemTemplate);
const mockDelete = vi.mocked(deleteLineItemTemplate);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/line-item-templates", () => {
  it("lists active templates for the org, excluding archived by default", async () => {
    const items = [{ id: 1, name: "Tear-out", orgId: "org1" }];
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue(items as any);

    const res = await GET(
      makeRequest("GET", "http://x/api/line-item-templates"),
      params({})
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(items);
    expect(mockList).toHaveBeenCalledWith("org1", { includeArchived: false });
  });

  it("passes includeArchived through when ?includeArchived=1", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue([] as any);

    await GET(
      makeRequest("GET", "http://x/api/line-item-templates?includeArchived=1"),
      params({})
    );

    expect(mockList).toHaveBeenCalledWith("org1", { includeArchived: true });
  });
});

describe("POST /api/line-item-templates", () => {
  it("creates a template with the org and parsed input, returning 201", async () => {
    const payload = { name: "Underlayment", rate: 1.25, unitLabel: "sqft" };
    const created = { id: 5, orgId: "org1", ...payload };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue(created as any);

    const res = await POST(
      makeRequest("POST", "http://x/api/line-item-templates", payload),
      params({})
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        name: "Underlayment",
        rate: 1.25,
        unitLabel: "sqft",
      })
    );
  });

  it("returns 403 FORBIDDEN when the caller's role is below lead", async () => {
    mockRequireSession.mockResolvedValueOnce({
      user: { id: "u1", orgId: "org1", role: "crew" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any);

    const res = await POST(
      makeRequest("POST", "http://x/api/line-item-templates", {
        name: "Underlayment",
        rate: 1.25,
        unitLabel: "sqft",
      }),
      params({})
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty name with VALIDATION_FAILED", async () => {
    const res = await POST(
      makeRequest("POST", "http://x/api/line-item-templates", { name: "" }),
      params({})
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/line-item-templates/[id]", () => {
  it("updates the template with id, org, and parsed input", async () => {
    const updated = { id: 5, name: "Renamed", orgId: "org1" };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValue(updated as any);

    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/line-item-templates/5", {
        name: "Renamed",
      }),
      params({ id: "5" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({ name: "Renamed" })
    );
  });

  it("returns NOT_FOUND when the template does not exist in the org", async () => {
    mockUpdate.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/line-item-templates/99", {
        name: "x",
      }),
      params({ id: "99" })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("rejects a non-numeric id with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/line-item-templates/abc", {
        name: "x",
      }),
      params({ id: "abc" })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/line-item-templates/[id]", () => {
  it("deletes the template and returns 204 on success", async () => {
    mockDelete.mockResolvedValue({ ok: true });

    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/line-item-templates/5"),
      params({ id: "5" })
    );

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(5, "org1");
  });

  it("returns NOT_FOUND when nothing was deleted", async () => {
    mockDelete.mockResolvedValue({ ok: false });

    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/line-item-templates/99"),
      params({ id: "99" })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
