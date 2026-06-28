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
