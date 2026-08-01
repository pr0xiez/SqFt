import { prisma } from "@/lib/prisma";
import type { ConnectStatus } from "@/lib/stripe/connect";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  createdAt: Date;
};

/** Fetch a single org by id for the super-admin detail page / route checks. */
export function getOrgById(id: string): Promise<OrgSummary | null> {
  return prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      createdAt: true,
    },
  });
}

export async function getOrgStripe(orgId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      stripeConnectAccountId: true,
      stripeConnectStatus: true,
    },
  });
}

/**
 * Resolve the org that owns a Stripe connected account. The webhook trusts
 * `event.account` (signed) — not caller-supplied metadata — so this is the
 * authoritative org for a payment. Returns null when no org owns the account.
 */
export async function getOrgIdByConnectAccount(
  accountId: string
): Promise<string | null> {
  const org = await prisma.organization.findFirst({
    where: { stripeConnectAccountId: accountId },
    select: { id: true },
  });
  return org?.id ?? null;
}

export async function setOrgConnectAccount(
  orgId: string,
  accountId: string,
  status: ConnectStatus
) {
  await prisma.organization.update({
    where: { id: orgId },
    data: { stripeConnectAccountId: accountId, stripeConnectStatus: status },
  });
}

/**
 * Write-through cache of the account's capability status.
 *
 * Guarded so an unchanged status writes nothing: the settings page refreshes
 * this on every poll (up to ~24 in a post-onboarding window), and all but the
 * one poll that actually moves the status would otherwise spend a round trip
 * and a row lock rewriting an identical string on the response's critical path.
 * `updateMany` is deliberate — it no-ops instead of throwing when the WHERE
 * doesn't match, which is exactly the "nothing changed" case.
 */
export async function setOrgConnectStatus(
  orgId: string,
  status: ConnectStatus,
  onboardedAt?: Date
) {
  const stampOnboardedAt = status === "active" && onboardedAt !== undefined;
  await prisma.organization.updateMany({
    where: {
      id: orgId,
      OR: [
        // `not` is spelled out against null so the filter's NULL handling
        // doesn't depend on the Prisma version.
        { stripeConnectStatus: null },
        { stripeConnectStatus: { not: status } },
        // Already active but never stamped: still needs the timestamp.
        ...(stampOnboardedAt ? [{ stripeConnectOnboardedAt: null }] : []),
      ],
    },
    data: {
      stripeConnectStatus: status,
      ...(stampOnboardedAt ? { stripeConnectOnboardedAt: onboardedAt } : {}),
    },
  });
}
