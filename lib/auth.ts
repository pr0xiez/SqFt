import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { decideRevalidation, shouldRevalidate } from "@/lib/auth/revalidate";
import { prisma } from "@/lib/prisma";
import { findAuthUser } from "@/lib/repositories/userRepo";

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
  // Re-validation in the `jwt` callback (below) bounds how long a stale claim
  // can live, but maxAge is the hard ceiling on a token whose owner never makes
  // a request again. 12h keeps an abandoned session from lingering for the
  // NextAuth default 30 days, at the cost of asking active users to re-auth
  // roughly once a workday.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
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
      // Initial sign-in: `user` is the value returned by `authorize()`.
      if (user) {
        token.orgId = user.orgId;
        token.role = user.role;
        token.revalidatedAt = Date.now();
        return token;
      }

      // Subsequent requests (#203): claims were baked in at sign-in and would
      // otherwise be trusted forever. Re-read the authoritative user row from
      // the DB (throttled) so role demotions/promotions and account deletion
      // take effect on a live session instead of waiting for token expiry.
      // The proxy/`auth()` wrapper runs this on the Node.js runtime (Next 16
      // Proxy defaults to Node.js), so the Prisma read here is safe.
      const now = Date.now();
      if (!token.sub || !shouldRevalidate(token, now)) {
        return token;
      }

      const dbUser = await findAuthUser(token.sub);
      const result = decideRevalidation(dbUser, now);
      if (result.kind === "invalidate") {
        // Returning null tells NextAuth to drop the session cookie.
        return null;
      }
      token.orgId = result.orgId;
      token.role = result.role;
      token.revalidatedAt = result.revalidatedAt;
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? "";
        session.user.orgId = token.orgId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
