import { logError } from "@/lib/logger";

/**
 * Fire-and-forget "viewed" tracking for the public estimate/invoice review
 * pages. Both pages kick off a mark-viewed write without awaiting it (the
 * page must render regardless of whether the write lands), but a rejected
 * write must not vanish silently — catch it here and log enough context
 * (document type + id) to find it in the logs.
 *
 * `write` is the already-invoked repo call (e.g. `markInvoiceViewed(id, …)`)
 * so the write starts immediately; this only attaches error handling to it.
 */
export function trackViewed(
  doc: "invoice" | "estimate",
  id: number,
  write: Promise<unknown>
): void {
  write.catch((err) => {
    logError({
      path: `/${doc}-review`,
      errorMessage: `mark${doc === "invoice" ? "Invoice" : "Estimate"}Viewed failed for ${doc} ${id}`,
      err,
    });
  });
}
