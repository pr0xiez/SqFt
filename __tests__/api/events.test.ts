import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
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

const { prisma } = await import("@/lib/prisma");
const { getOrgId } = await import("@/lib/tenant");
const { POST } = await import("@/app/api/events/route");
const { PATCH, DELETE } = await import("@/app/api/events/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockCreate = vi.mocked(prisma.event.create);
const mockUpdateMany = vi.mocked(prisma.event.updateMany);
const mockDeleteMany = vi.mocked(prisma.event.deleteMany);

beforeEach(() => {
  vi.clearAllMocks();
});

const validEventPayload = {
  type: "job",
  title: "Install carpet",
  date: "2026-05-10",
  startTime: "08:00",
  endTime: "16:00",
};

// ── POST /api/events ──────────────────────────────────────────────────────────

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/events", () => {
  it("creates an event and returns 201", async () => {
    const created = { id: 1, orgId: "org1", ...validEventPayload };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue(created as any);

    const req = makePostRequest(validEventPayload);
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    const req = makePostRequest(validEventPayload);
    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a runtime error occurs", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockCreate.mockRejectedValue(new Error("DB error"));

    const req = makePostRequest(validEventPayload);
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(500);
  });
});

// ── PATCH /api/events/[id] ────────────────────────────────────────────────────

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/events/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeParams = { params: Promise.resolve({ id: "1" }) };

describe("PATCH /api/events/[id]", () => {
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

// ── DELETE /api/events/[id] ───────────────────────────────────────────────────

describe("DELETE /api/events/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    const req = new Request("http://localhost/api/events/1", {
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

    const req = new Request("http://localhost/api/events/1", {
      method: "DELETE",
    });
    const res = await DELETE(req as Parameters<typeof DELETE>[0], fakeParams);

    expect(res.status).toBe(200);
  });
});
