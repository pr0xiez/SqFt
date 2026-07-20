import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import {
  getOrgStripe,
  setOrgConnectAccount,
  setOrgConnectStatus,
} from "@/lib/repositories/orgRepo";
import {
  type ConnectRequirements,
  type ConnectStatus,
  createConnectedAccount,
  createOnboardingLink,
  readAccountStatusDetail,
} from "@/lib/stripe/connect";

// GET — current connect status for the settings page. While the account isn't
// active this refreshes from Stripe on every call (the settings page polls it
// briefly after onboarding returns), so the response also carries the
// requirements summary that tells the user what is actually happening.
export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const org = await getOrgStripe(orgId);
  let status: ConnectStatus | null =
    org.stripeConnectStatus as ConnectStatus | null;
  let requirements: ConnectRequirements | null = null;
  // Refresh from Stripe when we have an account but it isn't active yet.
  if (org.stripeConnectAccountId && status !== "active") {
    const detail = await readAccountStatusDetail(org.stripeConnectAccountId);
    status = detail.status;
    requirements = detail.requirements;
    await setOrgConnectStatus(
      orgId,
      status,
      status === "active" ? new Date() : undefined
    );
  }
  return {
    connected: Boolean(org.stripeConnectAccountId),
    status: status ?? null,
    requirements,
  };
});

// POST — create the account if needed, then return a fresh onboarding link.
export const POST = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const org = await getOrgStripe(orgId);
  let accountId = org.stripeConnectAccountId;
  if (!accountId) {
    accountId = await createConnectedAccount({
      orgId,
      email: null,
      name: org.name,
    });
    await setOrgConnectAccount(orgId, accountId, "pending");
  }
  const base = getPublicBaseUrl();
  const url = await createOnboardingLink(
    accountId,
    `${base}/settings/payments?onboarding=return`,
    `${base}/settings/payments?onboarding=refresh`
  );
  return { url };
});
