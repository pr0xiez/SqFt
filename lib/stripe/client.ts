import Stripe from "stripe";

/** Pinned for the whole app; bump deliberately. */
const API_VERSION = "2026-06-24.dahlia";

let _client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeMode(): "test" | "live" | "unconfigured" {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "unconfigured";
  // rk_test_… / sk_test_… → test; rk_live_… / sk_live_… → live.
  return key.includes("_test_") ? "test" : "live";
}

/** Lazy singleton, mirroring lib/email/client.ts. Throws if unconfigured. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_client) {
    _client = new Stripe(key, {
      apiVersion: API_VERSION as Stripe.LatestApiVersion,
    });
  }
  return _client;
}
