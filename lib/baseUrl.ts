/**
 * Returns the absolute base URL for building user-facing links (no trailing slash).
 *
 * Resolution order:
 *   1. `PUBLIC_BASE_URL`               — explicit override, wins.
 *   2. On preview deployments         — use `VERCEL_BRANCH_URL` (stable per
 *      (`VERCEL_ENV=preview`)            branch, e.g. `sqft-git-<branch>-…`)
 *                                       in preference to `VERCEL_URL` (which
 *                                       changes with every deployment). This
 *                                       keeps email links pointing at the
 *                                       same hostname the user is testing on,
 *                                       which matters for auth cookies and
 *                                       Vercel deployment-protection cookies.
 *   3. On production deployments      — use `VERCEL_PROJECT_PRODUCTION_URL`
 *      (`VERCEL_ENV=production`)        (your stable custom domain).
 *   4. Fallbacks                      — `VERCEL_PROJECT_PRODUCTION_URL` →
 *                                       `VERCEL_BRANCH_URL` → `VERCEL_URL`
 *                                       (e.g. self-hosted), else
 *                                       `http://localhost:3000`.
 *
 * Vercel's URL env vars never include a protocol, so `https://` is prepended.
 */
export function getPublicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const env = process.env.VERCEL_ENV;
  const branch = process.env.VERCEL_BRANCH_URL;
  const deployment = process.env.VERCEL_URL;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (env === "preview") {
    if (branch) return `https://${branch}`;
    if (deployment) return `https://${deployment}`;
  }
  if (env === "production" && prod) {
    return `https://${prod}`;
  }

  // Fallbacks for unusual setups (e.g. VERCEL_ENV unset)
  if (prod) return `https://${prod}`;
  if (branch) return `https://${branch}`;
  if (deployment) return `https://${deployment}`;

  return "http://localhost:3000";
}
