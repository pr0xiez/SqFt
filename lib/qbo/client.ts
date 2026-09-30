/**
 * Thin typed fetch client for the QBO Accounting API. No SDK: the surface we
 * need is ~5 entities, and the stale `node-quickbooks` package would be a
 * bigger liability than raw fetch. Every call pins minorversion=75 (older
 * versions are retired) and Fault envelopes are parsed into a typed
 * `QboApiError` so the sync engine can branch on failure *kind* rather than
 * string-matching Intuit messages.
 */

import { mockProtectionHeaders, QBO_MINORVERSION } from "./config";

/** Per-request cap on Accounting API calls. */
export const QBO_FETCH_TIMEOUT_MS = 15_000;

export type QboFaultKind =
  | "auth" // 401 / expired or revoked token — pause, don't retry
  | "duplicate_name" // 6240: DisplayName collides with customer/vendor/employee
  | "duplicate_docnum" // 6140: DocNumber already used (company has dup-check on)
  | "stale_object" // 5010: SyncToken out of date — re-read and retry once
  | "not_found" // 610/620: object not found
  | "throttle" // 429: per-realm rate limit — retry with backoff
  | "validation" // 2xxx/6xxx business validation
  | "other";

export class QboApiError extends Error {
  readonly kind: QboFaultKind;
  readonly status: number;
  readonly faultCode: string | null;
  readonly detail: string | null;

  constructor(args: {
    kind: QboFaultKind;
    status: number;
    message: string;
    faultCode?: string | null;
    detail?: string | null;
  }) {
    super(args.message);
    this.name = "QboApiError";
    this.kind = args.kind;
    this.status = args.status;
    this.faultCode = args.faultCode ?? null;
    this.detail = args.detail ?? null;
  }
}

interface QboFaultError {
  code?: string;
  Message?: string;
  Detail?: string;
}

/** First Fault error from a QBO error body, if the shape matches. */
export function readFault(body: unknown): QboFaultError | null {
  if (typeof body !== "object" || body === null) return null;
  const fault = (body as { Fault?: { Error?: QboFaultError[] } }).Fault;
  const first = fault?.Error?.[0];
  return first ?? null;
}

export function classifyFault(status: number, body: unknown): QboFaultKind {
  const authFault = readFault(body);
  if (
    status === 401 ||
    (status === 403 &&
      (authFault?.code === "3200" ||
        /AuthenticationFailed/.test(authFault?.Message ?? "")))
  )
    return "auth";
  if (status === 429) return "throttle";
  const fault = readFault(body);
  switch (fault?.code) {
    case "6240":
      return "duplicate_name";
    case "6140":
      return "duplicate_docnum";
    case "5010":
      return "stale_object";
    case "610":
    case "620":
      return "not_found";
  }
  if (status === 400 && fault) return "validation";
  return "other";
}

export interface QboRequest {
  accessToken: string;
  realmId: string;
  apiBaseUrl: string;
  method: "GET" | "POST";
  /** Path under /v3/company/{realmId}, e.g. "/customer" or "/query". */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

/**
 * Perform one Accounting API request. Returns the parsed JSON body on 2xx;
 * throws QboApiError otherwise. Token refresh is the caller's job (the port
 * wraps this with a fresh-token provider) — a 401 here surfaces as
 * kind "auth".
 */
export async function qboFetch(req: QboRequest): Promise<unknown> {
  const url = new URL(
    `${req.apiBaseUrl}/v3/company/${encodeURIComponent(req.realmId)}${req.path}`
  );
  url.searchParams.set("minorversion", QBO_MINORVERSION);
  for (const [k, v] of Object.entries(req.query ?? {})) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: req.method,
    redirect: "error",
    headers: {
      authorization: `Bearer ${req.accessToken}`,
      accept: "application/json",
      ...mockProtectionHeaders(url),
      ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    // A hung Intuit connection must not stall the serial per-org runner (an
    // after() callback or the cron sweep) indefinitely. A timeout throws a
    // transport error → retryable 503, without consuming the retry budget.
    signal: AbortSignal.timeout(QBO_FETCH_TIMEOUT_MS),
  }).catch(() => {
    throw new QboApiError({
      kind: "other",
      status: 503,
      message: "QuickBooks connection timed out or failed",
    });
  });

  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return body;

  const fault = readFault(body);
  throw new QboApiError({
    kind: classifyFault(res.status, body),
    status: res.status,
    message: fault?.Message ?? `QBO request failed (${res.status})`,
    faultCode: fault?.code ?? null,
    detail: fault?.Detail ?? null,
  });
}
