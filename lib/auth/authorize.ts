/**
 * Credentials-provider `authorize` body, extracted out of lib/auth.ts as a
 * pure/testable function. Deliberately does NOT import "next-auth" (or
 * anything that does) — that module boots the full NextAuth config at import
 * time, which pulls in "next/server" and can't run under vitest. Keeping
 * this helper next-auth-free is what makes it unit-testable.
 *
 * Validates shape, looks up the user, rejects archived users and bad
 * passwords, and returns the fields NextAuth stores on `User`/the JWT.
 *
 * lib/auth.ts's `Credentials({ authorize })` call delegates here — that call
 * must keep doing so, or this and the real runtime behavior diverge.
 */

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authorizeCredentials(credentials: unknown) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) return null;
  if (user.archived) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    orgId: user.orgId,
    role: user.role,
  };
}
