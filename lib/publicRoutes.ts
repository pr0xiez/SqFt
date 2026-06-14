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
  // Public invoice page (linked from every invoice email). It is a server
  // component reading by token directly.
  "/invoice-review/",
  // Public pay entrypoint: creates a Checkout Session for the live balance and
  // 303s to Stripe. Token in the URL is the credential.
  "/api/invoice-review/",
];

export function isPublicReviewPath(pathname: string): boolean {
  return PUBLIC_REVIEW_PREFIXES.some((p) => pathname.startsWith(p));
}
