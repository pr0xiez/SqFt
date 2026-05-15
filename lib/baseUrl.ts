/**
 * Returns the absolute base URL for building user-facing links (no trailing slash).
 *
 * Resolution order:
 *   1. `PUBLIC_BASE_URL`               — explicit override, wins.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's stable production hostname,
 *                                       set on every deployment (incl. previews).
 *                                       Use this so preview deployments still
 *                                       link to the real prod, not their own
 *                                       throwaway URL.
 *   3. `VERCEL_URL`                    — the per-deployment Vercel hostname.
 *                                       Last-resort: only reached on a Vercel
 *                                       deploy that has no production URL yet.
 *   4. `http://localhost:3000`         — local dev.
 *
 * Vercel's URL env vars never include a protocol, so `https://` is prepended.
 */
export function getPublicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;

  const deployment = process.env.VERCEL_URL;
  if (deployment) return `https://${deployment}`;

  return "http://localhost:3000";
}
