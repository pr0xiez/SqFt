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
  try {
    return await prisma.user.create({
      data: {
        orgId,
        name: data.name,
        email: data.email,
        role: data.role,
        password: data.password,
      },
      select: USER_SELECT,
    });
  } catch (err) {
    // Callers are expected to pre-check email availability with
    // `findByEmailInOrg` (org-scoped), which only rules out a duplicate
    // *within the caller's own org*. `User.email` is still globally @unique,
    // so this insert can still collide with a DIFFERENT org's user. Don't
    // surface the specific EMAIL_TAKEN/409 for that case — doing so would let
    // an org admin submit arbitrary emails and learn from the response
    // whether they're registered anywhere on the platform, not just their
    // own org (cross-tenant registration oracle, see #324). Fall through to
    // the same generic 500 any other unexpected write failure gets, so the
    // response is indistinguishable from a transient error.
    if (isUniqueEmailViolation(err)) {
      throw new Error("Failed to create user: email conflict");
    }
    throw err;
  }
}

/**
 * Org-scoped "is this email already used" check — the one callers creating a
 * user should use. Deliberately does NOT look outside `orgId`: a global
 * lookup here is the cross-tenant oracle from #324. A genuine cross-org
 * collision is still caught at insert time by the DB's global unique
 * constraint on `email` (see `createUser`'s P2002 handling above).
 */
export function findByEmailInOrg(orgId: string, email: string) {
  return prisma.user.findFirst({
    where: { email, orgId },
    select: { id: true },
  });
}

/**
 * Global email lookup. Only correct for flows that are inherently
 * platform-wide, i.e. nothing org-scoped exists yet to check against (e.g.
 * login, or the pre-flight check when creating a brand-new org's first
 * admin). Do NOT use this for an "already taken in my org" existence check —
 * see `findByEmailInOrg`.
 */
export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

function isUniqueEmailViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (!target) return false;
  return Array.isArray(target)
    ? target.includes("email")
    : target.includes("email");
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

export async function validateUserIds(
  orgId: string,
  ids: string[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.user.count({ where: { id: { in: ids }, orgId } });
  return count === ids.length;
}
