import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { StripeGateway } from "./gateway";

export interface ConnectStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingStatus: string;
  disabledReason: string | null;
  requirementsDue: string[];
}

/** Create the connected account if absent, persist its id BEFORE any redirect. */
export async function ensureConnectAccount(
  orgId: string,
  gateway: StripeGateway
): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { stripeConnectAccountId: true },
  });
  if (org.stripeConnectAccountId) return org.stripeConnectAccountId;

  const account = await gateway.createConnectAccount(orgId);
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeConnectAccountId: account.id,
      stripeOnboardingStatus: "pending",
    },
  });
  return account.id;
}

export async function getConnectAccountId(
  orgId: string
): Promise<string | null> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { stripeConnectAccountId: true },
  });
  return org.stripeConnectAccountId;
}

export async function getConnectStatus(orgId: string): Promise<ConnectStatus> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
      stripeDisabledReason: true,
      stripeRequirementsDue: true,
    },
  });
  return {
    chargesEnabled: org.stripeChargesEnabled,
    payoutsEnabled: org.stripePayoutsEnabled,
    detailsSubmitted: org.stripeDetailsSubmitted,
    onboardingStatus: org.stripeOnboardingStatus,
    disabledReason: org.stripeDisabledReason,
    requirementsDue: Array.isArray(org.stripeRequirementsDue)
      ? (org.stripeRequirementsDue as string[])
      : [],
  };
}

/** Mirror a Stripe Account onto the org. Idempotent compare-and-set by acct id. */
export async function mirrorAccountStatus(
  account: Stripe.Account
): Promise<void> {
  const requirementsDue = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ];
  const chargesEnabled = account.charges_enabled ?? false;
  const disabledReason = account.requirements?.disabled_reason ?? null;
  const onboardingStatus = chargesEnabled
    ? "enabled"
    : disabledReason || requirementsDue.length > 0
      ? "action_needed"
      : "pending";

  await prisma.organization.updateMany({
    where: { stripeConnectAccountId: account.id },
    data: {
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: account.payouts_enabled ?? false,
      stripeDetailsSubmitted: account.details_submitted ?? false,
      stripeOnboardingStatus: onboardingStatus,
      stripeRequirementsDue: requirementsDue,
      stripeDisabledReason: disabledReason,
    },
  });
}
