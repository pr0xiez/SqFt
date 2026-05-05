import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    estimateItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    lineItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
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

const { prisma } = await import("@/lib/prisma");
const { getOrgId } = await import("@/lib/tenant");
const { POST } = await import("@/app/api/estimates/route");
const { PATCH, DELETE } = await import("@/app/api/estimates/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockCreate = vi.mocked(prisma.estimate.create);
const mockUpdateMany = vi.mocked(prisma.estimate.updateMany);
const mockDeleteMany = vi.mocked(prisma.estimate.deleteMany);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/estimates ───────────────────────────────────────────────────────

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/estimates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/estimates", () => {
  it("creates an estimate and returns 201", async () => {
    const payload = { customerId: 1 };
    const created = {
      id: 1,
      orgId: "org1",
      ...payload,
      taxRate: 0.08,
      markupPct: 0,
      depositPct: 0.5,
      title: "",
    };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue(created as any);

    const req = makePostRequest(payload);
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    const req = makePostRequest({ customerId: 1 });
    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a runtime error occurs", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockCreate.mockRejectedValue(new Error("DB error"));

    const req = makePostRequest({ customerId: 1 });
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(500);
  });
});

// ── PATCH /api/estimates/[id] ─────────────────────────────────────────────────

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/estimates/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeParams = { params: Promise.resolve({ id: "1" }) };

describe("PATCH /api/estimates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    const req = makePatchRequest({ title: "Updated" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], fakeParams);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a runtime error occurs", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockUpdateMany.mockRejectedValue(new Error("DB error"));

    const req = makePatchRequest({ title: "Updated" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], fakeParams);

    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/estimates/[id] ────────────────────────────────────────────────

describe("DELETE /api/estimates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    const req = new Request("http://localhost/api/estimates/1", {
      method: "DELETE",
    });
    const res = await DELETE(req as Parameters<typeof DELETE>[0], fakeParams);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 when authenticated", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockDeleteMany.mockResolvedValue({ count: 1 } as any);

    const req = new Request("http://localhost/api/estimates/1", {
      method: "DELETE",
    });
    const res = await DELETE(req as Parameters<typeof DELETE>[0], fakeParams);

    expect(res.status).toBe(200);
  });
});
