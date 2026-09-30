/**
 * QBO environment + endpoint resolution. Like Stripe, the integration is
 * invisible when env is absent: `getQboConfig()` returns null and every
 * surface (settings card, enqueue, routes) treats that as "not configured".
 *
 * QBO_ENVIRONMENT selects the Intuit endpoints:
 *   - sandbox    → Intuit sandbox (test keys)
 *   - production → Intuit production (live keys; requires app assessment)
 *   - mock       → the app's own test-only realm at /api/qbo-mock (E2E).
 *                  Refused on production deployments.
 */

import { getPublicBaseUrl } from "@/lib/baseUrl";

export type QboEnvironment = "sandbox" | "production" | "mock";

export interface QboConfig {
  clientId: string;
  clientSecret: string;
  environment: QboEnvironment;
  /** OAuth authorize page (browser redirect target). */
  authorizeUrl: string;
  /** OAuth token endpoint (code exchange + refresh). */
  tokenUrl: string;
  /** OAuth revoke endpoint. */
  revokeUrl: string;
  /** Accounting API base, no trailing slash (realm paths appended). */
  apiBaseUrl: string;
}

/** Every Accounting API call pins this — older minorversions are retired. */
export const QBO_MINORVERSION = "75";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

/** Mock OAuth must return to the host carrying the admin's session cookie.
 * Real Intuit flows keep the configured, registered callback origin.
 */
export function getQboAppBaseUrl(
  config: QboConfig | null,
  requestUrl: URL | string
): string {
  return config?.environment === "mock"
    ? new URL(requestUrl).origin
    : getPublicBaseUrl();
}

export function isMockQboEnabled(): boolean {
  return (
    process.env.QBO_ENVIRONMENT === "mock" &&
    process.env.VERCEL_ENV !== "production"
  );
}

/** Protected previews require an automation header for server requests.
 * Never send this project credential to Intuit or outside our own mock.
 * https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
 */
export function mockProtectionHeaders(
  url: URL | string
): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!isMockQboEnabled() || process.env.VERCEL_ENV !== "preview" || !secret)
    return {};
  const target = new URL(url);
  if (
    target.origin !== new URL(getPublicBaseUrl()).origin ||
    !target.pathname.startsWith("/api/qbo-mock/")
  )
    return {};
  return { "x-vercel-protection-bypass": secret };
}

export function getQboConfig(): QboConfig | null {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const environment = process.env.QBO_ENVIRONMENT as QboEnvironment | undefined;
  if (!clientId || !clientSecret || !environment) return null;

  if (!["sandbox", "production", "mock"].includes(environment))
    throw new Error("Invalid QBO_ENVIRONMENT");

  if (environment === "mock") {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("QBO_ENVIRONMENT=mock is not allowed in production");
    }
    const base = getPublicBaseUrl();
    return {
      clientId,
      clientSecret,
      environment,
      authorizeUrl: `${base}/api/qbo-mock/authorize`,
      tokenUrl: `${base}/api/qbo-mock/token`,
      revokeUrl: `${base}/api/qbo-mock/revoke`,
      apiBaseUrl: `${base}/api/qbo-mock`,
    };
  }

  return {
    clientId,
    clientSecret,
    environment,
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    revokeUrl: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    apiBaseUrl:
      environment === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com",
  };
}
