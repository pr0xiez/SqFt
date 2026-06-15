import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { refreshAuthToken } from "@/lib/auth/refreshToken";
import { prisma } from "@/lib/prisma";
import { findAuthUser } from "@/lib/repositories/userRepo";

// Re-validate live sessions at most this often to act on archive/role/org
// changes; also the JWT/session lifetime. Shorter than NextAuth's 30-day
// default so a revoked session can't linger.
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// Extend the built-in session types to include orgId and role
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      orgId: string;
      role: string;
    };
  }
  interface User {
    orgId: string;
    role: string;
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  jwt: { maxAge: SESSION_MAX_AGE },
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
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
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in: bake the authority claims from the authorized user.
      if (user) {
        token.orgId = user.orgId;
        token.role = user.role;
        return token;
      }
      // Subsequent requests: re-validate against the live DB record so an admin
      // archiving the user or changing their role/org takes effect on the
      // existing session. A null result revokes the session.
      return refreshAuthToken(token, findAuthUser);
    },
    async session({ session, token }) {
      if (token) {
        if (typeof token.orgId !== "string" || typeof token.role !== "string") {
          throw new Error("Malformed JWT: orgId and role must be strings");
        }
        session.user.id = token.sub ?? "";
        session.user.orgId = token.orgId;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
