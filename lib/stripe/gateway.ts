import type Stripe from "stripe";

export interface CreatedCheckoutSession {
  id: string;
  url: string | null;
  paymentIntentId: string | null;
}

/**
 * The Stripe seam. Business logic imports this port, not the SDK, so it is
 * unit-testable against the in-memory fake (mirrors lib/send/pipeline.ts).
 */
export interface StripeGateway {
  /** Create an Express controller-based connected account; returns its id. */
  createConnectAccount(orgId: string): Promise<{ id: string }>;
  /** Mint a single-use account-onboarding link. */
  createAccountLink(
    accountId: string,
    urls: { refreshUrl: string; returnUrl: string }
  ): Promise<{ url: string }>;
  /** Create a hosted Checkout Session from prebuilt params. */
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams
  ): Promise<CreatedCheckoutSession>;
  /** Retrieve a PaymentIntent with `latest_charge` expanded. */
  retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent>;
  /** Verify + parse a webhook payload. Throws on bad signature. */
  constructWebhookEvent(
    rawBody: string,
    signature: string | null
  ): Stripe.Event;
}
