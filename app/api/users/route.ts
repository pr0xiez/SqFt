import bcrypt from "bcryptjs";
import { z } from "zod";
import { EmailTakenError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  return prisma.user.findMany({
    where: { orgId },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
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
  { minRole: "admin", input: CreateBody, status: 201 },
  async ({ orgId, input }) => {
    const exists = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (exists) throw new EmailTakenError();

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: passwordHash,
        role: input.role,
        orgId,
      },
      select: USER_SELECT,
    });
    return user;
  }
);
