import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(),
}));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

const { listEvents, createEvent, updateEvent, deleteEvent } = await import(
  "@/lib/repositories"
);
const { getOrgId } = await import("@/lib/tenant");
const { GET: listGET, POST } = await import("@/app/api/events/route");
const { PATCH, DELETE } = await import("@/app/api/events/[id]/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockListEvents = vi.mocked(listEvents);
const mockCreateEvent = vi.mocked(createEvent);
const mockUpdateEvent = vi.mocked(updateEvent);
const mockDeleteEvent = vi.mocked(deleteEvent);

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

// ── GET /api/events ───────────────────────────────────────────────────────────

describe("GET /api/events", () => {
  it("returns event list with 200", async () => {
    const fakeEvents = [{ id: 1, orgId: "org1", title: "Job day" }];
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockListEvents.mockResolvedValue(fakeEvents as any);

    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await listGET(undefined as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeEvents);
    expect(mockListEvents).toHaveBeenCalledWith("org1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler
    const res = await listGET(undefined as any);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/events ──────────────────────────────────────────────────────────

describe("POST /api/events", () => {
  const validPayload = {
    type: "job",
    title: "Install day",
    date: "2026-06-01",
    startTime: "08:00",
    endTime: "17:00",
  };

  it("creates an event and returns 201", async () => {
    const created = { id: 3, orgId: "org1", ...validPayload };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreateEvent.mockResolvedValue(created as any);

    const req = makeRequest("http://localhost/api/events", validPayload);
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
    expect(mockCreateEvent).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ title: "Install day" })
    );
  });

  it("returns 400 when title is missing", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const req = makeRequest("http://localhost/api/events", {
      type: "job",
      date: "2026-06-01",
      startTime: "08:00",
      endTime: "17:00",
    });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/events/[id] ────────────────────────────────────────────────────

describe("PATCH /api/events/[id]", () => {
  it("updates and returns the event", async () => {
    const updated = { id: 1, orgId: "org1", title: "Rescheduled" };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdateEvent.mockResolvedValue(updated as any);

    const req = makeRequest(
      "http://localhost/api/events/1",
      { title: "Rescheduled" },
      "PATCH"
    );
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("1")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      1,
      "org1",
      expect.objectContaining({ title: "Rescheduled" })
    );
  });

  it("returns 404 when event not found", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockUpdateEvent.mockResolvedValue(null);

    const req = makeRequest(
      "http://localhost/api/events/99",
      { title: "Ghost" },
      "PATCH"
    );
    const res = await PATCH(
      req as Parameters<typeof PATCH>[0],
      makeParams("99")
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/events/[id] ───────────────────────────────────────────────────

describe("DELETE /api/events/[id]", () => {
  it("deletes and returns ok", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockDeleteEvent.mockResolvedValue(true);

    // biome-ignore lint/suspicious/noExplicitAny: unused req
    const res = await DELETE(undefined as any, makeParams("1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
