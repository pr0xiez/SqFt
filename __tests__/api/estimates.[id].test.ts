import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getEstimate: vi.fn(),
  saveEstimate: vi.fn(),
  deleteEstimate: vi.fn(),
  listEstimates: vi.fn(),
  createEstimate: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(),
}));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

const { getEstimate, saveEstimate, deleteEstimate } = await import(
  "@/lib/repositories"
);
const { getOrgId } = await import("@/lib/tenant");
const { GET, PATCH, DELETE } = await import("@/app/api/estimates/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockGetEstimate = vi.mocked(getEstimate);
const mockSaveEstimate = vi.mocked(saveEstimate);
const mockDeleteEstimate = vi.mocked(deleteEstimate);

const fakeEstimate = {
  id: 5,
  orgId: "org1",
  title: "Updated",
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  mockSaveEstimate.mockResolvedValue(fakeEstimate as any);
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  mockGetEstimate.mockResolvedValue(fakeEstimate as any);
});

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/estimates/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── GET /api/estimates/[id] ───────────────────────────────────────────────────

describe("GET /api/estimates/[id]", () => {
  it("returns 200 with the estimate", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockGetEstimate.mockResolvedValue({
      id: 1,
      orgId: "org1",
      title: "Job A",
      // biome-ignore lint/suspicious/noExplicitAny: test stub
    } as any);
    const res = await GET(
      // biome-ignore lint/suspicious/noExplicitAny: GET handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1, orgId: "org1", title: "Job A" });
  });

  it("returns 404 when estimate not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockGetEstimate.mockResolvedValue(null);

    // biome-ignore lint/suspicious/noExplicitAny: unused req
    const res = await GET(undefined as any, makeParams("99"));
    expect(res.status).toBe(404);
  });

  it("returns 401 when getOrgId throws", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    // biome-ignore lint/suspicious/noExplicitAny: unused req
    const res = await GET(undefined as any, makeParams("1"));
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/estimates/[id] ─────────────────────────────────────────────────

describe("PATCH /api/estimates/[id]", () => {
  it("returns 200 when patching title only", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("5", { title: "Updated estimate" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ id: 5, orgId: "org1" });
    expect(mockSaveEstimate).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({ title: "Updated estimate" })
    );
  });

  it("returns 200 when patching items", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("5", {
      items: [{ id: 1, type: "room", sortOrder: 0, name: "Living room" }],
    });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );

    expect(res.status).toBe(200);
    expect(mockSaveEstimate).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({
        items: [expect.objectContaining({ id: 1, type: "room" })],
      })
    );
  });

  it("skips items write when items are absent from payload", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("7", { title: "Title only" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("7")
    );

    expect(res.status).toBe(200);
    expect(mockSaveEstimate).toHaveBeenCalledWith(
      7,
      "org1",
      expect.not.objectContaining({ items: expect.anything() })
    );
  });

  it("returns 200 when patching customerId", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("5", { customerId: 12 });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );

    expect(res.status).toBe(200);
    expect(mockSaveEstimate).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({ customerId: 12 })
    );
  });

  it("returns 400 for an invalid customerId (non-positive)", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("5", { customerId: -1 });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );

    expect(res.status).toBe(400);
    expect(mockSaveEstimate).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid payload (item with wrong type)", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("1", {
      items: [{ id: "not-a-number", type: "room" }],
    });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );

    expect(res.status).toBe(400);
    expect(mockSaveEstimate).not.toHaveBeenCalled();
  });

  it("returns 500 when saveEstimate throws a non-Unauthorized error", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockSaveEstimate.mockRejectedValue(new Error("DB error"));

    const req = makeRequest("1", { title: "X" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );

    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/estimates/[id] ────────────────────────────────────────────────

describe("DELETE /api/estimates/[id]", () => {
  it("returns 200 on success", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteEstimate.mockResolvedValue(true);
    const res = await DELETE(
      // biome-ignore lint/suspicious/noExplicitAny: DELETE handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDeleteEstimate).toHaveBeenCalledWith(1, "org1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE(
      // biome-ignore lint/suspicious/noExplicitAny: DELETE handler no-arg
      undefined as any,
      makeParams("1")
    );
    expect(res.status).toBe(401);
  });
});
