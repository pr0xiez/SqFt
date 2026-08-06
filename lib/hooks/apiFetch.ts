/**
 * Shared fetch helper for `lib/hooks/*`. Every hook's query/mutation fn does
 * the same fetch + `res.ok` check + `readApiError` + `res.json()` dance —
 * this promotes that to one place so the server's actual `{code, message}`
 * always surfaces (never a fixed generic string). See CONTEXT.md / AGENTS.md
 * for the API error-code contract.
 *
 * A 204 (No Content) response — e.g. the DELETE routes' `return null` — never
 * has a JSON body, so it resolves to `undefined` rather than calling
 * `res.json()`.
 */

import { readApiError } from "@/lib/api/errors";

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  fallbackMessage = "Request failed"
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const { message } = await readApiError(res, fallbackMessage);
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
