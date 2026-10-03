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
import { EmailTakenError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  createUser,
  findOrgUserByEmail,
  getOrgById,
  listUsers,
} from "@/lib/repositories";
import { userCreateSchema } from "@/lib/users/schema";

export const GET = apiRoute({ superAdmin: true }, async ({ params }) => {
  const { orgId } = params as { orgId: string };
  if (!(await getOrgById(orgId)))
    throw new NotFoundError("Organization not found");
  return listUsers(orgId, { includeArchived: true });
});

export const POST = apiRoute(
  { superAdmin: true, input: userCreateSchema, status: 201 },
  async ({ input, params }) => {
    const { orgId } = params as { orgId: string };
    if (!(await getOrgById(orgId)))
      throw new NotFoundError("Organization not found");
    if (await findOrgUserByEmail(orgId, input.email))
      throw new EmailTakenError();
    const password = await bcrypt.hash(input.password, 10);
    return createUser(orgId, {
      name: input.name,
      email: input.email,
      role: input.role,
      password,
    });
  }
);
