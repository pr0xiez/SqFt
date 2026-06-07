import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/api/errors";
import { makeRequest, params } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  validateUserIds: vi.fn().mockResolvedValue(true),
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

const { listEvents, createEvent, updateEvent, deleteEvent } = await import(
  "@/lib/repositories"
);
const { GET: listGET, POST } = await import("@/app/api/events/route");
const { PATCH, DELETE } = await import("@/app/api/events/[id]/route");

const mockList = vi.mocked(listEvents);
const mockCreate = vi.mocked(createEvent);
const mockUpdate = vi.mocked(updateEvent);
const mockDelete = vi.mocked(deleteEvent);

const validPayload = {
  type: "job",
  title: "Install day",
  date: "2026-06-01",
  startTime: "08:00",
  endTime: "17:00",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/events", () => {
  it("returns the list scoped by org", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue([{ id: 1, title: "Job day" }] as any);
    const res = await listGET(
      makeRequest("GET", "http://x/api/events"),
      params({})
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("org1");
  });
});

describe("POST /api/events", () => {
  it("creates an event and returns 201", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 3 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/events", validPayload),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ title: "Install day" })
    );
  });

  it("forwards assigneeIds to createEvent", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 4 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/events", {
        ...validPayload,
        assigneeIds: ["u10", "u11"],
      }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ assigneeIds: ["u10", "u11"] })
    );
  });

  it("creates a job with a estimateId", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue({ id: 1 } as any);
    const res = await POST(
      makeRequest("POST", "http://x/api/events", {
        ...validPayload,
        estimateId: 42,
      }),
      params({})
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ type: "job", estimateId: 42 })
    );
  });

  it("returns VALIDATION_FAILED when title is missing", async () => {
    const { title: _title, ...payload } = validPayload;
    const res = await POST(
      makeRequest("POST", "http://x/api/events", payload),
      params({})
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps ValidationError from the repo to a 400 VALIDATION_FAILED", async () => {
    mockCreate.mockRejectedValue(
      new ValidationError("Job events require a estimateId")
    );
    const res = await POST(
      makeRequest("POST", "http://x/api/events", validPayload),
      params({})
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.message).toBe("Job events require a estimateId");
  });
});

describe("PATCH /api/events/[id]", () => {
  it("forwards updates to updateEvent", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValue({ id: 1, title: "Rescheduled" } as any);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/events/1", { title: "Rescheduled" }),
      params({ id: "1" })
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      "org1",
      expect.objectContaining({ title: "Rescheduled" })
    );
  });

  it("returns NOT_FOUND when updateEvent returns null", async () => {
    mockUpdate.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("PATCH", "http://x/api/events/99", { title: "Ghost" }),
      params({ id: "99" })
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/events/[id]", () => {
  it("calls deleteEvent and returns 204", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(
      makeRequest("DELETE", "http://x/api/events/1"),
      params({ id: "1" })
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(1, "org1");
  });
});
