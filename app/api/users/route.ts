import bcrypt from "bcryptjs";
import { EmailTakenError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { createUser, findByEmail, listUsers } from "@/lib/repositories";
import { userCreateSchema } from "@/lib/users/schema";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) =>
  listUsers(orgId, { includeArchived: true })
);

export const POST = apiRoute(
  { minRole: "admin", input: userCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    if (await findByEmail(input.email)) throw new EmailTakenError();
    const password = await bcrypt.hash(input.password, 10);
    return createUser(orgId, {
      name: input.name,
      email: input.email,
      role: input.role,
      password,
    });
  }
);
