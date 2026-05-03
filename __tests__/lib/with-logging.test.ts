import { beforeEach, describe, expect, it, vi } from "vitest";

// Use relative paths so these resolve correctly in both the worktree
// and after the PR is merged into the main project.
vi.mock("../../lib/logger", () => ({
  logRequest: vi.fn(),
  logMutation: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../lib/tenant", () => ({
  getOrgId: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return {
    ...mod,
    after: vi.fn((cb: () => void) => cb()),
  };
});

const { logRequest, logMutation, logError } = await import("../../lib/logger");
const { getOrgId } = await import("../../lib/tenant");
const { withLogging } = await import("../../lib/with-logging");

const mockGetOrgId = vi.mocked(getOrgId);
const mockLogRequest = vi.mocked(logRequest);
const mockLogMutation = vi.mocked(logMutation);
const mockLogError = vi.mocked(logError);

function makeRequest(method = "GET", url = "http://localhost/api/customers") {
  const req = new Request(url, { method });
  // NextRequest adds nextUrl; replicate it for tests
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper cast
  return req as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withLogging", () => {
  it("calls logRequest after a successful GET", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await withLogging(handler)(makeRequest("GET"));

    expect(mockLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/customers",
        status: 200,
        orgId: "org1",
      })
    );
  });

  it("calls logMutation for a POST returning 201", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));

    await withLogging(handler)(makeRequest("POST"));

    expect(mockLogMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/customers",
        status: 201,
        orgId: "org1",
      })
    );
    expect(mockLogRequest).toHaveBeenCalled();
  });

  it("does not call logMutation for GET requests", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await withLogging(handler)(makeRequest("GET"));

    expect(mockLogMutation).not.toHaveBeenCalled();
  });

  it("does not call logMutation for a POST returning 400", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 400 }));

    await withLogging(handler)(makeRequest("POST"));

    expect(mockLogMutation).not.toHaveBeenCalled();
    expect(mockLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 })
    );
  });

  it("logs orgId=unauthenticated when getOrgId throws", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await withLogging(handler)(makeRequest("GET"));

    expect(mockLogRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "unauthenticated", status: 401 })
    );
  });

  it("calls logError and re-throws when the handler throws", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const boom = new Error("unexpected failure");
    const handler = vi.fn().mockRejectedValue(boom);

    await expect(withLogging(handler)(makeRequest("GET"))).rejects.toThrow(
      "unexpected failure"
    );

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "unexpected failure", err: boom })
    );
  });

  it("includes durationMs as a non-negative number", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    const handler = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await withLogging(handler)(makeRequest("GET"));

    const call = mockLogRequest.mock.calls[0][0];
    expect(typeof call.durationMs).toBe("number");
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });
});
