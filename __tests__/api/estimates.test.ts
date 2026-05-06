import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listEstimates: vi.fn(),
  createEstimate: vi.fn(),
  getEstimate: vi.fn(),
  saveEstimate: vi.fn(),
  deleteEstimate: vi.fn(),
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

const {
  listEstimates,
  createEstimate,
  getEstimate,
  saveEstimate,
  deleteEstimate,
} = await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET: listGET, POST } = await import("@/app/api/estimates/route");
const { GET, PATCH, DELETE } = await import("@/app/api/estimates/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockListEstimates = vi.mocked(listEstimates);
const mockCreateEstimate = vi.mocked(createEstimate);
const mockGetEstimate = vi.mocked(getEstimate);
const mockSaveEstimate = vi.mocked(saveEstimate);
const mockDeleteEstimate = vi.mocked(deleteEstimate);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/estimates ────────────────────────────────────────────────────────

describe("GET /api/estimates", () => {
  it("returns estimate list with 200", async () => {
    const fakeEstimates = [{ id: 1, orgId: "org1", title: "Job A" }];
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockListEstimates.mockResolvedValue(fakeEstimates as any);

    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await listGET(undefined as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeEstimates);
    expect(mockListEstimates).toHaveBeenCalledWith("org1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await listGET(undefined as any);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/estimates ───────────────────────────────────────────────────────

describe("POST /api/estimates", () => {
  it("creates an estimate and returns 201", async () => {
    const payload = { customerId: 1, title: "New Job" };
    const created = { id: 5, orgId: "org1", ...payload };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreateEstimate.mockResolvedValue(created as any);

    const req = makeRequest("http://localhost/api/estimates", payload);
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreateEstimate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ customerId: 1 })
    );
  });

  it("returns 400 when customerId is missing", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest("http://localhost/api/estimates", {
      title: "Oops",
    });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(mockCreateEstimate).not.toHaveBeenCalled();
  });
});

// ── GET /api/estimates/[id] ───────────────────────────────────────────────────

describe("GET /api/estimates/[id]", () => {
  it("returns the estimate with 200", async () => {
    const fake = { id: 1, orgId: "org1", items: [], lineItems: [] };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetEstimate.mockResolvedValue(fake as any);

    // biome-ignore lint/suspicious/noExplicitAny: unused req
    const res = await GET(undefined as any, makeParams("1"));
    expect(res.status).toBe(200);
    expect(mockGetEstimate).toHaveBeenCalledWith(1, "org1");
  });

  it("returns 404 when not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockGetEstimate.mockResolvedValue(null);

    // biome-ignore lint/suspicious/noExplicitAny: unused req
    const res = await GET(undefined as any, makeParams("99"));
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/estimates/[id] ─────────────────────────────────────────────────

describe("PATCH /api/estimates/[id]", () => {
  it("saves and returns the updated estimate", async () => {
    const updated = {
      id: 1,
      orgId: "org1",
      title: "Updated",
      items: [],
      lineItems: [],
    };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSaveEstimate.mockResolvedValue(updated as any);

    const req = makeRequest(
      "http://localhost/api/estimates/1",
      { title: "Updated" },
      "PATCH"
    );
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockSaveEstimate).toHaveBeenCalledWith(
      1,
      "org1",
      expect.objectContaining({ title: "Updated" })
    );
  });

  it("returns 404 when estimate not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockSaveEstimate.mockResolvedValue(null);

    const req = makeRequest(
      "http://localhost/api/estimates/99",
      { title: "Gone" },
      "PATCH"
    );
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("99")
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/estimates/[id] ────────────────────────────────────────────────

describe("DELETE /api/estimates/[id]", () => {
  it("deletes and returns ok", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteEstimate.mockResolvedValue(true);

    // biome-ignore lint/suspicious/noExplicitAny: unused req
    const res = await DELETE(undefined as any, makeParams("1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
