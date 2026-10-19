import bcrypt from "bcryptjs";
import { EmailTakenError, ValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { createUser, findByEmailInOrg, listUsers } from "@/lib/repositories";
import { userCreateSchema } from "@/lib/users/schema";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) =>
  listUsers(orgId, { includeArchived: true })
);

export const POST = apiRoute(
  { minRole: "admin", input: userCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    // Only the caller's own org is checked up front: an in-org duplicate is
    // already visible to this admin, so EMAIL_TAKEN is safe. User.email is
    // globally unique, so a collision with ANOTHER org surfaces as P2002 from
    // createUser; report it as a generic validation failure so the response
    // never reveals that an email is registered in a different tenant.
    if (await findByEmailInOrg(input.email, orgId)) throw new EmailTakenError();
    const password = await bcrypt.hash(input.password, 10);
    try {
      return await createUser(orgId, {
        name: input.name,
        email: input.email,
        role: input.role,
        password,
      });
    } catch (err) {
      if (err instanceof EmailTakenError)
        throw new ValidationError("This email can't be used for a new member");
      throw err;
    }
  }
);
