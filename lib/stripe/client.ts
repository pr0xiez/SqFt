import Stripe from "stripe";

// Lazy, server-only singleton (mirrors lib/email/client.ts). Returns null when
// STRIPE_SECRET_KEY is unset so module-load never instantiates — CI, worktrees,
// and unit tests stay green without a key. Routes that need Stripe go through
// the gateway, which throws a typed error when the client is null.
let _client: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // apiVersion is intentionally omitted so the installed SDK's pinned version
  // applies (avoids a version-literal mismatch). Pin explicitly later if needed.
  if (!_client) _client = new Stripe(key);
  return _client;
}
