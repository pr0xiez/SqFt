/**
 * Super-admin org management.
 *
 * GET   — list every organization with status + user count.
 * POST  — create a new manual organization through `createOrganization`.
 *
 * Both gated by `apiRoute({ superAdmin: true })`. Non-super-admins get a 403
 * with code `FORBIDDEN`.
 */
import { z } from "zod";
import { apiRoute } from "@/lib/api/route";
import { createOrganization } from "@/lib/onboarding/createOrganization";
import { ADMIN_ORGS_LIST_CAP } from "@/lib/pagination/constants";
import { prisma } from "@/lib/prisma";

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEndsAt: true,
  createdAt: true,
  _count: { select: { users: true } },
} as const;

export const GET = apiRoute({ superAdmin: true }, async () => {
  const rows = await prisma.organization.findMany({
    select: ORG_SELECT,
    orderBy: { createdAt: "desc" },
    take: ADMIN_ORGS_LIST_CAP,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus,
    trialEndsAt: r.trialEndsAt,
    currentPeriodEndsAt: r.currentPeriodEndsAt,
    createdAt: r.createdAt,
    userCount: r._count.users,
  }));
});

const CreateOrgBody = z
  .object({
    orgName: z.string().trim().min(1).max(120),
    adminName: z.string().trim().min(1).max(100),
    adminEmail: z.string().email().toLowerCase().max(254),
    adminPassword: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { superAdmin: true, input: CreateOrgBody, status: 201 },
  async ({ input }) => {
    const result = await createOrganization({
      org: { name: input.orgName },
      admin: {
        name: input.adminName,
        email: input.adminEmail,
        password: input.adminPassword,
      },
      billing: { kind: "manual" },
    });
    return {
      orgId: result.orgId,
      slug: result.slug,
      adminEmail: input.adminEmail,
    };
  }
);
