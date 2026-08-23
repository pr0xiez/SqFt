import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { mapTokenToSessionFields } from "@/lib/auth/session";
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
      authorize: authorizeCredentials,
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
        const fields = mapTokenToSessionFields(token);
        session.user.id = fields.id;
        session.user.orgId = fields.orgId;
        session.user.role = fields.role;
      }
      session.user.isSuperAdmin = isSuperAdmin(session.user.email);
      return session;
    },
  },
});
