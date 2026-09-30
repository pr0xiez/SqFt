import { getStripe } from "./client";

/**
 * `unsupported` is terminal: the capability is unavailable for this account's
 * business, country or entity type, so re-running onboarding can never fix it.
 * It is deliberately NOT folded into `pending` — the page presents pending as
 * "continue setup", which would loop the user forever.
 */
export type ConnectStatus = "pending" | "active" | "restricted" | "unsupported";

/** One thing Stripe says is missing from — or wrong with — a requirement. */
export interface ConnectRequirementIssue {
  /**
   * Stripe's machine-readable requirement id (e.g. `individual.id_number`), so
   * the page can say which field a message is about. Null when Stripe didn't
   * name one.
   */
  requirement: string | null;
  /** Stripe's human-readable description of the problem. */
  message: string;
}

/**
 * What the account still owes Stripe, collapsed for the settings page.
 * `actionDue` — the user has a requirement that is currently or already past
 * due (an `eventually_due` one is future work that doesn't hold up activation);
 * `inReview` — nothing is due from the user and Stripe is still working on at
 * least one requirement (async verification: nothing to do but wait);
 * `issues` — every failure Stripe reported for whichever side is currently
 * holding things up, so the page never shows one reason out of three and never
 * blames the user for a Stripe-side failure.
 */
export interface ConnectRequirements {
  actionDue: boolean;
  inReview: boolean;
  issues: ConnectRequirementIssue[];
}

export interface ConnectStatusDetail {
  status: ConnectStatus;
  requirements: ConnectRequirements;
}

/**
 * Structural subset of Stripe's v2 `Requirements.Entry`. `description` and
 * `minimum_deadline` are non-optional on the SDK type, so real entries always
 * satisfy this — they are optional here only so tests (and any future API
 * version that stops sending one) don't have to fabricate them.
 */
interface RequirementEntry {
  awaiting_action_from: "stripe" | "user";
  description?: string;
  errors: Array<{ description: string }>;
  minimum_deadline?: {
    status: "currently_due" | "eventually_due" | "past_due";
  };
}

/** Structural subset of the v2 merchant configuration's capability statuses. */
interface MerchantCapabilities {
  card_payments?: { status?: string };
  ach_debit_payments?: { status?: string };
}

/**
 * A user-owned requirement only blocks activation once Stripe says it is due.
 * `minimum_deadline.status` is Stripe's aggregate of "the soonest point when
 * the account will be impacted", so it already folds in the per-entry
 * `impact.restricts_capabilities` deadlines — an `eventually_due` entry
 * restricts nothing yet, and treating it as due both mislabels the page and
 * stops the post-onboarding poll on its first tick. A missing deadline counts
 * as due: better to over-prompt than to sit silently on a blocking requirement.
 */
function isDueFromUser(entry: RequirementEntry): boolean {
  if (entry.awaiting_action_from !== "user") return false;
  return entry.minimum_deadline?.status !== "eventually_due";
}

/** Flatten every error on the given entries, de-duplicated and order-stable. */
function toIssues(entries: RequirementEntry[]): ConnectRequirementIssue[] {
  const seen = new Set<string>();
  const issues: ConnectRequirementIssue[] = [];
  for (const entry of entries) {
    for (const error of entry.errors) {
      const requirement = entry.description ?? null;
      const key = JSON.stringify([requirement, error.description]);
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ requirement, message: error.description });
    }
  }
  // Stripe doesn't document entry ordering, so sort: two polls five seconds
  // apart must not reshuffle the list under someone who is mid-read.
  return issues.sort(
    (a, b) =>
      a.message.localeCompare(b.message) ||
      (a.requirement ?? "").localeCompare(b.requirement ?? "")
  );
}

/** Collapse v2 requirement entries into the settings-page summary. */
export function summarizeRequirements(
  entries: RequirementEntry[] | undefined
): ConnectRequirements {
  const list = entries ?? [];
  const dueFromUser = list.filter(isDueFromUser);
  const awaitingStripe = list.filter(
    (e) => e.awaiting_action_from === "stripe"
  );
  const actionDue = dueFromUser.length > 0;
  const inReview = !actionDue && awaitingStripe.length > 0;
  // Report errors only for the side that is actually holding things up. An
  // ungated fallback tells the user to go fix an SSN that Stripe, not they, own.
  const source = actionDue ? dueFromUser : inReview ? awaitingStripe : [];
  return { actionDue, inReview, issues: toIssues(source) };
}

/** Collapse Stripe's capability status strings into our four states. */
export function mapCapabilityStatus(raw: string | undefined): ConnectStatus {
  if (raw === "active") return "active";
  if (raw === "restricted") return "restricted";
  if (raw === "unsupported") return "unsupported";
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
 *
 * `unsupported` ranks last because it is terminal: it wins only when BOTH
 * capabilities are unsupported, since one unsupported capability alongside a
 * pending one can still end up active.
 */
export function aggregateConnectStatus(
  card: ConnectStatus,
  ach: ConnectStatus
): ConnectStatus {
  if (card === "active" || ach === "active") return "active";
  if (card === "restricted" || ach === "restricted") return "restricted";
  if (card === "pending" || ach === "pending") return "pending";
  return "unsupported";
}

function statusFromCapabilities(
  caps: MerchantCapabilities | undefined
): ConnectStatus {
  return aggregateConnectStatus(
    mapCapabilityStatus(caps?.card_payments?.status),
    mapCapabilityStatus(caps?.ach_debit_payments?.status)
  );
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
 * Read the merchant capabilities and the outstanding requirements. Both
 * card_payments and ach_debit_payments are requested and underwritten
 * independently, so the aggregate reflects either being active (see
 * aggregateConnectStatus).
 *
 * Only the admin settings page needs the requirements half — the customer
 * checkout path calls `readAccountStatus` instead.
 */
export async function readAccountStatusDetail(
  accountId: string
): Promise<ConnectStatusDetail> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "requirements"],
  });
  return {
    status: statusFromCapabilities(
      account.configuration?.merchant?.capabilities
    ),
    requirements: summarizeRequirements(account.requirements?.entries),
  };
}

/**
 * Capability status only. This runs on the customer-facing checkout path (twice
 * per failed payment attempt), which has no use for the requirements payload —
 * asking for it there would widen a money-path call, and parsing it would add a
 * way for the graceful-degradation catch block to throw.
 */
export async function readAccountStatus(
  accountId: string
): Promise<ConnectStatus> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant"],
  });
  return statusFromCapabilities(account.configuration?.merchant?.capabilities);
}
