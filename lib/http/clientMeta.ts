import type { NextRequest } from "next/server";

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Extract the client IP (first hop of X-Forwarded-For) and User-Agent from a
 * request, for writing into audit columns (e.g. EstimateEvent.ip/userAgent).
 * Returns `null` when a header is absent — the single agreed default shared
 * by every caller, matching the nullable DB columns these values feed. Don't
 * hand-roll this extraction per route; every public-token action that logs
 * client metadata should call this instead so the audit trail doesn't grow a
 * different sentinel per route.
 */
export function clientMeta(req: NextRequest): ClientMeta {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}
