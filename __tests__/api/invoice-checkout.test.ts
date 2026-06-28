/**
 * Tests for POST /api/invoice-review/[token]/checkout.
 * Mirrors the mocking pattern from __tests__/api/org-stripe-connect.test.ts:
 * mock each dependency module directly, import the handler after mocks, assert
 * guard semantics and the correct cents value passed to buildCheckoutParams.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

// Prevent @/lib/api/route → @/lib/tenant → @/lib/auth → next-auth from
// loading next/server via CJS require (which bypasses the next/server mock).
vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn().mockRejectedValue(new Error("not used in public routes")),
  requireSession: vi
    .fn()
    .mockRejectedValue(new Error("not used in public routes")),
}));

vi.mock("@/lib/repositories/invoiceRepo", () => ({
  getInvoiceByToken: vi.fn(),
}));

vi.mock("@/lib/repositories/orgRepo", () => ({
  getOrgStripe: vi.fn(),
  setOrgConnectStatus: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  readAccountStatus: vi.fn(),
}));

vi.mock("@/lib/stripe/checkout", () => ({
  buildCheckoutParams: vi.fn(),
  createInvoiceCheckoutSession: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { POST } from "@/app/api/invoice-review/[token]/checkout/route";
import { getInvoiceByToken } from "@/lib/repositories/invoiceRepo";
import { getOrgStripe, setOrgConnectStatus } from "@/lib/repositories/orgRepo";
import {
  buildCheckoutParams,
  createInvoiceCheckoutSession,
} from "@/lib/stripe/checkout";
import { readAccountStatus } from "@/lib/stripe/connect";

const mockGetInvoiceByToken = vi.mocked(getInvoiceByToken);
const mockGetOrgStripe = vi.mocked(getOrgStripe);
const mockSetOrgConnectStatus = vi.mocked(setOrgConnectStatus);
const mockReadAccountStatus = vi.mocked(readAccountStatus);
const mockBuildCheckoutParams = vi.mocked(buildCheckoutParams);
const mockCreateInvoiceCheckoutSession = vi.mocked(
  createInvoiceCheckoutSession
);

const TEST_TOKEN = "test-token-abc123";
const ORG_ID = "org1";
const INVOICE_ID = 42;
const INVOICE_NUMBER = 1001;
const CONNECT_ACCOUNT_ID = "acct_test123";

/** A base active-org stripe record. */
const activeOrg = {
  name: "Acme Floors",
  stripeConnectAccountId: CONNECT_ACCOUNT_ID,
  stripeConnectStatus: "active" as const,
};

/** A base invoice fixture with no payments (full balance due). */
function makeInvoice(
  overrides: Partial<{
    status: string;
    amount: number;
    payments: Array<{ amount: number }>;
  }> = {}
) {
  return {
    id: INVOICE_ID,
    orgId: ORG_ID,
    invoiceNumber: INVOICE_NUMBER,
    status: overrides.status ?? "sent",
    amount: overrides.amount ?? 500,
    payments: overrides.payments ?? [],
    // biome-ignore lint/suspicious/noExplicitAny: partial fixture
  } as any;
}

function makePostRequest() {
  return makeRequest(
    "POST",
    `http://localhost/api/invoice-review/${TEST_TOKEN}/checkout`
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: build returns a stub params object; create returns a URL.
  mockBuildCheckoutParams.mockReturnValue({} as never);
  mockCreateInvoiceCheckoutSession.mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/pay/cs_test_123",
  });
  mockSetOrgConnectStatus.mockResolvedValue(undefined);
});

describe("POST /api/invoice-review/[token]/checkout", () => {
  // ── Guard 1: unknown token ──────────────────────────────────────────────────

  it("returns NOT_FOUND for an unknown token", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockGetOrgStripe).not.toHaveBeenCalled();
  });

  // ── Guard 1: void invoice ───────────────────────────────────────────────────

  it("returns NOT_FOUND for a void invoice", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(
      makeInvoice({ status: "void" })
    );

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockGetOrgStripe).not.toHaveBeenCalled();
  });

  // ── Guard 2: paid status ────────────────────────────────────────────────────

  it("returns INVOICE_ALREADY_PAID for a paid invoice", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(
      makeInvoice({ status: "paid" })
    );

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(mockGetOrgStripe).not.toHaveBeenCalled();
  });

  // ── Guard 3: no Stripe account ──────────────────────────────────────────────

  it("returns STRIPE_NOT_CONNECTED when org has no stripeConnectAccountId", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: null,
      stripeConnectStatus: null,
    });

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_NOT_CONNECTED");
    expect(mockReadAccountStatus).not.toHaveBeenCalled();
  });

  // ── Guard 4: inactive capability ────────────────────────────────────────────

  it("returns STRIPE_ACCOUNT_RESTRICTED when live status is not active", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: CONNECT_ACCOUNT_ID,
      stripeConnectStatus: "pending" as const,
    });
    mockReadAccountStatus.mockResolvedValueOnce("restricted");

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_ACCOUNT_RESTRICTED");
    // Must have persisted the refreshed status.
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(ORG_ID, "restricted");
    expect(mockCreateInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  // ── Guard 5: balance already zero (payments cover the full amount) ──────────

  it("returns INVOICE_ALREADY_PAID when payments cover the full balance", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(
      makeInvoice({ amount: 500, payments: [{ amount: 500 }] })
    );
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(mockCreateInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns { url } and passes correct balanceDueCents to buildCheckoutParams", async () => {
    // Invoice for $500, $150 already paid → $350 balance due → 35000 cents.
    const amount = 500;
    const paidAmount = 150;
    const expectedBalanceDue = amount - paidAmount; // 350
    const expectedCents = Math.round(expectedBalanceDue * 100); // 35000

    mockGetInvoiceByToken.mockResolvedValueOnce(
      makeInvoice({ amount, payments: [{ amount: paidAmount }] })
    );
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://checkout.stripe.com/pay/cs_test_123");

    // Verify buildCheckoutParams received the correct cents value.
    expect(mockBuildCheckoutParams).toHaveBeenCalledWith(
      expect.objectContaining({
        balanceDueCents: expectedCents,
        invoiceId: INVOICE_ID,
        invoiceNumber: INVOICE_NUMBER,
        orgId: ORG_ID,
      })
    );

    // Verify idempotency key encodes invoice id + balance cents.
    expect(mockCreateInvoiceCheckoutSession).toHaveBeenCalledWith(
      CONNECT_ACCOUNT_ID,
      expect.anything(),
      `inv-${INVOICE_ID}-bal-${expectedCents}`
    );

    // Active account: no live refresh needed.
    expect(mockReadAccountStatus).not.toHaveBeenCalled();
  });

  it("refreshes and caches status when cached status is pending, then proceeds if now active", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: CONNECT_ACCOUNT_ID,
      stripeConnectStatus: "pending" as const,
    });
    mockReadAccountStatus.mockResolvedValueOnce("active");

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    expect(mockReadAccountStatus).toHaveBeenCalledWith(CONNECT_ACCOUNT_ID);
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(ORG_ID, "active");
    // Should have proceeded to create a session.
    expect(mockCreateInvoiceCheckoutSession).toHaveBeenCalled();
  });

  it("uses the full invoice amount as balanceDueCents when there are no payments", async () => {
    const amount = 1250; // $1250.00 → 125000 cents
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);

    await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(mockBuildCheckoutParams).toHaveBeenCalledWith(
      expect.objectContaining({ balanceDueCents: 125000 })
    );
  });
});
