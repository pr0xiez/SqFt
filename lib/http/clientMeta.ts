import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/request";

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Extract the client IP through the deployment-aware helper and User-Agent from a
 * request, for writing into audit columns (e.g. EstimateEvent.ip/userAgent).
 * Returns `null` when a header is absent — the single agreed default shared
 * by every caller, matching the nullable DB columns these values feed. Don't
 * hand-roll this extraction per route; every public-token action that logs
 * client metadata should call this instead so the audit trail doesn't grow a
 * different sentinel per route.
 */
export function clientMeta(req: NextRequest): ClientMeta {
  return clientMetaFromHeaders(req.headers);
}

/** Shared by route handlers and public server components. */
export function clientMetaFromHeaders(h: Headers): ClientMeta {
  const ip = getClientIp(h);
  const userAgent = h.get("user-agent")?.trim();
  return {
    ip: !ip || ip === "unknown" ? null : ip,
    userAgent: !userAgent || userAgent === "unknown" ? null : userAgent,
  };
}
