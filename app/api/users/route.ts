import bcrypt from "bcryptjs";
import { z } from "zod";
import { EmailTakenError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { createUser, findByEmail, listUsers } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) =>
  listUsers(orgId, { includeArchived: true })
);

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().toLowerCase().max(254),
    role: z.enum(["admin", "lead", "crew"]),
    password: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { minRole: "admin", input: CreateBody, status: 201 },
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
