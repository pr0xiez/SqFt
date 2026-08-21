/**
 * Tests for GET/POST /api/org/stripe/connect.
 * Session-mocking pattern mirrors __tests__/api/org.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/repositories/organizationRepo", () => ({
  getOrgStripe: vi.fn(),
  setOrgConnectAccount: vi.fn(),
  setOrgConnectStatus: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  createConnectedAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  readAccountStatusDetail: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/org/stripe/connect/route";
import { auth } from "@/lib/auth";
import {
  getOrgStripe,
  setOrgConnectAccount,
  setOrgConnectStatus,
} from "@/lib/repositories/organizationRepo";
import {
  createConnectedAccount,
  createOnboardingLink,
  readAccountStatusDetail,
} from "@/lib/stripe/connect";
import { makeRequest, noParams } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockGetOrgStripe = vi.mocked(getOrgStripe);
const mockSetOrgConnectAccount = vi.mocked(setOrgConnectAccount);
const mockSetOrgConnectStatus = vi.mocked(setOrgConnectStatus);
const mockCreateConnectedAccount = vi.mocked(createConnectedAccount);
const mockCreateOnboardingLink = vi.mocked(createOnboardingLink);
const mockReadAccountStatusDetail = vi.mocked(readAccountStatusDetail);

function asAdmin() {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role: "admin" } } as any
  );
}

function asCrew() {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role: "crew" } } as any
  );
}

// Onboarding URLs now resolve via getPublicBaseUrl() (shared with the send
// pipeline), which honors PUBLIC_BASE_URL — pin it so the assertions are stable.
const prevPublicBaseUrl = process.env.PUBLIC_BASE_URL;
beforeEach(() => {
  vi.clearAllMocks();
  mockSetOrgConnectAccount.mockResolvedValue(undefined);
  mockSetOrgConnectStatus.mockResolvedValue(undefined);
  process.env.PUBLIC_BASE_URL = "https://app.test";
});
afterEach(() => {
  if (prevPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = prevPublicBaseUrl;
});

describe("POST /api/org/stripe/connect", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST"), noParams);
    expect(res.status).toBe(401);
    expect(mockCreateConnectedAccount).not.toHaveBeenCalled();
  });

  it("returns 401 when role is crew (not admin)", async () => {
    asCrew();
    const res = await POST(makeRequest("POST"), noParams);
    expect(res.status).toBe(401);
    expect(mockCreateConnectedAccount).not.toHaveBeenCalled();
  });

  it("creates account + returns onboarding url when org has no stripeConnectAccountId", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: null,
      stripeConnectStatus: null,
    });
    mockCreateConnectedAccount.mockResolvedValueOnce("acct_123");
    mockCreateOnboardingLink.mockResolvedValueOnce(
      "https://connect.stripe.com/setup/e/acct_123/abc"
    );

    const res = await POST(
      makeRequest("POST", "http://localhost/api/org/stripe/connect"),
      noParams
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://connect.stripe.com/setup/e/acct_123/abc");

    expect(mockCreateConnectedAccount).toHaveBeenCalledWith({
      orgId: "org1",
      email: null,
      name: "Acme Floors",
    });
    expect(mockSetOrgConnectAccount).toHaveBeenCalledWith(
      "org1",
      "acct_123",
      "pending"
    );
    expect(mockCreateOnboardingLink).toHaveBeenCalledWith(
      "acct_123",
      "https://app.test/settings/payments?onboarding=return",
      "https://app.test/settings/payments?onboarding=refresh"
    );
  });

  it("skips account creation when org already has stripeConnectAccountId", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_existing",
      stripeConnectStatus: "pending",
    });
    mockCreateOnboardingLink.mockResolvedValueOnce(
      "https://connect.stripe.com/setup/e/acct_existing/xyz"
    );

    const res = await POST(
      makeRequest("POST", "http://localhost/api/org/stripe/connect"),
      noParams
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe(
      "https://connect.stripe.com/setup/e/acct_existing/xyz"
    );
    expect(mockCreateConnectedAccount).not.toHaveBeenCalled();
    expect(mockSetOrgConnectAccount).not.toHaveBeenCalled();
    expect(mockCreateOnboardingLink).toHaveBeenCalledWith(
      "acct_existing",
      "https://app.test/settings/payments?onboarding=return",
      "https://app.test/settings/payments?onboarding=refresh"
    );
  });
});

describe("GET /api/org/stripe/connect", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("returns { connected: false, status: null } when no account", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: null,
      stripeConnectStatus: null,
    });

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connected: boolean;
      status: string | null;
    };
    expect(body).toEqual({
      connected: false,
      status: null,
      requirements: null,
    });
    expect(mockReadAccountStatusDetail).not.toHaveBeenCalled();
  });

  it("refreshes status from Stripe when account exists and status is not active", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_123",
      stripeConnectStatus: "pending",
    });
    mockReadAccountStatusDetail.mockResolvedValueOnce({
      status: "active",
      requirements: { actionDue: false, inReview: false, issues: [] },
    });

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; status: string };
    expect(body).toEqual({
      connected: true,
      status: "active",
      requirements: { actionDue: false, inReview: false, issues: [] },
    });
    expect(mockReadAccountStatusDetail).toHaveBeenCalledWith("acct_123");
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(
      "org1",
      "active",
      expect.any(Date)
    );
  });

  it("surfaces the requirements summary while onboarding is incomplete", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_123",
      stripeConnectStatus: "pending",
    });
    const issues = [
      {
        requirement: "individual.id_number",
        message: "The person's keyed-in identity could not be verified.",
      },
    ];
    mockReadAccountStatusDetail.mockResolvedValueOnce({
      status: "pending",
      requirements: { actionDue: true, inReview: false, issues },
    });

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { requirements: unknown };
    expect(body).toEqual({
      connected: true,
      status: "pending",
      requirements: { actionDue: true, inReview: false, issues },
    });
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(
      "org1",
      "pending",
      undefined
    );
  });

  it("still refreshes from Stripe when the cached status is active, so a later restriction surfaces", async () => {
    // Skipping the read once the cache said "active" latched the settings page
    // to "payments are active" permanently. A Stripe restriction after that
    // point stayed invisible here while the public "Pay now" button — gated on
    // the same cached value — kept sending customers to a failing checkout.
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_123",
      stripeConnectStatus: "active",
    });
    mockReadAccountStatusDetail.mockResolvedValueOnce({
      status: "restricted",
      requirements: { actionDue: false, inReview: true, issues: [] },
    });

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; status: string };
    expect(body).toEqual({
      connected: true,
      status: "restricted",
      requirements: { actionDue: false, inReview: true, issues: [] },
    });
    expect(mockReadAccountStatusDetail).toHaveBeenCalledWith("acct_123");
    // …and the cached copy the public pay path reads is downgraded with it.
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(
      "org1",
      "restricted",
      undefined
    );
  });

  it("carries the requirements summary on the poll that flips an account active", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_123",
      stripeConnectStatus: "pending",
    });
    mockReadAccountStatusDetail.mockResolvedValueOnce({
      status: "active",
      requirements: { actionDue: false, inReview: false, issues: [] },
    });

    const res = await GET(makeRequest("GET"), noParams);
    const body = (await res.json()) as { requirements: unknown };
    expect(body.requirements).toEqual({
      actionDue: false,
      inReview: false,
      issues: [],
    });
  });
});
