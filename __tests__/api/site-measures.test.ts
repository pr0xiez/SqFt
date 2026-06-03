import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listSiteMeasures: vi.fn(),
  createSiteMeasure: vi.fn(),
  getSiteMeasure: vi.fn(),
  saveSiteMeasure: vi.fn(),
  deleteSiteMeasure: vi.fn(),
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
  listSiteMeasures,
  createSiteMeasure,
  getSiteMeasure,
  saveSiteMeasure,
  deleteSiteMeasure,
} = await import("@/lib/repositories");
const { GET: listGET, POST } = await import("@/app/api/site-measures/route");
const { GET, PATCH, DELETE } = await import(
  "@/app/api/site-measures/[id]/route"
);

const mockList = vi.mocked(listSiteMeasures);
const mockCreate = vi.mocked(createSiteMeasure);
const mockGet = vi.mocked(getSiteMeasure);
const mockSave = vi.mocked(saveSiteMeasure);
const mockDelete = vi.mocked(deleteSiteMeasure);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/site-measures", () => {
  it("passes parsed params and returns the paginated envelope", async () => {
    mockList.mockResolvedValue({
      items: [{ id: 1, title: "Job A" }],
      total: 1,
      facets: { all: 1, empty: 0, measured: 0, estimated: 1 },
      // biome-ignore lint/suspicious/noExplicitAny: test stub envelope
    } as any);
    const res = await listGET(
      makeRequest(
        "GET",
        "http://x/api/site-measures?page=1&perPage=25&status=estimated&sort=customer&dir=asc"
      ),
      params({})
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.facets.estimated).toBe(1);
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 1,
        perPage: 25,
        status: "estimated",
        sort: { key: "customer", direction: "asc" },
      })
    );
  });

  it("defaults status to 'all' when omitted", async () => {
    mockList.mockResolvedValue({
      items: [],
      total: 0,
      facets: { all: 0, empty: 0, measured: 0, estimated: 0 },
      // biome-ignore lint/suspicious/noExplicitAny: test stub envelope
    } as any);
    await listGET(makeRequest("GET", "http://x/api/site-measures"), params({}));
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ status: "all" })
    );
  });
});

describe("POST /api/site-measures", () => {
  it("creates and returns 201", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 5 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/site-measures", {
        locationId: 1,
        title: "New",
      }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ locationId: 1 })
    );
  });
});

describe("GET /api/site-measures/[id]", () => {
  it("calls getSiteMeasure with parsed id and org", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGet.mockResolvedValue({ id: 1, title: "Job A" } as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/site-measures/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(1, "org1");
  });

  it("returns NOT_FOUND when siteMeasure missing", async () => {
    mockGet.mockResolvedValue(null);
    const res = await GET(
      makeRequest("GET", "http://x/api/site-measures/99"),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/site-measures/[id]", () => {
  it("forwards title updates to saveSiteMeasure", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSave.mockResolvedValue({ id: 5, title: "Updated" } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/site-measures/5", {
        title: "Updated",
      }),
      params({ id: "5" })
    );
    expect(res.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith(
      5,
      "org1",
      expect.objectContaining({ title: "Updated" })
    );
  });

  it("forwards item arrays to saveSiteMeasure", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockSave.mockResolvedValue({ id: 5 } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/site-measures/5", {
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
      makeRequest("PATCH", "http://x/api/site-measures/7", {
        title: "Title only",
      }),
      params({ id: "7" })
    );
    expect(mockSave).toHaveBeenCalledWith(
      7,
      "org1",
      expect.not.objectContaining({ items: expect.anything() })
    );
  });

  it("rejects invalid locationId with VALIDATION_FAILED", async () => {
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/site-measures/5", { locationId: -1 }),
      params({ id: "5" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when saveSiteMeasure returns null", async () => {
    mockSave.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/site-measures/99", { title: "Gone" }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/site-measures/[id]", () => {
  it("calls deleteSiteMeasure and returns 204", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/site-measures/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(1, "org1");
  });
});
