import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { getQboConfig } from "@/lib/qbo/config";
import { buildAuthorizeUrl, signState } from "@/lib/qbo/connect";

/** Start the OAuth flow: returns the Intuit authorize URL for the browser
 *  to navigate to. Admin-only; 404 when QBO env isn't configured. */
export const POST = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const config = getQboConfig();
  if (!config) throw new NotFoundError("QuickBooks is not configured");
  const url = buildAuthorizeUrl({
    config,
    redirectUri: `${getPublicBaseUrl()}/api/qbo/callback`,
    state: signState(orgId, config.clientSecret),
  });
  return { url };
});
