const ENV = process.env.NODE_ENV ?? "development";

// Path segments whose next segment is a public-review token — the sole
// credential for those routes (see lib/publicRoutes.ts) — and must never
// reach logs in plaintext.
const TOKEN_ROUTE_SEGMENTS = new Set(["estimate-review", "invoice-review"]);
const REDACTED = "[REDACTED]";

/**
 * Redacts the token segment from public estimate/invoice review paths before
 * logging, e.g. `/api/estimate-review/<token>/approve` ->
 * `/api/estimate-review/[REDACTED]/approve`. Non-review paths (the vast
 * majority of traffic) are returned unchanged. This is the single shared
 * helper for both log call sites (proxy.ts and lib/api/route.ts) so they
 * can't drift apart — see issue #301.
 */
export function maskTokenPath(path: string): string {
  const segments = path.split("/");
  for (let i = 0; i < segments.length - 1; i++) {
    if (TOKEN_ROUTE_SEGMENTS.has(segments[i]) && segments[i + 1]) {
      segments[i + 1] = REDACTED;
    }
  }
  return segments.join("/");
}

function write(entry: Record<string, unknown>): void {
  console.log(JSON.stringify(entry));
}

export function logRequest(ctx: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  orgId: string;
}): void {
  write({ type: "request", ts: new Date().toISOString(), env: ENV, ...ctx });
}

export function logMutation(ctx: {
  method: string;
  path: string;
  status: number;
  orgId: string;
}): void {
  const resource = ctx.path.split("/")[2] ?? "unknown";
  write({
    type: "mutation",
    ts: new Date().toISOString(),
    env: ENV,
    resource,
    ...ctx,
  });
}

export function logError(ctx: {
  method?: string;
  path?: string;
  orgId?: string;
  status?: number;
  errorMessage?: string;
  err?: unknown;
}): void {
  const { err, ...rest } = ctx;
  write({ type: "error", ts: new Date().toISOString(), env: ENV, ...rest });
  if (err !== undefined) {
    console.error(err);
  }
}
