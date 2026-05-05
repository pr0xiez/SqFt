import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    estimate: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(),
}));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

const { prisma } = await import("@/lib/prisma");
const { getOrgId } = await import("@/lib/tenant");
const { GET, PATCH } = await import("@/app/api/estimates/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockTransaction = vi.mocked(prisma.$transaction);

const mockTx = {
  estimate: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  estimateItem: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  lineItem: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: test callback shim
  mockTransaction.mockImplementation(async (fn: any) => fn(mockTx));
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
  it("returns 404 when estimate not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    vi.mocked(prisma.estimate.findFirst).mockResolvedValue(null);

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
  it("returns 200 and runs all writes in a single transaction", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("5", {
      title: "Updated estimate",
      items: [{ id: 1, type: "room", sortOrder: 0, name: "Living room" }],
      lineItems: [
        { id: 1, name: "Install", rate: 2.5, qtyMode: "manual", qty: 100 },
      ],
    });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockTx.estimate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, orgId: "org1" } })
    );
    expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
      where: { estimateId: 5 },
    });
    expect(mockTx.estimateItem.createMany).toHaveBeenCalledOnce();
    expect(mockTx.lineItem.deleteMany).toHaveBeenCalledWith({
      where: { estimateId: 5 },
    });
    expect(mockTx.lineItem.createMany).toHaveBeenCalledOnce();
  });

  it("returns 500 and the transaction aborts when line-item creation fails", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockTx.lineItem.createMany.mockRejectedValueOnce(
      new Error("constraint violation")
    );

    const req = makeRequest("5", {
      items: [{ id: 1, type: "room", sortOrder: 0 }],
      lineItems: [
        { id: 1, name: "Install", rate: 2.5, qtyMode: "manual", qty: 100 },
      ],
    });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("5")
    );

    expect(res.status).toBe(500);
    expect(mockTransaction).toHaveBeenCalledOnce();
    // items were deleted inside the callback before the failure — but the
    // whole callback threw, so prisma rolls back the transaction atomically
    expect(mockTx.lineItem.deleteMany).toHaveBeenCalledOnce();
    expect(mockTx.lineItem.createMany).toHaveBeenCalledOnce();
  });

  it("skips item/line-item writes when they are absent from the payload", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("7", { title: "Title only" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("7")
    );

    expect(res.status).toBe(200);
    expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.lineItem.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid payload", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest("1", { taxRate: 5 }); // taxRate must be ≤ 1
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 500 when getOrgId throws", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Session error"));

    const req = makeRequest("1", { title: "X" });
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );

    expect(res.status).toBe(500);
  });
});
