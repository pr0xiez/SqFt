import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(),
}));

vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test pass-through
  withLogging: (fn: any) => fn,
}));

const { listCustomers, createCustomer } = await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { GET, POST } = await import("@/app/api/customers/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockListCustomers = vi.mocked(listCustomers);
const mockCreateCustomer = vi.mocked(createCustomer);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/customers ────────────────────────────────────────────────────────

describe("GET /api/customers", () => {
  it("returns customer list with 200", async () => {
    const fakeCustomers = [
      { id: 1, name: "Alice", orgId: "org1", _count: { estimates: 2 } },
    ];
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockListCustomers.mockResolvedValue(fakeCustomers as any);

    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler, req unused
    const res = await GET(undefined as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(fakeCustomers);
    expect(mockListCustomers).toHaveBeenCalledWith("org1");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    // biome-ignore lint/suspicious/noExplicitAny: no-arg GET handler, req unused
    const res = await GET(undefined as any);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });
});

// ── POST /api/customers ───────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/customers", () => {
  it("creates a customer and returns 201", async () => {
    const payload = { name: "Bob", phone: "555-1234", source: "phone" };
    const created = { id: 1, orgId: "org1", ...payload };
    mockGetOrgId.mockResolvedValue("org1");
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreateCustomer.mockResolvedValue(created as any);

    const req = makeRequest(payload);
    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toEqual(created);
    expect(mockCreateCustomer).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ name: "Bob" })
    );
  });

  it("returns 400 when name is missing", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest({ phone: "555-0000", source: "phone" });
    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
    expect(mockCreateCustomer).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email", async () => {
    mockGetOrgId.mockResolvedValue("org1");

    const req = makeRequest({
      name: "Carol",
      email: "not-an-email",
      source: "online",
    });
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(400);
    expect(mockCreateCustomer).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetOrgId.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ name: "Dave", source: "referral" });
    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a runtime error occurs", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockCreateCustomer.mockRejectedValue(new Error("DB connection failed"));

    const req = makeRequest({ name: "Dave", source: "referral" });
    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(500);
  });
});
