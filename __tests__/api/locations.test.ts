/**
 * Tier-B route tests: verify the locations route wires its handler to the
 * right repo function with the right arguments (org-scoped via session) and
 * returns its result. Repo-level org isolation is exercised by the repo's own
 * `where: { orgId }` scoping; here we assert the route always forwards the
 * session org so a caller can never read/write another org's locations.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, noParams } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  createLocation: vi.fn(),
  listLocationsForCustomer: vi.fn(),
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

const { createLocation, listLocationsForCustomer } = await import(
  "@/lib/repositories"
);
const { GET, POST } = await import("@/app/api/locations/route");

const mockCreate = vi.mocked(createLocation);
const mockList = vi.mocked(listLocationsForCustomer);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/locations", () => {
  it("creates a location for a customer in the caller's org and returns 201", async () => {
    const created = {
      id: 5,
      orgId: "org1",
      customerId: 1,
      address: "12 Oak St",
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockCreate.mockResolvedValue(created as any);

    const res = await POST(
      makeRequest("POST", "http://x/api/locations", {
        customerId: 1,
        address: "12 Oak St",
        label: "Rental",
      }),
      noParams
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org1",
        customerId: 1,
        address: "12 Oak St",
        label: "Rental",
      })
    );
  });

  it("rejects a missing address with VALIDATION_FAILED", async () => {
    const res = await POST(
      makeRequest("POST", "http://x/api/locations", { customerId: 1 }),
      noParams
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/locations", () => {
  it("lists the customer's locations scoped to the caller's org", async () => {
    const locs = [
      { id: 1, address: "12 Oak St" },
      { id: 2, address: "9 Elm Ave" },
    ];
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockList.mockResolvedValue(locs as any);

    const res = await GET(
      makeRequest("GET", "http://x/api/locations?customerId=1"),
      noParams
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(locs);
    expect(mockList).toHaveBeenCalledWith("org1", 1);
  });

  it("rejects a missing customerId with VALIDATION_FAILED", async () => {
    const res = await GET(
      makeRequest("GET", "http://x/api/locations"),
      noParams
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mockList).not.toHaveBeenCalled();
  });
});
