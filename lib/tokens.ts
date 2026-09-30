import { headers } from "next/headers";
import { type ClientMeta, clientMetaFromHeaders } from "@/lib/http/clientMeta";

/**
 * Public-review token shape guard. Tokens are `randomBytes(32).toString("base64url")`
 * (see `generateToken` in `lib/repositories/estimateRepo.ts` / `invoiceRepo.ts`):
 * unpadded base64url of 32 bytes, always exactly `ceil(32 * 8 / 6) = 43` chars
 * from the base64url alphabet. Reject anything else before hitting the DB.
 */
export function isValidTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** IP + user-agent pulled from request headers, for view-tracking events. */
export type { ClientMeta } from "@/lib/http/clientMeta";

async function readClientMeta(): Promise<ClientMeta> {
  return clientMetaFromHeaders(await headers());
}

/**
 * Shared spine for public-review-page view tracking: when `shouldTrack` is
 * true, pulls the client meta from request headers and fires `markViewed`
 * (deliberately not awaited — the page render must not block on the write).
 * Each public page passes its own model-specific `markEstimateViewed` /
 * `markInvoiceViewed` call plus its own status gate.
 */
export async function trackPublicView(
  shouldTrack: boolean,
  markViewed: (meta: ClientMeta) => Promise<void> | void
): Promise<void> {
  if (!shouldTrack) return;
  const meta = await readClientMeta();
  void markViewed(meta);
}
