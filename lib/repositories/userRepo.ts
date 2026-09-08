import type { Prisma } from "@/app/generated/prisma/client";
import { EmailTakenError, LastAdminError } from "@/lib/api/errors";
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
    // Callers pre-flight-check email uniqueness via findByEmail, but that's
    // a TOCTOU window under concurrency: two requests can both pass the
    // check and race to insert, and the loser hits the User.email unique
    // index. Catch that here and surface the same typed error instead of
    // letting a raw P2002 bubble up as a 500.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new EmailTakenError();
    }
    throw err;
  }
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

export async function validateUserIds(
  orgId: string,
  ids: string[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.user.count({
    where: { id: { in: ids }, orgId, archived: false },
  });
  return count === ids.length;
}
