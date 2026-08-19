/**
 * Super-admin org member management (collection).
 *
 * GET  — list every member of the target org (incl. archived).
 * POST — create a new user in the target org.
 *
 * Gated by `apiRoute({ superAdmin: true })`. The target org is `params.orgId`
 * (from the URL), NOT the caller's session org.
 */
import bcrypt from "bcryptjs";
import { z } from "zod";
import { EmailTakenError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  createUser,
  findByEmailInOrg,
  getOrgById,
  listUsers,
} from "@/lib/repositories";

export const GET = apiRoute({ superAdmin: true }, async ({ params }) => {
  const { orgId } = params as { orgId: string };
  if (!(await getOrgById(orgId)))
    throw new NotFoundError("Organization not found");
  return listUsers(orgId, { includeArchived: true });
});

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().toLowerCase().max(254),
    role: z.enum(["admin", "lead", "crew"]),
    password: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { superAdmin: true, input: CreateBody, status: 201 },
  async ({ input, params }) => {
    const { orgId } = params as { orgId: string };
    if (!(await getOrgById(orgId)))
      throw new NotFoundError("Organization not found");
    if (await findByEmailInOrg(orgId, input.email)) throw new EmailTakenError();
    const password = await bcrypt.hash(input.password, 10);
    return createUser(orgId, {
      name: input.name,
      email: input.email,
      role: input.role,
      password,
    });
  }
);
