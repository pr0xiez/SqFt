/**
 * Tests for POST /api/invoice-review/[token]/confirm.
 * Mirrors the mocking pattern from __tests__/api/invoice-checkout.test.ts:
 * mock each dependency module directly, import the handler after mocks, assert
 * guard semantics and the correct recordStripePayment args.
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
  recordStripePayment: vi.fn(),
}));

vi.mock("@/lib/repositories/orgRepo", () => ({
  getOrgStripe: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { POST } from "@/app/api/invoice-review/[token]/confirm/route";
import {
  getInvoiceByToken,
  recordStripePayment,
} from "@/lib/repositories/invoiceRepo";
import { getOrgStripe } from "@/lib/repositories/orgRepo";
import { getStripe } from "@/lib/stripe/client";

const mockGetInvoiceByToken = vi.mocked(getInvoiceByToken);
const mockRecordStripePayment = vi.mocked(recordStripePayment);
const mockGetOrgStripe = vi.mocked(getOrgStripe);
const mockGetStripe = vi.mocked(getStripe);

const TEST_TOKEN = "test-token-xyz789";
const ORG_ID = "org1";
const INVOICE_ID = 42;
const CONNECT_ACCOUNT_ID = "acct_test123";
const SESSION_ID = "cs_test_abc123";
const PI_ID = "pi_test_abc";
const CHARGE_ID = "ch_test_abc";

function makeInvoice(overrides: { status?: string } = {}) {
  return {
    id: INVOICE_ID,
    orgId: ORG_ID,
    invoiceNumber: 1001,
    status: overrides.status ?? "sent",
    amount: 500,
    payments: [],
    // biome-ignore lint/suspicious/noExplicitAny: partial fixture
  } as any;
}

function makePostRequest(body: unknown = { sessionId: SESSION_ID }) {
  return makeRequest(
    "POST",
    `http://localhost/api/invoice-review/${TEST_TOKEN}/confirm`,
    body
  );
}

const activeOrg = {
  name: "Acme Floors",
  stripeConnectAccountId: CONNECT_ACCOUNT_ID,
  stripeConnectStatus: "active" as const,
};

/** Build a mock Stripe client with a controllable checkout session retrieve. */
function makeStripeMock(
  sessionOverrides: Partial<{
    status: string;
    payment_status: string;
    amount_total: number;
    payment_intent: unknown;
    metadata: { invoiceId: string };
  }> = {}
) {
  const session = {
    payment_status: "paid",
    amount_total: 50000,
    metadata: { invoiceId: String(INVOICE_ID) },
    payment_intent: {
      id: PI_ID,
      latest_charge: {
        id: CHARGE_ID,
        balance_transaction: { fee: 175, net: 49825 },
      },
    },
    ...sessionOverrides,
  };
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue(session),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecordStripePayment.mockResolvedValue({ recorded: true });
});

describe("POST /api/invoice-review/[token]/confirm", () => {
  // ── Guard: unknown token ────────────────────────────────────────────────────

  it("returns NOT_FOUND for an unknown token", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockGetOrgStripe).not.toHaveBeenCalled();
  });

  // ── Guard: void invoice ─────────────────────────────────────────────────────

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

  // ── Guard: no Stripe account ────────────────────────────────────────────────

  it("returns NOT_FOUND when org has no stripeConnectAccountId", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce({
      name: "Acme Floors",
      stripeConnectAccountId: null,
      stripeConnectStatus: null,
    });

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ── Guard: session bound to a different invoice ─────────────────────────────

  it("returns NOT_FOUND when the session's metadata.invoiceId does not match the invoice", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    // A paid session that belongs to a DIFFERENT invoice (same org). The guard
    // must reject it before recording, so one invoice's session can't be applied
    // to another's token.
    const mismatchMock = makeStripeMock({ metadata: { invoiceId: "999" } });
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(mismatchMock as any);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockRecordStripePayment).not.toHaveBeenCalled();
  });

  // ── Pending: unpaid session ─────────────────────────────────────────────────

  it("returns { status: 'pending' } and does NOT call recordStripePayment when session is unpaid", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    const unpaidMock = makeStripeMock({ payment_status: "unpaid" });
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(unpaidMock as any);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
    expect(mockRecordStripePayment).not.toHaveBeenCalled();
  });

  it("returns { status: 'pending' } and does NOT call recordStripePayment when session is open", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    const openMock = makeStripeMock({ payment_status: "open" });
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(openMock as any);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
    expect(mockRecordStripePayment).not.toHaveBeenCalled();
  });

  // ── Processing: async bank debit in flight ──────────────────────────────────

  it("returns { status: 'processing' } for a complete-but-unpaid session (ACH in flight)", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    // Customer finished Checkout with a bank debit: session complete, funds not
    // settled. Must NOT record — settlement lands later via the webhook.
    const processingMock = makeStripeMock({
      status: "complete",
      payment_status: "unpaid",
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(processingMock as any);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("processing");
    expect(mockRecordStripePayment).not.toHaveBeenCalled();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("calls recordStripePayment with correct args and returns { status: 'paid' } when session is paid", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    const stripeMock = makeStripeMock();
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(stripeMock as any);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("paid");

    expect(mockRecordStripePayment).toHaveBeenCalledWith({
      paymentIntentId: PI_ID,
      chargeId: CHARGE_ID,
      orgId: ORG_ID,
      invoiceId: INVOICE_ID,
      amount: 500, // 50000 / 100
      feeAmount: 1.75, // 175 / 100
      netAmount: 498.25, // 49825 / 100
    });

    // Verify session retrieve was called with the right expand and stripeAccount.
    expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(
      SESSION_ID,
      { expand: ["payment_intent.latest_charge.balance_transaction"] },
      { stripeAccount: CONNECT_ACCOUNT_ID }
    );
  });

  // ── Edge: missing balance_transaction ──────────────────────────────────────

  it("records with null fee/net when balance_transaction is null", async () => {
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    const stripeMock = makeStripeMock({
      payment_intent: {
        id: PI_ID,
        latest_charge: { id: CHARGE_ID, balance_transaction: null },
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(stripeMock as any);

    await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(mockRecordStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ feeAmount: null, netAmount: null })
    );
  });

  // ── Edge: missing latest_charge → defer to the webhook ──────────────────────

  it("returns pending and does NOT record when latest_charge is not yet attached", async () => {
    // Recording under a synthetic pi_-id here would diverge from the real ch_-id
    // the webhook later records → two Payment rows for one charge. Instead, defer:
    // report pending and let the signature-verified webhook be the source of truth.
    mockGetInvoiceByToken.mockResolvedValueOnce(makeInvoice());
    mockGetOrgStripe.mockResolvedValueOnce(activeOrg);
    const stripeMock = makeStripeMock({
      payment_intent: { id: PI_ID, latest_charge: null },
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock duck-type
    mockGetStripe.mockReturnValueOnce(stripeMock as any);

    const res = await POST(makePostRequest(), params({ token: TEST_TOKEN }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
    expect(mockRecordStripePayment).not.toHaveBeenCalled();
  });
});
