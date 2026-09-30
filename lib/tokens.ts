import { headers } from "next/headers";
import { after } from "next/server";
import { logError } from "@/lib/logger";

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
export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

async function readClientMeta(): Promise<ClientMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;
  return { ip, userAgent };
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
