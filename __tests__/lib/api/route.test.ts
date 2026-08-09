import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("../../../lib/logger", () => ({
  logRequest: vi.fn(),
  logMutation: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../../lib/tenant", () => ({
  getOrgId: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return {
    ...mod,
    after: vi.fn((cb: () => void) => cb()),
  };
});

const { logRequest, logMutation, logError } = await import(
  "../../../lib/logger"
);
const { getOrgId, requireSession } = await import("../../../lib/tenant");
const mockRequireSession = vi.mocked(requireSession);
const { apiRoute, publicRoute } = await import("../../../lib/api/route");
const {
  ConflictError,
  NotFoundError,
  EstimateHasEventsError,
  EstimateLockedError,
  UnauthorizedError,
} = await import("../../../lib/api/errors");

const mockGetOrgId = vi.mocked(getOrgId);
const mockLogRequest = vi.mocked(logRequest);
const mockLogMutation = vi.mocked(logMutation);
const mockLogError = vi.mocked(logError);

function makeRequest(
  method = "GET",
  url = "http://localhost/api/customers",
  body?: unknown
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request(url, init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper cast
  return req as any;
}

const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("apiRoute — success", () => {
  it("returns 200 with JSON body for a GET that returns a value", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async ({ orgId }) => ({ orgId, items: [1, 2] }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: "org1", items: [1, 2] });
  });

  it("honours the status option for POSTs", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute({ status: 201 }, async () => ({ id: 7 }));

    const res = await handler(makeRequest("POST"), ctx);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 7 });
  });

  it("returns 204 when the handler returns null", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => null);

    const res = await handler(makeRequest("DELETE"), ctx);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("passes through an explicit Response", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => new Response("hi", { status: 418 }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(418);
    expect(await res.text()).toBe("hi");
  });

  it("parses input via the provided schema and hands it to the handler", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const schema = z.object({ name: z.string().min(1) });
    const seen = vi.fn();
    const handler = apiRoute(
      { input: schema, status: 201 },
      async ({ orgId, input }) => {
        seen({ orgId, input });
        return { ok: true };
      }
    );

    const res = await handler(
      makeRequest("POST", "http://localhost/x", { name: "Alice" }),
      ctx
    );

    expect(res.status).toBe(201);
    expect(seen).toHaveBeenCalledWith({
      orgId: "org1",
      input: { name: "Alice" },
    });
  });

  it("resolves params and passes them to the handler", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const seen = vi.fn();
    const handler = apiRoute<undefined, { id: string }>(async ({ params }) => {
      seen(params);
      return { ok: true };
    });

    await handler(makeRequest("GET"), {
      params: Promise.resolve({ id: "42" }),
    });

    expect(seen).toHaveBeenCalledWith({ id: "42" });
  });
});

describe("apiRoute — error envelope", () => {
  it("maps UnauthorizedError from getOrgId to 401 envelope", async () => {
    mockGetOrgId.mockRejectedValue(new UnauthorizedError());
    const handler = apiRoute(async () => ({ unreachable: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("maps NotFoundError to 404 envelope", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => {
      throw new NotFoundError();
    });

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });

  it("maps a generic ConflictError to 409 with code CONFLICT", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => {
      throw new ConflictError("something conflicts");
    });

    const res = await handler(makeRequest("PATCH"), ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "CONFLICT", message: "something conflicts" },
    });
  });

  it("maps EstimateLockedError with code ESTIMATE_LOCKED", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => {
      throw new EstimateLockedError("approved");
    });

    const res = await handler(makeRequest("PATCH"), ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "ESTIMATE_LOCKED",
        message: "Estimate is locked (status: approved)",
      },
    });
  });

  it("maps EstimateHasEventsError with code ESTIMATE_HAS_EVENTS", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => {
      throw new EstimateHasEventsError(3);
    });

    const res = await handler(makeRequest("DELETE"), ctx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ESTIMATE_HAS_EVENTS");
    expect(body.error.message).toContain("3");
  });

  it("returns 400 with the full issues array when input fails Zod parse", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });
    const handler = apiRoute({ input: schema }, async () => ({ ok: true }));

    const res = await handler(
      makeRequest("POST", "http://localhost/x", { name: "", email: "bad" }),
      ctx
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBe(2);
  });

  it("returns 400 VALIDATION_FAILED when the body is not valid JSON", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const schema = z.object({ name: z.string() });
    const handler = apiRoute({ input: schema }, async () => ({ ok: true }));

    const res = await handler(
      makeRequest("POST", "http://localhost/x", "not json"),
      ctx
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 500 INTERNAL and calls logError when the handler throws an unknown error", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const boom = new Error("db down");
    const handler = apiRoute(async () => {
      throw boom;
    });

    const res = await handler(makeRequest("POST"), ctx);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL", message: "Server error" },
    });
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "db down", err: boom })
    );
  });
});

