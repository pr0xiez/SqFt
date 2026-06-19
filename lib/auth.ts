import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { revalidateToken } from "@/lib/auth/revalidate";
import { prisma } from "@/lib/prisma";
import { getAuthState } from "@/lib/repositories/userRepo";

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

declare module "@auth/core/jwt" {
  interface JWT {
    orgId?: string;
    role?: string;
    /** Epoch ms of the last DB re-validation; see lib/auth/revalidate.ts. */
    revalidatedAt?: number;
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Cap session lifetime so a stale token can never outlive this window even
  // if DB re-validation is somehow bypassed (issue #203: no maxAge was set, so
  // the NextAuth default of 30 days applied). Re-validation in the jwt
  // callback is the prompt revocation path; this is the hard backstop.
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
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
      // Sign-in: bake the claims from the freshly-authorized user and stamp the
      // re-validation clock so the first interval starts now.
      if (user) {
        token.orgId = user.orgId;
        token.role = user.role;
        token.revalidatedAt = Date.now();
        return token;
      }
      // Subsequent requests: re-derive role/orgId from the DB (throttled to a
      // short interval) so role changes, archives, and revocations apply to
      // live sessions instead of being trusted as-is until the token expires
      // (issue #203). A `null` return invalidates the session — the auth proxy
      // (proxy.ts) then redirects/401s the request.
      return revalidateToken(token, Date.now(), getAuthState);
    },
    async session({ session, token }) {
      // A token missing its claims is malformed (or was invalidated): refuse
      // rather than leak an unscoped / role-less session.
      if (typeof token?.orgId !== "string" || typeof token.role !== "string") {
        throw new Error("Malformed JWT: orgId and role must be strings");
      }
      session.user.id = token.sub ?? "";
      session.user.orgId = token.orgId;
      session.user.role = token.role;
      return session;
    },
  },
});
