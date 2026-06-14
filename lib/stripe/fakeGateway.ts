import type Stripe from "stripe";
import type { CreatedCheckoutSession, StripeGateway } from "./gateway";

export interface FakeCall {
  name: string;
  args: unknown;
}

export interface FakeGatewayConfig {
  /** PaymentIntents returned by retrievePaymentIntent, keyed by id. */
  paymentIntents?: Record<string, Stripe.PaymentIntent>;
  /** Override the next created session. */
  session?: Partial<CreatedCheckoutSession>;
  /** When set, constructWebhookEvent returns it; when "throw", it throws. */
  webhookEvent?: Stripe.Event | "throw";
}

export interface FakeGateway extends StripeGateway {
  calls: FakeCall[];
}

export function makeFakeGateway(config: FakeGatewayConfig = {}): FakeGateway {
  const calls: FakeCall[] = [];
  let seq = 0;
  const record = (name: string, args: unknown) => calls.push({ name, args });

  return {
    calls,
    async createConnectAccount(orgId) {
      record("createConnectAccount", { orgId });
      return { id: `acct_${++seq}` };
    },
    async createAccountLink(accountId, urls) {
      record("createAccountLink", { accountId, urls });
      return { url: `https://connect.stripe.test/setup/${accountId}` };
    },
    async createCheckoutSession(params) {
      record("createCheckoutSession", params);
      return {
        id: config.session?.id ?? `cs_${++seq}`,
        url: config.session?.url ?? "https://checkout.stripe.test/pay",
        paymentIntentId: config.session?.paymentIntentId ?? `pi_${seq}`,
      };
    },
    async retrievePaymentIntent(id) {
      record("retrievePaymentIntent", { id });
      const pi = config.paymentIntents?.[id];
      if (!pi) throw new Error(`fake: no PaymentIntent ${id}`);
      return pi;
    },
    constructWebhookEvent(rawBody, signature) {
      record("constructWebhookEvent", { rawBody, signature });
      if (config.webhookEvent === "throw" || !config.webhookEvent) {
        throw new Error("fake: bad signature");
      }
      return config.webhookEvent;
    },
  };
}
