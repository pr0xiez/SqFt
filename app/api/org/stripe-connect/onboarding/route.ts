import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { ensureConnectAccount } from "@/lib/stripe/onboarding";
import { realGateway } from "@/lib/stripe/realGateway";

export const POST = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const accountId = await ensureConnectAccount(orgId, realGateway);
  const base = getPublicBaseUrl();
  const link = await realGateway.createAccountLink(accountId, {
    refreshUrl: `${base}/api/org/stripe-connect/refresh`,
    returnUrl: `${base}/settings/workspace?stripe=return`,
  });
  return { url: link.url };
});
