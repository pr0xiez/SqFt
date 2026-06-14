import { StripeNotConnectedError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { getConnectAccountId } from "@/lib/stripe/onboarding";
import { realGateway } from "@/lib/stripe/realGateway";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const accountId = await getConnectAccountId(orgId);
  if (!accountId) throw new StripeNotConnectedError();
  const base = getPublicBaseUrl();
  const link = await realGateway.createAccountLink(accountId, {
    refreshUrl: `${base}/api/org/stripe-connect/refresh`,
    returnUrl: `${base}/settings/workspace?stripe=return`,
  });
  return Response.redirect(link.url, 303);
});