describe("apiRoute — logging", () => {
  it("calls logRequest with method, path, status, orgId, durationMs", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => ({ ok: true }));

    await handler(makeRequest("GET"), ctx);

    expect(mockLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/customers",
        status: 200,
        orgId: "org1",
      })
    );
    const call = mockLogRequest.mock.calls[0][0];
    expect(typeof call.durationMs).toBe("number");
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls logMutation for a successful POST", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute({ status: 201 }, async () => ({ id: 1 }));

    await handler(makeRequest("POST"), ctx);

    expect(mockLogMutation).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", status: 201, orgId: "org1" })
    );
  });

  it("does not call logMutation when the mutation fails (4xx)", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = apiRoute(async () => {
      throw new NotFoundError();
    });

    await handler(makeRequest("PATCH"), ctx);

    expect(mockLogMutation).not.toHaveBeenCalled();
    expect(mockLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 })
    );
  });

  it("logs orgId=unauthenticated when getOrgId throws", async () => {
    mockGetOrgId.mockRejectedValue(new UnauthorizedError());
    const handler = apiRoute(async () => ({ ok: true }));

    await handler(makeRequest("GET"), ctx);

    expect(mockLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "unauthenticated", status: 401 })
    );
  });
});

describe("publicRoute", () => {
  it("runs without resolving orgId for the handler", async () => {
    mockGetOrgId.mockRejectedValue(new UnauthorizedError());
    const handler = publicRoute(async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("parses input the same way apiRoute does", async () => {
    mockGetOrgId.mockRejectedValue(new UnauthorizedError());
    const schema = z.object({ token: z.string() });
    const seen = vi.fn();
    const handler = publicRoute({ input: schema }, async ({ input }) => {
      seen(input);
      return { ok: true };
    });

    const res = await handler(
      makeRequest("POST", "http://localhost/q/accept", { token: "abc" }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(seen).toHaveBeenCalledWith({ token: "abc" });
  });

  it("maps ApiError subclasses to the standard envelope", async () => {
    mockGetOrgId.mockRejectedValue(new UnauthorizedError());
    const handler = publicRoute(async () => {
      throw new NotFoundError();
    });

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
});

describe("apiRoute — minRole option", () => {
  it("returns 401 when minRole is set and the session is missing", async () => {
    mockRequireSession.mockRejectedValueOnce(new UnauthorizedError());
    const handler = apiRoute({ minRole: "lead" }, async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("returns 403 FORBIDDEN when the session role is below minRole", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "crew" } } as any
    );
    const handler = apiRoute({ minRole: "lead" }, async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  });

  it("invokes the handler with orgId when role meets minRole (lead → lead)", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "lead" } } as any
    );
    const inner = vi.fn(async ({ orgId }: { orgId: string }) => ({ orgId }));
    const handler = apiRoute({ minRole: "lead" }, inner);

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: "org1" });
    expect(inner).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org1" })
    );
    expect(mockGetOrgId).not.toHaveBeenCalled(); // minRole branch skips getOrgId
  });

  it("admin meets minRole=admin", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "admin" } } as any
    );
    const handler = apiRoute({ minRole: "admin" }, async ({ orgId }) => ({
      orgId,
    }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(200);
  });

  it("lead does NOT meet minRole=admin", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "lead" } } as any
    );
    const handler = apiRoute({ minRole: "admin" }, async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
