/**
 * Low-level HTTP request helpers shared by public (token-authed) routes and
 * pages.
 */

// Structurally matches both a Fetch `Headers` (from `Request.headers`) and
// Next's `ReadonlyHeaders` (from `next/headers`'s `headers()`), so callers
// can pass either without converting.
type HeaderSource = { get(name: string): string | null };

/**
 * Best-effort client IP for forensic/audit purposes (e.g. the estimate
 * approval/decline audit trail, or view-tracking timestamps).
 *
 * `X-Forwarded-For` is fully client-settable — it is not on the Fetch
 * spec's forbidden-header list, so any caller can forge it, and even when a
 * real proxy also appends the true IP, taking the left-most comma-separated
 * entry picks the attacker-supplied value rather than the trustworthy hop.
 * This app deploys on Vercel, which populates `x-vercel-forwarded-for` (and
 * `x-real-ip`) from the actual TCP connection — those are not attacker
 * settable via arbitrary request headers the way `x-forwarded-for` is, so
 * prefer them. Only fall back to `x-forwarded-for` as a last resort (e.g.
 * local dev / non-Vercel deployments), where it's best-effort only and must
 * never be treated as authoritative.
 */
export function getClientIp(headers: HeaderSource): string {
  const vercelForwardedFor = headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor)
    return vercelForwardedFor.split(",")[0]?.trim() ?? "unknown";

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // Best-effort only: in a non-Vercel deployment there is no trusted proxy
  // hop, so this header is attacker-settable and not authoritative.
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";

  return "unknown";
}
