import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import {
  getOrgConnectOnboarding,
  getOrgStripe,
  setOrgConnectAccount,
  setOrgConnectStatus,
} from "@/lib/repositories/organizationRepo";
import {
  createConnectedAccount,
  createOnboardingLink,
  readAccountStatusDetail,
} from "@/lib/stripe/connect";
import type { StripeConnectStatus } from "@/lib/stripe/connectPhase";

// GET — current connect status for the settings page, always read live from
// Stripe when the org has an account.
//
// The cached `stripeConnectStatus` is a write-through copy for the public pay
// path, not a source of truth for the admin. Skipping the read once it said
// "active" latched this page to "payments are active" permanently: a later
// Stripe restriction stayed invisible here while the public "Pay now" button —
// which gates on that same cached value — kept sending customers to a checkout
// that fails. Refreshing unconditionally is also what keeps the requirements
// summary from being dropped on the poll that flips an account to active.
export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const org = await getOrgConnectOnboarding(orgId);
  if (!org.stripeConnectAccountId) {
    const disconnected: StripeConnectStatus = {
      connected: false,
      status: null,
      requirements: null,
      everActive: false,
    };
    return disconnected;
  }

  const detail = await readAccountStatusDetail(org.stripeConnectAccountId);
  // Stamps `stripeConnectOnboardedAt` when this read finds the account active.
  await setOrgConnectStatus(orgId, detail.status);
  const body: StripeConnectStatus = {
    connected: true,
    status: detail.status,
    requirements: detail.requirements,
    // `org` was read before the write above, so the poll that first finds the
    // account active counts too. The stamp is what lets the page tell a
    // restriction on a once-live account from a new account mid-onboarding.
    everActive:
      detail.status === "active" || org.stripeConnectOnboardedAt !== null,
  };
  return body;
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
