import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, params } from "./_helpers";

// Mock tenant so the real module (which pulls in next-auth → next/server) never
// loads — publicRoute never calls into it anyway.
vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));

// publicRoute schedules logging via next/server's after(), which throws
// outside a real request scope — run the callback synchronously in tests.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

const getInvoicePayContext = vi.fn();
const setInvoicePaymentIntent = vi.fn();
vi.mock("@/lib/repositories", () => ({
  getInvoicePayContext,
  setInvoicePaymentIntent,
}));

const createCheckoutSession = vi.fn();
vi.mock("@/lib/stripe/realGateway", () => ({
  realGateway: { createCheckoutSession },
}));
vi.mock("@/lib/baseUrl", () => ({
  getPublicBaseUrl: () => "https://app.test",
}));

const { GET } = await import("@/app/api/invoice-review/[token]/pay/route");

function call(token = "tok1234567890abcd") {
  return GET(
    makeRequest("GET", `https://app.test/api/invoice-review/${token}/pay`),
    params({ token }) as never
  );
}

beforeEach(() => vi.clearAllMocks());

const ready = {
  invoiceId: 1,
  orgId: "org1",
  invoiceNumber: 7,
  status: "sent",
  balanceDueCents: 50000,
  connectAccountId: "acct_org",
  chargesEnabled: true,
  customerEmail: "c@example.com",
};

describe("GET /api/invoice-review/[token]/pay", () => {
  it("303-redirects to the Stripe Checkout url and stamps the PI", async () => {
    getInvoicePayContext.mockResolvedValue(ready);
    createCheckoutSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.test/pay",
      paymentIntentId: "pi_1",
    });
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://checkout.stripe.test/pay"
    );
    expect(setInvoicePaymentIntent).toHaveBeenCalledWith(1, "org1", "pi_1");
  });

  it("404s when the token resolves to nothing", async () => {
    getInvoicePayContext.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("409 STRIPE_NOT_CONNECTED when the org isn't charges-enabled", async () => {
    getInvoicePayContext.mockResolvedValue({ ...ready, chargesEnabled: false });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("STRIPE_NOT_CONNECTED");
  });

  it("409 INVOICE_ALREADY_PAID when there's no balance", async () => {
    getInvoicePayContext.mockResolvedValue({ ...ready, balanceDueCents: 0 });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVOICE_ALREADY_PAID");
  });
});
