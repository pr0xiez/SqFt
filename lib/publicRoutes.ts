/**
 * Token-authed public surfaces that the auth proxy must let through without a
 * session. The token in the URL is the credential; each route still validates
 * it server-side. Any new public page/API MUST be added here or the proxy will
 * redirect customers to /login (see proxy.ts).
 */
const PUBLIC_REVIEW_PREFIXES = [
  // Public estimate page + its approve/decline API. The API routes enforce
  // their own token auth inside the handler.
  "/estimate-review/",
  "/api/estimate-review/",
  // Public invoice page + its pay/confirm/webhook APIs. Each enforces its own
  // token (or Stripe signature) auth inside the handler.
  "/invoice-review/",
  "/api/invoice-review/",
  "/api/webhooks/stripe",
  // QBO cron sweeper (CRON_SECRET bearer auth inside the handler).
  "/api/qbo/sync/run",
  // Test-only mock QBO realm — every route in it 404s unless
  // QBO_ENVIRONMENT=mock (and never mounts in production).
  "/api/qbo-mock/",
];

export function isPublicReviewPath(pathname: string): boolean {
  return PUBLIC_REVIEW_PREFIXES.some((p) => pathname.startsWith(p));
}
