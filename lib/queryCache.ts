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
 * the new shape (there is no per-query versioning). Bumping also purges any
 * cache written before the persistence policy became stricter — otherwise the
 * already-written sensitive data would sit in localStorage until its 24h
 * `maxAge` expired on its own.
 */
export const QUERY_CACHE_BUSTER = "2026-09-session-data-not-persisted";

/** Only explicitly reviewed, non-personal configuration may outlive a session.
 * New query families are not persisted by default: many carry nested PII. */
const PERSISTABLE = new Set<string>(["line-item-templates"]);

export function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  return PERSISTABLE.has(String(queryKey[0]));
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
