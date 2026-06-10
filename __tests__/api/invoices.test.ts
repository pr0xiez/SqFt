import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, noParams } from "./_helpers";

vi.mock("@/lib/repositories", () => ({
  listInvoices: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    facets: {
      all: 0,
      open: 0,
      draft: 0,
      sent: 0,
      viewed: 0,
      partial: 0,
      paid: 0,
      void: 0,
    },
  }),
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

const { listInvoices } = await import("@/lib/repositories");
const { requireSession } = await import("@/lib/tenant");
const { GET } = await import("@/app/api/invoices/route");

const mockList = vi.mocked(listInvoices);
const mockRequireSession = vi.mocked(requireSession);

beforeEach(() => {
  vi.clearAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockRequireSession.mockResolvedValue(stubSession as any);
});

describe("GET /api/invoices", () => {
  it("401 for crew role", async () => {
    mockRequireSession.mockResolvedValue({
      user: { id: "u1", orgId: "org1", role: "crew" },
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
    } as any);
    const res = await GET(
      makeRequest("GET", "http://x/api/invoices"),
      noParams
    );
    expect(res.status).toBe(401);
  });

  it("defaults to status=all and sentAt desc", async () => {
    const res = await GET(
      makeRequest("GET", "http://x/api/invoices"),
      noParams
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 1,
        status: "all",
        sort: { key: "sentAt", direction: "desc" },
        q: "",
      })
    );
  });

  it("passes parsed params and returns the paginated envelope", async () => {
    mockList.mockResolvedValue({
      items: [
        {
          id: 1,
          invoiceNumber: 9001,
          status: "partial",
          amount: 1000,
          balanceDue: 400,
          dueDate: null,
          sentAt: new Date("2026-06-01T00:00:00Z"),
          estimateId: 5,
          customerName: "Dana Floors",
        },
      ],
      total: 1,
      facets: {
        all: 1,
        open: 1,
        draft: 0,
        sent: 0,
        viewed: 0,
        partial: 1,
        paid: 0,
        void: 0,
      },
    });
    const res = await GET(
      makeRequest(
        "GET",
        "http://x/api/invoices?page=2&perPage=50&status=paid&sort=amount&dir=asc&q=dana"
      ),
      noParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.facets.open).toBe(1);
    expect(body.items[0].balanceDue).toBe(400);
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        page: 2,
        perPage: 50,
        status: "paid",
        sort: { key: "amount", direction: "asc" },
        q: "dana",
      })
    );
  });

  it("falls back to status=all for an unknown status value", async () => {
    await GET(
      makeRequest("GET", "http://x/api/invoices?status=bogus"),
      noParams
    );
    expect(mockList).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ status: "all" })
    );
  });
});
