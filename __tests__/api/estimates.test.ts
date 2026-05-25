import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listEstimates: vi.fn(),
  createEstimate: vi.fn(),
  getEstimate: vi.fn(),
  saveEstimate: vi.fn(),
  deleteEstimate: vi.fn(),
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

const {
  listEstimates,
  createEstimate,
  getEstimate,
  saveEstimate,
  deleteEstimate,
} = await import("@/lib/repositories");
const { GET: listGET, POST } = await import("@/app/api/estimates/route");
const { GET, PATCH, DELETE } = await import("@/app/api/estimates/[id]/route");

const mockList = vi.mocked(listEstimates);
const mockCreate = vi.mocked(createEstimate);
const mockGet = vi.mocked(getEstimate);
const mockSave = vi.mocked(saveEstimate);
const mockDelete = vi.mocked(deleteEstimate);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/estimates", () => {
  it("returns the list", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue([{ id: 1, title: "Job A" }] as any);
    const res = await listGET(
      makeRequest("GET", "http://x/api/estimates"),
      params({})
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("org1");
  });
});

describe("POST /api/estimates", () => {
  it("creates and returns 201", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 5 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/estimates", {
        customerId: 1,
        title: "New",
      }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ customerId: 1 })
    );
  });
});

describe("GET /api/estimates/[id]", () => {
  it("calls getEstimate with parsed id and org", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue({ id: 1, title: "Job A" } as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(1, "org1");
  });

  it("returns NOT_FOUND when estimate missing", async () => {
    mockGet.mockResolvedValue(null);
    const res = await GET(
      makeRequest("GET", "http://x/api/estimates/99"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/estimates/[id]", () => {
  it("forwards title updates to saveEstimate", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSave.mockResolvedValue({ id: 5, title: "Updated" } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/5", { title: "Updated" }),
      params({ id: "5" })
    );
    expect(res.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({ title: "Updated" })
    );
  });

  it("forwards item arrays to saveEstimate", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSave.mockResolvedValue({ id: 5 } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/5", {
        items: [{ id: 1, type: "room", sortOrder: 0, name: "Living room" }],
      }),
      params({ id: "5" })
    );
    expect(res.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({
        items: [expect.objectContaining({ id: 1, type: "room" })],
      })
    );
  });

  it("omits items from the patch when not provided", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSave.mockResolvedValue({ id: 7 } as any);
    await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/7", { title: "Title only" }),
      params({ id: "7" })
    );
    expect(mockSave).toHaveBeenCalledWith(
      7,
      "org1",
      expect.not.objectContaining({ items: expect.anything() })
    );
  });

  it("rejects invalid customerId with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/5", { customerId: -1 }),
      params({ id: "5" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when saveEstimate returns null", async () => {
    mockSave.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/estimates/99", { title: "Gone" }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/estimates/[id]", () => {
  it("calls deleteEstimate and returns 204", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/estimates/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(1, "org1");
  });
});
