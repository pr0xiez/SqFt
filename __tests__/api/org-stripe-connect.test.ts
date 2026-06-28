/**
 * Tests for GET/POST /api/org/stripe/connect.
 * Session-mocking pattern mirrors __tests__/api/org.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/repositories/orgRepo", () => ({
  getOrgStripe: vi.fn(),
  setOrgConnectAccount: vi.fn(),
  setOrgConnectStatus: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  createConnectedAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  readAccountStatus: vi.fn(),
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
} from "@/lib/repositories/orgRepo";
import {
  createConnectedAccount,
  createOnboardingLink,
  readAccountStatus,
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
const mockReadAccountStatus = vi.mocked(readAccountStatus);

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

beforeEach(() => {
  vi.clearAllMocks();
  mockSetOrgConnectAccount.mockResolvedValue(undefined);
  mockSetOrgConnectStatus.mockResolvedValue(undefined);
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
      "http://localhost/settings/payments?onboarding=return",
      "http://localhost/settings/payments?onboarding=refresh"
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
      "http://localhost/settings/payments?onboarding=return",
      "http://localhost/settings/payments?onboarding=refresh"
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
    expect(body).toEqual({ connected: false, status: null });
    expect(mockReadAccountStatus).not.toHaveBeenCalled();
  });

  it("refreshes status from Stripe when account exists and status is not active", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_123",
      stripeConnectStatus: "pending",
    });
    mockReadAccountStatus.mockResolvedValueOnce("active");

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; status: string };
    expect(body).toEqual({ connected: true, status: "active" });
    expect(mockReadAccountStatus).toHaveBeenCalledWith("acct_123");
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(
      "org1",
      "active",
      expect.any(Date)
    );
  });

  it("skips Stripe refresh when account is already active", async () => {
    asAdmin();
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: "acct_123",
      stripeConnectStatus: "active",
    });

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; status: string };
    expect(body).toEqual({ connected: true, status: "active" });
    expect(mockReadAccountStatus).not.toHaveBeenCalled();
    expect(mockSetOrgConnectStatus).not.toHaveBeenCalled();
  });
});
