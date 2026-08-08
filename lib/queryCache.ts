/**
 * Persisted react-query cache policy, in one place so the provider that writes
 * the cache and the sign-out button that has to drop it agree on the key.
 * See components/ui/Providers.tsx.
 */

/** localStorage key holding the dehydrated query cache. */
export const QUERY_CACHE_KEY = "sqft-query-cache";

/**
 * Bump when the shape of anything persisted changes. A persisted cache written
 * before the bump is discarded rather than rehydrated into code that expects
 * the new shape (there is no per-query versioning).
 */
export const QUERY_CACHE_BUSTER = "2026-08-qbo-sync";

/**
 * Query keys that must never be written to localStorage. `stripe-connect`
 * carries Stripe's identity-verification failure text — the reason a person's
 * ID or tax id was rejected — which has no business sitting in the browser for
 * 24 hours, outliving the session that fetched it, on what may be a shared
 * machine. `qbo-status` carries the org's Intuit realm id, company name, and
 * the lastError text of failed accounting pushes — same rule.
 */
const NEVER_PERSIST = new Set<string>(["stripe-connect", "qbo-status"]);

export function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  return !NEVER_PERSIST.has(String(queryKey[0]));
}

/**
 * Drop the persisted cache. Called on sign-out: `queryClient.clear()` only
 * empties the in-memory cache, and the persister would happily rehydrate the
 * previous user's data for whoever signs in next.
 */
export function clearPersistedQueryCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {
    // Storage can be unavailable (private mode, disabled cookies). Nothing to
    // clear in that case — the cache was never written either.
  }
}
