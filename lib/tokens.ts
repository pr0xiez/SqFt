import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { type ClientMeta, clientMetaFromHeaders } from "@/lib/http/clientMeta";
import { logError } from "@/lib/logger";

/**
 * Mint a public-review token: `randomBytes(32).toString("base64url")`. The one
 * generator behind estimate approval tokens and invoice public tokens;
 * `isValidTokenShape` below is derived from this shape.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Public-review token shape guard. Tokens come from `generateToken` above:
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
 * true, reads request metadata during render and schedules `markViewed` with
 * Next's after() so the serverless response lifecycle keeps the write alive.
 * Failures are logged without preventing the customer from reading the page.
 * Each public page passes its own model-specific `markEstimateViewed` /
 * `markInvoiceViewed` call plus its own status gate.
 */
export async function trackPublicView(
  shouldTrack: boolean,
  markViewed: (meta: ClientMeta) => Promise<void> | void,
  document: { type: "estimate" | "invoice"; id: number }
): Promise<void> {
  if (!shouldTrack) return;
  const meta = await readClientMeta();
  after(async () => {
    try {
      await markViewed(meta);
    } catch (err) {
      logError({
        path: `/${document.type}-review`,
        errorMessage: `mark-viewed write failed for ${document.type} ${document.id}`,
        err,
      });
    }
  });
}
