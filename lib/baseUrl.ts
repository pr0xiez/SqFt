/**
 * Returns the absolute base URL for building user-facing links (no trailing slash).
 *
 * Resolution order:
 *   1. `PUBLIC_BASE_URL`               — explicit override, wins.
 *   2. On preview deployments         — use `VERCEL_URL` (the per-deployment
 *      (`VERCEL_ENV=preview`)            hostname), so a preview links to
 *                                       itself and you can test changes end
 *                                       to end without leaking traffic to prod.
 *   3. On production deployments      — use `VERCEL_PROJECT_PRODUCTION_URL`
 *      (`VERCEL_ENV=production`)        (your stable custom domain).
 *   4. Fallbacks                      — any `VERCEL_PROJECT_PRODUCTION_URL`
 *                                       then `VERCEL_URL` if env isn't set
 *                                       (e.g. self-hosted), else
 *                                       `http://localhost:3000`.
 *
 * Vercel's URL env vars never include a protocol, so `https://` is prepended.
 */
export function getPublicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const env = process.env.VERCEL_ENV;
  const deployment = process.env.VERCEL_URL;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (env === "preview" && deployment) {
    return `https://${deployment}`;
  }
  if (env === "production" && prod) {
    return `https://${prod}`;
  }

  // Fallbacks for unusual setups (e.g. VERCEL_ENV unset)
  if (prod) return `https://${prod}`;
  if (deployment) return `https://${deployment}`;

  return "http://localhost:3000";
}
