import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { revalidateJwt } from "@/lib/authToken";
import { prisma } from "@/lib/prisma";
import { findSessionClaims } from "@/lib/repositories/userRepo";

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

// Re-validate live sessions against the DB this often. Shorter than NextAuth's
// 30-day default so that, even in the worst case, a revoked/demoted user can't
// outlive this window — though the `jwt` callback below normally revokes/refreshes
// on the very next request.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

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
    jwt({ token, user }) {
      return revalidateJwt(token, user, findSessionClaims);
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
