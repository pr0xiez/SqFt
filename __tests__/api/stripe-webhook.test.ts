import { beforeEach, describe, expect, it, vi } from "vitest";

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/stripe/realGateway", () => ({
  realGateway: { constructWebhookEvent },
}));

const handleStripeEvent = vi.fn();
vi.mock("@/lib/stripe/webhookHandler", () => ({
  handleStripeEvent,
  buildProdWebhookDeps: () => ({}),
}));

const { POST } = await import("@/app/api/stripe/webhook/route");

function post(body = "{}", sig: string | null = "t=1,v1=abc") {
  const headers = new Headers();
  if (sig !== null) headers.set("stripe-signature", sig);
  return POST(
    new Request("https://app.test/api/stripe/webhook", {
      method: "POST",
      body,
      headers,
    }) as never
  );
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/stripe/webhook", () => {
  it("verifies the signature, dispatches, and returns 200", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_1", type: "x", data: {} });
    handleStripeEvent.mockResolvedValue(undefined);
    const res = await post();
    expect(res.status).toBe(200);
    expect(handleStripeEvent).toHaveBeenCalledOnce();
  });

  it("returns 400 and dispatches nothing on a bad signature", async () => {
    constructWebhookEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await post("{}", "bad");
    expect(res.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });
});
