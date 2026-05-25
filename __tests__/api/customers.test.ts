/**
 * Tier-B route tests: verify the route wires its handler to the right repo
 * function with the right arguments and returns its result. Auth, validation,
 * and error envelopes are exercised by the wrapper's own tests in
 * __tests__/lib/api/route.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
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
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  deleteCustomer,
} = await import("@/lib/repositories");
const { GET, POST } = await import("@/app/api/customers/route");
const {
  GET: GET_ID,
  PATCH: PATCH_ID,
  DELETE: DELETE_ID,
} = await import("@/app/api/customers/[id]/route");

const mockListCustomers = vi.mocked(listCustomers);
const mockCreateCustomer = vi.mocked(createCustomer);
const mockGetCustomer = vi.mocked(getCustomer);
const mockUpdateCustomer = vi.mocked(updateCustomer);
const mockDeleteCustomer = vi.mocked(deleteCustomer);

function makeRequest(
  method = "GET",
  url = "http://localhost/api/customers",
  body?: unknown
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
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

const noParams = { params: Promise.resolve({}) };
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/customers", () => {
  it("calls listCustomers with the org and returns the list", async () => {
    const customers = [{ id: 1, name: "Alice", orgId: "org1" }];
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockListCustomers.mockResolvedValue(customers as any);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(customers);
    expect(mockListCustomers).toHaveBeenCalledWith("org1");
  });
});

describe("POST /api/customers", () => {
  it("calls createCustomer with org and parsed input and returns 201", async () => {
    const payload = { name: "Bob", phone: "555-1234", source: "phone" };
    const created = { id: 1, orgId: "org1", ...payload };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreateCustomer.mockResolvedValue(created as any);

    const res = await POST(
      makeRequest("POST", "http://localhost/api/customers", payload),
      noParams
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreateCustomer).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ name: "Bob" })
    );
  });
});

describe("GET /api/customers/[id]", () => {
  it("calls getCustomer with parsed numeric id and the org", async () => {
    const customer = { id: 7, name: "Carol", orgId: "org1" };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockGetCustomer.mockResolvedValue(customer as any);

    const res = await GET_ID(
      makeRequest("GET", "http://localhost/api/customers/7"),
      idParams("7")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(customer);
    expect(mockGetCustomer).toHaveBeenCalledWith(7, "org1");
  });

  it("returns a NOT_FOUND envelope when the customer does not exist", async () => {
    mockGetCustomer.mockResolvedValue(null);

    const res = await GET_ID(
      makeRequest("GET", "http://localhost/api/customers/99"),
      idParams("99")
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/customers/[id]", () => {
  it("calls updateCustomer with id, org, and parsed input", async () => {
    const updated = { id: 7, name: "Renamed", orgId: "org1" };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdateCustomer.mockResolvedValue(updated as any);

    const res = await PATCH_ID(
      makeRequest("PATCH", "http://localhost/api/customers/7", {
        name: "Renamed",
      }),
      idParams("7")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdateCustomer).toHaveBeenCalledWith(
      7,
      "org1",
      expect.objectContaining({ name: "Renamed" })
    );
  });
});

describe("DELETE /api/customers/[id]", () => {
  it("calls deleteCustomer and returns 204 on success", async () => {
    mockDeleteCustomer.mockResolvedValue(true);

    const res = await DELETE_ID(
      makeRequest("DELETE", "http://localhost/api/customers/7"),
      idParams("7")
    );

    expect(res.status).toBe(204);
    expect(mockDeleteCustomer).toHaveBeenCalledWith(7, "org1");
  });

  it("returns NOT_FOUND when the customer was not deleted", async () => {
    mockDeleteCustomer.mockResolvedValue(false);

    const res = await DELETE_ID(
      makeRequest("DELETE", "http://localhost/api/customers/99"),
      idParams("99")
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
