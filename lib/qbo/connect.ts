/**
 * OAuth plumbing for the QBO connection: authorize-URL + signed state,
 * code exchange, refresh, revoke. Pure with respect to persistence — the
 * single-flight refresh orchestration (row lock + atomic persist of the
 * rotated pair) lives in lib/repositories/qboRepo.ts, which calls
 * `exchangeRefreshToken` under the lock.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mockProtectionHeaders, QBO_SCOPE, type QboConfig } from "./config";

/** Rotated token pair as returned by Intuit's token endpoint. */
export interface QboTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (typically 3600). */
  expiresIn: number;
  /** Seconds until the refresh token expires (rotates ~daily regardless). */
  refreshExpiresIn: number;
}

/** Refresh proactively when within this many ms of access-token expiry. */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

export function shouldRefresh(now: Date, accessTokenExpiresAt: Date): boolean {
  return accessTokenExpiresAt.getTime() - now.getTime() < REFRESH_SKEW_MS;
}

// ── OAuth state ─────────────────────────────────────────────────────────────
// `state` carries the initiating orgId + issue time, HMAC-signed with the
// client secret so the callback can bind the redirect to the org that started
// the flow and refuse a replayed state after the TTL.

/** How long a signed state stays valid (defence-in-depth against replay —
 *  the session-org equality check in the callback is the primary gate). */
export const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(
  orgId: string,
  secret: string,
  now = Date.now()
): string {
  const nonce = randomBytes(8).toString("base64url");
  const payload = `${orgId}.${now}.${nonce}`;
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyState(
  state: string,
  secret: string,
  now = Date.now()
): string | null {
  const lastDot = state.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = state.slice(0, lastDot);
  const mac = state.slice(lastDot + 1);
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parts = payload.split(".");
  if (parts.length < 3) return null;
  const issuedAt = Number(parts[parts.length - 2]);
  const orgId = parts.slice(0, -2).join(".");
  if (!Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > STATE_TTL_MS || issuedAt - now > 60_000) return null;
  return orgId || null;
}

export function buildAuthorizeUrl(args: {
  config: QboConfig;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(args.config.authorizeUrl);
  url.searchParams.set("client_id", args.config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

// ── Token endpoint ──────────────────────────────────────────────────────────

function basicAuth(config: QboConfig): string {
  return `Basic ${Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64")}`;
}

interface TokenEndpointBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  error?: string;
}

/** Thrown when the token endpoint rejects the grant — the connection is dead
 *  (user disconnected on Intuit's side, rotation race, or revocation) and the
 *  remedy is reconnecting, not retrying. */
export class QboAuthDeadError extends Error {
  constructor(detail: string) {
    super(`QBO authorization is no longer valid (${detail})`);
    this.name = "QboAuthDeadError";
  }
}

/** Hard cap on the token exchange. The refresh runs under the QboConnection
 *  row lock inside a 20s transaction (qboRepo.getFreshAccessContext) — an
 *  unbounded fetch that outlives the transaction would commit nothing while
 *  Intuit has already rotated the pair, bricking the connection. */
export const TOKEN_FETCH_TIMEOUT_MS = 10_000;

async function callTokenEndpoint(
  config: QboConfig,
  params: Record<string, string>
): Promise<QboTokens> {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: basicAuth(config),
      ...mockProtectionHeaders(config.tokenUrl),
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as TokenEndpointBody | null;

  if (!res.ok || !body?.access_token || !body.refresh_token) {
    const detail = body?.error ?? `status ${res.status}`;
    // invalid_grant (and 400s generally) mean the grant itself is dead;
    // anything else (network blip, 5xx) is retryable and stays a plain Error.
    if (res.status === 400 || res.status === 401) {
      throw new QboAuthDeadError(detail);
    }
    throw new Error(`QBO token endpoint failed (${detail})`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in ?? 3600,
    refreshExpiresIn: body.x_refresh_token_expires_in ?? 100 * 24 * 3600,
  };
}

export async function exchangeAuthCode(
  config: QboConfig,
  code: string,
  redirectUri: string
): Promise<QboTokens> {
  return callTokenEndpoint(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export async function exchangeRefreshToken(
  config: QboConfig,
  refreshToken: string
): Promise<QboTokens> {
  return callTokenEndpoint(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/** Best-effort revoke on user-initiated disconnect. Never throws. */
export async function revokeToken(
  config: QboConfig,
  refreshToken: string
): Promise<void> {
  await fetch(config.revokeUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: basicAuth(config),
      "content-type": "application/json",
      ...mockProtectionHeaders(config.revokeUrl),
    },
    body: JSON.stringify({ token: refreshToken }),
    signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
  }).catch(() => undefined);
}
