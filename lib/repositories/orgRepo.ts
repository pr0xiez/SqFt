import { prisma } from "@/lib/prisma";

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
