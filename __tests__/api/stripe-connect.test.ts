import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, noParams } from "./_helpers";

// apiRoute schedules request/mutation logging via next/server's after(), which
// throws outside a real request scope — run the callback synchronously in tests.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const requireSession = vi.fn();
vi.mock("@/lib/tenant", () => ({
  requireSession,
  getOrgId: vi.fn(async () => "org1"),
}));

const ensureConnectAccount = vi.fn();
const getConnectAccountId = vi.fn();
const getConnectStatus = vi.fn();
vi.mock("@/lib/stripe/onboarding", () => ({
  ensureConnectAccount,
  getConnectAccountId,
  getConnectStatus,
}));

vi.mock("@/lib/stripe/realGateway", () => ({
  realGateway: {
    createAccountLink: vi.fn(async () => ({
      url: "https://connect.stripe.test/setup",
    })),
  },
}));

vi.mock("@/lib/baseUrl", () => ({
  getPublicBaseUrl: () => "https://app.test",
}));

function asAdmin() {
  requireSession.mockResolvedValue({
    user: { orgId: "org1", role: "admin", email: "a@b.com", name: "Al" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  asAdmin();
});

describe("POST /api/org/stripe-connect/onboarding", () => {
  it("ensures an account and returns the onboarding url", async () => {
    ensureConnectAccount.mockResolvedValue("acct_x");
    const { POST } = await import(
      "@/app/api/org/stripe-connect/onboarding/route"
    );
    const res = await POST(
      makeRequest("POST", "https://app.test/api/org/stripe-connect/onboarding"),
      noParams as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://connect.stripe.test/setup",
    });
  });

  it("rejects non-admins with 401", async () => {
    requireSession.mockResolvedValue({
      user: { orgId: "org1", role: "lead", email: "a@b.com", name: "Al" },
    });
    const { POST } = await import(
      "@/app/api/org/stripe-connect/onboarding/route"
    );
    const res = await POST(
      makeRequest("POST", "https://app.test/api/org/stripe-connect/onboarding"),
      noParams as never
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/org/stripe-connect/refresh", () => {
  it("303-redirects to a freshly minted onboarding link", async () => {
    getConnectAccountId.mockResolvedValue("acct_x");
    const { GET } = await import("@/app/api/org/stripe-connect/refresh/route");
    const res = await GET(
      makeRequest("GET", "https://app.test/api/org/stripe-connect/refresh"),
      noParams as never
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://connect.stripe.test/setup"
    );
  });

  it("409 STRIPE_NOT_CONNECTED when the org has no connected account", async () => {
    getConnectAccountId.mockResolvedValue(null);
    const { GET } = await import("@/app/api/org/stripe-connect/refresh/route");
    const res = await GET(
      makeRequest("GET", "https://app.test/api/org/stripe-connect/refresh"),
      noParams as never
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("STRIPE_NOT_CONNECTED");
  });
});

describe("GET /api/org/stripe-connect/status", () => {
  it("returns mirrored status", async () => {
    getConnectStatus.mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardingStatus: "enabled",
      disabledReason: null,
      requirementsDue: [],
    });
    const { GET } = await import("@/app/api/org/stripe-connect/status/route");
    const res = await GET(
      makeRequest("GET", "https://app.test/api/org/stripe-connect/status"),
      noParams as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ onboardingStatus: "enabled" });
  });
});
