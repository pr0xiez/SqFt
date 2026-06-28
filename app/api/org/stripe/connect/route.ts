import { apiRoute } from "@/lib/api/route";
import {
  getOrgStripe,
  setOrgConnectAccount,
  setOrgConnectStatus,
} from "@/lib/repositories/orgRepo";
import {
  type ConnectStatus,
  createConnectedAccount,
  createOnboardingLink,
  readAccountStatus,
} from "@/lib/stripe/connect";

function baseUrl(req: Request): string {
  return (
    process.env.STRIPE_PUBLIC_BASE_URL ?? new URL(req.url).origin
  ).replace(/\/$/, "");
}

// GET — current connect status for the settings page.
export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const org = await getOrgStripe(orgId);
  let status: ConnectStatus | null =
    org.stripeConnectStatus as ConnectStatus | null;
  // Refresh from Stripe when we have an account but it isn't active yet.
  if (org.stripeConnectAccountId && status !== "active") {
    status = await readAccountStatus(org.stripeConnectAccountId);
    await setOrgConnectStatus(
      orgId,
      status,
      status === "active" ? new Date() : undefined
    );
  }
  return {
    connected: Boolean(org.stripeConnectAccountId),
    status: status ?? null,
  };
});

// POST — create the account if needed, then return a fresh onboarding link.
export const POST = apiRoute({ minRole: "admin" }, async ({ orgId, req }) => {
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
  const base = baseUrl(req);
  const url = await createOnboardingLink(
    accountId,
    `${base}/settings/payments?onboarding=return`,
    `${base}/settings/payments?onboarding=refresh`
  );
  return { url };
});
