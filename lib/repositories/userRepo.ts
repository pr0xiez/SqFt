import type { Prisma } from "@/app/generated/prisma/client";
import { LastAdminError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  archived: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export type AssignableUser = { id: string; name: string; title: string | null };

export function listUsers(
  orgId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<UserRow[]> {
  return prisma.user.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { archived: false }) },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export function listAssignableUsers(orgId: string): Promise<AssignableUser[]> {
  return prisma.user.findMany({
    where: { orgId, archived: false },
    select: { id: true, name: true, title: true },
    orderBy: { name: "asc" },
  });
}

export async function createUser(
  orgId: string,
  data: { name: string; email: string; role: string; password: string }
): Promise<UserRow> {
  return prisma.user.create({
    data: {
      orgId,
      name: data.name,
      email: data.email,
      role: data.role,
      password: data.password,
    },
    select: USER_SELECT,
  });
}

export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

export function findUserRow(
  id: string,
  orgId: string
): Promise<UserRow | null> {
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function updateRole(
  id: string,
  orgId: string,
  role: string
): Promise<UserRow | null> {
  const target = await prisma.user.findFirst({
    where: { id, orgId },
    select: { role: true },
  });
  if (!target) return null;
  // Preserve the original route's guard: don't demote the last active admin.
  if (target.role === "admin" && role !== "admin") {
    const activeAdmins = await prisma.user.count({
      where: { orgId, role: "admin", archived: false },
    });
    if (activeAdmins <= 1) throw new LastAdminError();
  }
  await prisma.user.updateMany({ where: { id, orgId }, data: { role } });
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function updateProfile(
  id: string,
  orgId: string,
  data: { name?: string; title?: string | null }
): Promise<UserRow | null> {
  const r = await prisma.user.updateMany({ where: { id, orgId }, data });
  if (r.count === 0) return null;
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export async function setArchived(
  id: string,
  orgId: string,
  archived: boolean
): Promise<UserRow | null> {
  if (archived) {
    const target = await prisma.user.findFirst({
      where: { id, orgId },
      select: { role: true },
    });
    if (target?.role === "admin") {
      const activeAdmins = await prisma.user.count({
        where: { orgId, role: "admin", archived: false },
      });
      if (activeAdmins <= 1) {
        throw new LastAdminError("Can't archive the last active admin.");
      }
    }
  }
  const r = await prisma.user.updateMany({
    where: { id, orgId },
    data: { archived },
  });
  if (r.count === 0) return null;
  return prisma.user.findFirst({ where: { id, orgId }, select: USER_SELECT });
}

export type SessionClaims = { archived: boolean; role: string; orgId: string };

/**
 * Minimal lookup used to re-validate a live JWT against the DB on every token
 * refresh (see the `jwt` callback in `lib/auth.ts`). Selects only the claims
 * that gate access — archived / role / orgId — to keep this hot-path query
 * cheap. Returns null if the user no longer exists.
 *
 * NOTE: User ids are global ints, so we look up by id alone and read orgId back
 * from the row; the token's stale orgId/role are never trusted for the refresh.
 */
export function findSessionClaims(id: string): Promise<SessionClaims | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { archived: true, role: true, orgId: true },
  });
}

export async function validateUserIds(
  orgId: string,
  ids: string[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.user.count({ where: { id: { in: ids }, orgId } });
  return count === ids.length;
}
