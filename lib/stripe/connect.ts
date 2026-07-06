import { getStripe } from "./client";

export type ConnectStatus = "pending" | "active" | "restricted";

/** Collapse Stripe's capability status strings into our three states. */
export function mapCapabilityStatus(raw: string | undefined): ConnectStatus {
  if (raw === "active") return "active";
  if (raw === "restricted" || raw === "disabled") return "restricted";
  return "pending";
}

/**
 * Create an Accounts-v2 connected account for direct charges:
 * full dashboard, merchant card_payments capability, Stripe as fees + losses
 * collector. Returns the new account id (acct_…).
 */
export async function createConnectedAccount(input: {
  orgId: string;
  email: string | null;
  name: string;
}): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.create({
    display_name: input.name,
    contact_email: input.email ?? undefined,
    // Stripe requires identity.country before configuration.merchant can be
    // set; SqFt orgs are US contractors (Checkout is usd-only).
    identity: { country: "us" },
    dashboard: "full",
    defaults: {
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    configuration: {
      merchant: {
        capabilities: { card_payments: { requested: true } },
      },
    },
    metadata: { sqftOrgId: input.orgId },
  });
  return account.id;
}

/**
 * Hosted onboarding link (v2 account-link) for a v2 connected account.
 * Uses stripe.v2.core.accountLinks (not the v1 stripe.accountLinks endpoint)
 * with the use_case / account_onboarding structure required by the v2 API.
 */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant"],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
  return link.url;
}

/** Read the merchant card_payments capability and map to our status. */
export async function readAccountStatus(
  accountId: string
): Promise<ConnectStatus> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant"],
  });
  const raw =
    account.configuration?.merchant?.capabilities?.card_payments?.status;
  return mapCapabilityStatus(raw);
}
