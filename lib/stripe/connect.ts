import { getStripe } from "./client";

export type ConnectStatus = "pending" | "active" | "restricted";

/** Collapse Stripe's capability status strings into our three states. */
export function mapCapabilityStatus(raw: string | undefined): ConnectStatus {
  if (raw === "active") return "active";
  if (raw === "restricted" || raw === "disabled") return "restricted";
  return "pending";
}

/**
 * Best-of two capability statuses. Checkout offers dynamic payment methods, so
 * an account is usable — and the Pay button should show — as soon as EITHER the
 * card or the ACH capability is active (Stripe only surfaces the methods that
 * are actually active, so a restricted one is never offered at Checkout). The
 * single persisted `stripeConnectStatus` is therefore the more permissive of
 * the two: gating on `card_payments` alone would hide the button from an
 * ACH-active / card-pending account that can already take payment.
 */
export function aggregateConnectStatus(
  card: ConnectStatus,
  ach: ConnectStatus
): ConnectStatus {
  if (card === "active" || ach === "active") return "active";
  if (card === "restricted" || ach === "restricted") return "restricted";
  return "pending";
}

/**
 * Create an Accounts-v2 connected account for direct charges:
 * full dashboard, merchant card_payments + ach_debit_payments capabilities,
 * Stripe as fees + losses collector. Returns the new account id (acct_…).
 * ACH settles asynchronously — the webhook only records checkout sessions
 * whose payment_status is "paid" (see lib/stripe/webhook.ts).
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
        capabilities: {
          card_payments: { requested: true },
          ach_debit_payments: { requested: true },
        },
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

/**
 * Read the merchant capabilities and collapse them to our status. Both
 * card_payments and ach_debit_payments are requested and underwritten
 * independently, so the aggregate reflects either being active (see
 * aggregateConnectStatus).
 */
export async function readAccountStatus(
  accountId: string
): Promise<ConnectStatus> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant"],
  });
  const caps = account.configuration?.merchant?.capabilities;
  return aggregateConnectStatus(
    mapCapabilityStatus(caps?.card_payments?.status),
    mapCapabilityStatus(caps?.ach_debit_payments?.status)
  );
}
