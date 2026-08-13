import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authenticateCredentials } from "@/lib/auth/login";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/prisma";

// Extend the built-in session types to include orgId and role
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      orgId: string;
      role: string;
      isSuperAdmin: boolean;
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
  session: { strategy: "jwt" },
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

        // Returns null for every failure case — unknown email, archived,
        // locked, or wrong password — so the client can't distinguish them
        // (see lib/auth/login.ts for the lockout mechanics).
        return authenticateCredentials(email, password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.orgId = user.orgId;
        token.role = user.role;
      }
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
      session.user.isSuperAdmin = isSuperAdmin(session.user.email);
      return session;
    },
  },
});
