import { prisma } from "@/lib/prisma";
import type { ConnectStatus } from "@/lib/stripe/connect";

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

export async function setOrgConnectStatus(
  orgId: string,
  status: ConnectStatus,
  onboardedAt?: Date
) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeConnectStatus: status,
      ...(status === "active" && onboardedAt
        ? { stripeConnectOnboardedAt: onboardedAt }
        : {}),
    },
  });
}
