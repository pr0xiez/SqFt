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
import { listAllOrgsForAdmin } from "@/lib/repositories/organizationRepo";

export const GET = apiRoute({ superAdmin: true }, async () => {
  return listAllOrgsForAdmin();
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
