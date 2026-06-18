import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidateSessionClaims } from "@/lib/repositories/userRepo";

// Live sessions are re-validated against the DB on every request (see the `jwt`
// callback), so archiving a user or changing their role takes effect within the
// token's lifetime. We still cap that lifetime: an 8-hour `maxAge` (down from
// NextAuth's 30-day default) bounds how long a token survives if the DB read is
// ever bypassed, and matches a workday so active users aren't logged out mid-use.
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

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
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
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
      if (user) {
        // Initial sign-in: trust the freshly-authorized claims.
        token.orgId = user.orgId;
        token.role = user.role;
        return token;
      }
      // Subsequent requests: re-validate against the DB so archiving a user or
      // changing their role takes effect on this live session instead of being
      // trusted from the baked-in token until it expires.
      if (typeof token.sub !== "string") return null;
      const claims = await revalidateSessionClaims(token.sub);
      // Revoke: user archived or no longer exists. Returning null invalidates
      // the session (NextAuth clears the token; `session()` yields no user).
      if (!claims) return null;
      token.orgId = claims.orgId;
      token.role = claims.role;
      return token;
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
