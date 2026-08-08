import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { logError } from "@/lib/logger";
import { qboFetch } from "@/lib/qbo/client";
import { getQboConfig } from "@/lib/qbo/config";
import { exchangeAuthCode, verifyState } from "@/lib/qbo/connect";
import { upsertQboConnection } from "@/lib/repositories/qboRepo";

/**
 * OAuth redirect target. The connecting admin's browser carries the session
 * cookie, so this stays behind auth (NOT in publicRoutes). The signed state
 * must resolve to the session's own org — a forged or replayed state from
 * another org redirects to the error state instead of connecting.
 */
export const GET = apiRoute({ minRole: "admin" }, async ({ req, orgId }) => {
  const settingsUrl = `${getPublicBaseUrl()}/settings/integrations`;
  const fail = (reason: string) =>
    NextResponse.redirect(`${settingsUrl}?qbo=error&reason=${reason}`);

  const config = getQboConfig();
  if (!config) return fail("unconfigured");

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const realmId = params.get("realmId");
  if (!code || !state || !realmId) return fail("missing_params");
  if (verifyState(state, config.clientSecret) !== orgId) {
    return fail("bad_state");
  }

  try {
    const tokens = await exchangeAuthCode(
      config,
      code,
      `${getPublicBaseUrl()}/api/qbo/callback`
    );
    const companyName = await readCompanyName(
      config.apiBaseUrl,
      tokens.accessToken,
      realmId
    );
    await upsertQboConnection({ orgId, realmId, tokens, companyName });
  } catch (err) {
    logError({
      path: "app/api/qbo/callback",
      orgId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    // The global unique on realmId: this QBO company is already connected to
    // a different SqFt org. "Try again" would loop forever — say what's
    // wrong. (Prisma error shape varies between versions; duck-type P2002.)
    if ((err as { code?: string }).code === "P2002") {
      return fail("realm_in_use");
    }
    return fail("exchange_failed");
  }
  return NextResponse.redirect(`${settingsUrl}?qbo=connected`);
});

/** Display-only; a failure here must not fail the connect. */
async function readCompanyName(
  apiBaseUrl: string,
  accessToken: string,
  realmId: string
): Promise<string | null> {
  try {
    const body = (await qboFetch({
      accessToken,
      realmId,
      apiBaseUrl,
      method: "GET",
      path: `/companyinfo/${encodeURIComponent(realmId)}`,
    })) as { CompanyInfo?: { CompanyName?: string } } | null;
    return body?.CompanyInfo?.CompanyName ?? null;
  } catch {
    return null;
  }
}
