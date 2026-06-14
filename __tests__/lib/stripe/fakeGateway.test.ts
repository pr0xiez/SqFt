import { describe, expect, it } from "vitest";
import { makeFakeGateway } from "@/lib/stripe/fakeGateway";

describe("makeFakeGateway", () => {
  it("records calls and returns canned objects", async () => {
    const g = makeFakeGateway();
    const acct = await g.createConnectAccount("org1");
    expect(acct.id).toMatch(/^acct_/);
    expect(g.calls.map((c) => c.name)).toContain("createConnectAccount");

    const link = await g.createAccountLink("acct_x", {
      refreshUrl: "r",
      returnUrl: "ret",
    });
    expect(link.url).toContain("https://connect.stripe.test");
  });

  it("returns a queued PaymentIntent from retrievePaymentIntent", async () => {
    const g = makeFakeGateway({
      paymentIntents: {
        pi_1: {
          id: "pi_1",
          amount: 5000,
          amount_received: 5000,
          latest_charge: {
            id: "ch_1",
            payment_method_details: { type: "card" },
          },
          transfer_data: { destination: "acct_org" },
          metadata: { invoiceId: "42", orgId: "org1" },
        } as never,
      },
    });
    const pi = await g.retrievePaymentIntent("pi_1");
    expect(pi.id).toBe("pi_1");
    expect((pi.latest_charge as { id: string }).id).toBe("ch_1");
  });
});
