/**
 * Tier-B route tests for the customer hub feeds: the activity route and the
 * location search both forward the session org to their repo function.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  getCustomerActivity: vi.fn(),
  searchLocations: vi.fn(),
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

const { getCustomerActivity, searchLocations } = await import(
  "@/lib/repositories"
);
const { GET: GET_ACTIVITY } = await import(
  "@/app/api/customers/[id]/activity/route"
);
const { GET: GET_SEARCH } = await import("@/app/api/locations/search/route");

const mockActivity = vi.mocked(getCustomerActivity);
const mockSearch = vi.mocked(searchLocations);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/customers/[id]/activity", () => {
  it("returns the customer's activity for the caller's org", async () => {
    const activity = {
      customerCreatedAt: "2026-09-01T00:00:00.000Z",
      siteMeasures: [],
      estimates: [],
      invoices: [],
      events: [],
    };
    mockActivity.mockResolvedValue(activity);
    const res = await GET_ACTIVITY(
      makeRequest("GET", "http://x/api/customers/7/activity"),
      { params: Promise.resolve({ id: "7" }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(activity);
    expect(mockActivity).toHaveBeenCalledWith("org1", 7);
  });

  it("404s when the customer isn't in the org", async () => {
    mockActivity.mockResolvedValue(null);
    const res = await GET_ACTIVITY(
      makeRequest("GET", "http://x/api/customers/7/activity"),
      { params: Promise.resolve({ id: "7" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/locations/search", () => {
  it("searches the caller's org with the query", async () => {
    mockSearch.mockResolvedValue([]);
    const res = await GET_SEARCH(
      makeRequest("GET", "http://x/api/locations/search?q=maple"),
      { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledWith("org1", "maple");
  });

  it("treats a missing query as empty (recent locations)", async () => {
    mockSearch.mockResolvedValue([]);
    await GET_SEARCH(makeRequest("GET", "http://x/api/locations/search"), {
      params: Promise.resolve({}),
    });
    expect(mockSearch).toHaveBeenCalledWith("org1", "");
  });
});
