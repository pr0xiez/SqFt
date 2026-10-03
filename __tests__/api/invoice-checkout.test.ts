/**
 * Tests for POST /api/invoice-review/[token]/checkout.
 * Mirrors the mocking pattern from __tests__/api/org-stripe-connect.test.ts:
 * mock each dependency module directly, import the handler after mocks, assert
 * guard semantics and the correct cents value passed to buildCheckoutParams.
 */
import Stripe from "stripe";
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

vi.mock("@/lib/repositories/organizationRepo", () => ({
  getOrgStripe: vi.fn(),
  setOrgConnectStatus: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  readAccountStatus: vi.fn(),
}));

// Only the Stripe calls are faked; isStripeError / describeStripeError stay
// real so the route's error mapping is exercised end to end.
vi.mock("@/lib/stripe/checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe/checkout")>()),
  buildCheckoutParams: vi.fn(),
  createInvoiceCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger")>()),
  logError: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { POST } from "@/app/api/invoice-review/[token]/checkout/route";
import { logError } from "@/lib/logger";
import { getInvoiceByToken } from "@/lib/repositories/invoiceRepo";
import {
  getOrgStripe,
  setOrgConnectStatus,
} from "@/lib/repositories/organizationRepo";
import {
  buildCheckoutParams,
  CHECKOUT_PARAMS_VERSION,
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
const mockLogError = vi.mocked(logError);

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

  it("maps a Stripe failure of the live status re-check to STRIPE_CHECKOUT_UNAVAILABLE (503) and logs the cause", async () => {
    // Cached status isn't active, so the route asks Stripe before creating a
    // session — and that read can fail for the same unfixable-by-the-homeowner
    // reasons as the create itself (here: a key missing a read permission).
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: CONNECT_ACCOUNT_ID,
      stripeConnectStatus: "pending" as const,
    });
    mockReadAccountStatus.mockRejectedValueOnce(
      new Stripe.errors.StripePermissionError({
        message:
          "The provided key 'rk_test_***abcd' does not have the required permissions for this endpoint.",
        statusCode: 403,
        requestId: "req_read123",
      })
    );

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_CHECKOUT_UNAVAILABLE");
    // Nothing learned, so nothing cached — and no session attempted.
    expect(mockSetOrgConnectStatus).not.toHaveBeenCalled();
    expect(mockCreateInvoiceCheckoutSession).not.toHaveBeenCalled();

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const logged = mockLogError.mock.calls[0]?.[0];
    expect(logged).toMatchObject({
      status: 503,
      orgId: ORG_ID,
      path: "/api/invoice-review/[REDACTED]/checkout",
    });
    expect(logged?.errorMessage).toContain(
      `Account status read failed on ${CONNECT_ACCOUNT_ID}`
    );
    expect(logged?.errorMessage).toContain("StripePermissionError");
    expect(logged?.errorMessage).toContain("requestId=req_read123");
  });

  it("keeps a non-Stripe failure of the live status re-check as INTERNAL (500)", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: CONNECT_ACCOUNT_ID,
      stripeConnectStatus: "pending" as const,
    });
    mockReadAccountStatus.mockRejectedValueOnce(
      new TypeError("Cannot read properties of undefined (reading 'merchant')")
    );

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERNAL");
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

    // Verify buildCheckoutParams received the correct cents value and a
    // future-dated expires_at (caps the stale-session window).
    expect(mockBuildCheckoutParams).toHaveBeenCalledWith(
      expect.objectContaining({
        balanceDueCents: expectedCents,
        invoiceId: INVOICE_ID,
        invoiceNumber: INVOICE_NUMBER,
        orgId: ORG_ID,
        expiresAt: expect.any(Number),
      })
    );
    const expiresAt =
      mockBuildCheckoutParams.mock.calls[0]?.[0]?.expiresAt ?? 0;
    // 60–90 min ahead: above Stripe's 30-min minimum, well under the 24h max.
    const aheadSec = expiresAt - Math.floor(Date.now() / 1000);
    expect(aheadSec).toBeGreaterThan(30 * 60);
    expect(aheadSec).toBeLessThanOrEqual(90 * 60);

    // Verify idempotency key encodes invoice id + balance cents + a 30-min bucket
    // (the bucket ties the key to the session's expires_at so re-clicks replay)
    // + the create-params version (so a deploy can't collide with old keys).
    expect(mockCreateInvoiceCheckoutSession).toHaveBeenCalledWith(
      CONNECT_ACCOUNT_ID,
      expect.anything(),
      expect.stringMatching(
        new RegExp(
          `^inv-${INVOICE_ID}-bal-${expectedCents}-\\d+-${CHECKOUT_PARAMS_VERSION}$`
        )
      )
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

  it("replays one versioned key per bucket + balance, and mints a new one when either changes", async () => {
    const BUCKET_MS = 30 * 60 * 1000;
    const bucketStart = 1_800_000_000_000; // a bucket boundary (bucket 1_000_000)
    const bucket = bucketStart / BUCKET_MS;
    const nowSpy = vi.spyOn(Date, "now");
    /** POST at `nowMs` for an invoice of `amount`; returns [key, expiresAt]. */
    async function checkoutAt(nowMs: number, amount = 200) {
      nowSpy.mockReturnValue(nowMs);
      mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount }));
      mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
      await POST(makePostRequest(), params({ token: TEST_TOKEN }));
      return [
        mockCreateInvoiceCheckoutSession.mock.lastCall?.[2],
        mockBuildCheckoutParams.mock.lastCall?.[0]?.expiresAt,
      ];
    }
    try {
      const [key, expiresAt] = await checkoutAt(bucketStart + 1_000);
      expect(key).toBe(
        `inv-${INVOICE_ID}-bal-20000-${bucket}-${CHECKOUT_PARAMS_VERSION}`
      );
      // Never the unversioned key the pre-version code minted for this bucket.
      expect(key).not.toBe(`inv-${INVOICE_ID}-bal-20000-${bucket}`);

      // Re-click later in the same bucket: identical key AND expires_at, so
      // Stripe replays the same session instead of rejecting the key.
      expect(await checkoutAt(bucketStart + BUCKET_MS - 1_000)).toEqual([
        key,
        expiresAt,
      ]);

      // Next bucket, or a changed balance: a fresh key.
      const [nextBucketKey] = await checkoutAt(bucketStart + BUCKET_MS + 1_000);
      expect(nextBucketKey).toBe(
        `inv-${INVOICE_ID}-bal-20000-${bucket + 1}-${CHECKOUT_PARAMS_VERSION}`
      );
      const [newBalanceKey] = await checkoutAt(bucketStart + 1_000, 150);
      expect(newBalanceKey).toBe(
        `inv-${INVOICE_ID}-bal-15000-${bucket}-${CHECKOUT_PARAMS_VERSION}`
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  // ── Finding #5: a once-active account later restricted by Stripe ────────────

  it("translates a create failure on a stale-active account to STRIPE_ACCOUNT_RESTRICTED", async () => {
    // Cached status is "active", so the fast path skips the live re-check — but
    // Stripe has since restricted the account and rejects the session create.
    // The customer must see the documented 409, not a generic 500, and the
    // cached status must be downgraded.
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Error("account charges disabled")
    );
    mockReadAccountStatus.mockResolvedValueOnce("restricted");

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_ACCOUNT_RESTRICTED");
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(ORG_ID, "restricted");
  });

  it("rethrows a non-Stripe error (500) when the account is still active but create fails for another reason", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Error("stripe network blip")
    );
    mockReadAccountStatus.mockResolvedValueOnce("active");

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERNAL");
  });

  // ── The graceful-degradation catch must not become a way to fail ────────────

  it("still returns STRIPE_ACCOUNT_RESTRICTED when the cache downgrade fails", async () => {
    // The catch block exists to turn a create failure into the documented
    // restricted error instead of a generic 500. Anything it throws on the way
    // there — here, the DB write — undoes that.
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Error("account cannot create sessions")
    );
    mockReadAccountStatus.mockResolvedValueOnce("restricted");
    mockSetOrgConnectStatus.mockRejectedValueOnce(new Error("db down"));

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_ACCOUNT_RESTRICTED");
  });

  it("surfaces the original error when the diagnostic re-read itself throws", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Error("stripe network blip")
    );
    mockReadAccountStatus.mockRejectedValueOnce(new Error("stripe is down"));

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERNAL");
  });

  // ── Stripe refuses for a reason other than restriction ──────────────────────

  it("maps a Stripe permission error on an active account to STRIPE_CHECKOUT_UNAVAILABLE (503) and logs the cause", async () => {
    // QA: the platform key lacked a permission. The homeowner used to get a
    // bare 500 "Server error"; now a typed 503 with a customer-safe message,
    // while the Stripe details land in the server log.
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Stripe.errors.StripePermissionError({
        message:
          "The provided key 'rk_test_***abcd' does not have the required permissions for this endpoint.",
        statusCode: 403,
        requestId: "req_perm123",
      })
    );
    mockReadAccountStatus.mockResolvedValueOnce("active");

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("STRIPE_CHECKOUT_UNAVAILABLE");
    expect(body.error.message).toMatch(/try again later/i);
    // Stripe's internals stay server-side.
    expect(body.error.message).not.toMatch(/permission|rk_|req_|stripe/i);
    // Still active: nothing to downgrade.
    expect(mockSetOrgConnectStatus).not.toHaveBeenCalled();

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const logged = mockLogError.mock.calls[0]?.[0];
    expect(logged).toMatchObject({ status: 503, orgId: ORG_ID });
    expect(logged?.errorMessage).toContain(CONNECT_ACCOUNT_ID);
    expect(logged?.errorMessage).toContain("StripePermissionError");
    expect(logged?.errorMessage).toContain("status=403");
    expect(logged?.errorMessage).toContain("requestId=req_perm123");
    // The review token is the public page's only credential — never logged.
    expect(logged?.path).toBe("/api/invoice-review/[REDACTED]/checkout");
  });

  it("maps a Stripe connection error to STRIPE_CHECKOUT_UNAVAILABLE even when the diagnostic re-read fails too", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({
        message: "An error occurred with our connection to Stripe.",
        detail: new Error("getaddrinfo ENOTFOUND api.stripe.com"),
      })
    );
    mockReadAccountStatus.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "still down" })
    );

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_CHECKOUT_UNAVAILABLE");
    // The ORIGINAL create failure is what gets logged, not the re-read's.
    expect(mockLogError.mock.calls[0]?.[0]?.errorMessage).toContain(
      "cause=getaddrinfo ENOTFOUND api.stripe.com"
    );
  });

  it("still returns STRIPE_ACCOUNT_RESTRICTED when the Stripe error comes from a now-restricted account", async () => {
    // Restriction wins over the generic 503: it's the documented, more
    // specific answer, and the cached status must still be downgraded.
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    mockCreateInvoiceCheckoutSession.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        message: "This account cannot currently make charges.",
        statusCode: 400,
        requestId: "req_restricted1",
      })
    );
    mockReadAccountStatus.mockResolvedValueOnce("restricted");

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STRIPE_ACCOUNT_RESTRICTED");
    expect(mockSetOrgConnectStatus).toHaveBeenCalledWith(ORG_ID, "restricted");
  });

  // ── Finding #4: empty-string base URL must not produce relative Stripe URLs ─

  it("builds absolute success/cancel URLs even when STRIPE_PUBLIC_BASE_URL is empty", async () => {
    // `.env.example` ships STRIPE_PUBLIC_BASE_URL= (empty). `"" ?? origin` keeps
    // the empty string, which yielded relative URLs Stripe rejects. The resolver
    // must ignore it and produce an absolute URL.
    const prev = process.env.STRIPE_PUBLIC_BASE_URL;
    process.env.STRIPE_PUBLIC_BASE_URL = "";
    try {
      mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice({ amount: 200 }));
      mockGetOrgStripe.mockResolvedValueOnce(activeOrg);

      await POST(makePostRequest(), params({ token: TEST_TOKEN }));

      const arg = mockBuildCheckoutParams.mock.calls[0]?.[0] as {
        successUrl: string;
        cancelUrl: string;
      };
      expect(arg.successUrl).toMatch(
        /^https?:\/\/.+\/invoice-review\/.+pay=success/
      );
      expect(arg.cancelUrl).toMatch(
        /^https?:\/\/.+\/invoice-review\/.+pay=cancelled/
      );
    } finally {
      if (prev === undefined) delete process.env.STRIPE_PUBLIC_BASE_URL;
      else process.env.STRIPE_PUBLIC_BASE_URL = prev;
    }
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
