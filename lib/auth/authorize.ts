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

import { z } from "zod";
import { authenticateCredentials } from "@/lib/auth/login";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authorizeCredentials(credentials: unknown) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  return authenticateCredentials(email, password);
}
