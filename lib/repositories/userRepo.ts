import type { Prisma } from "@/app/generated/prisma/client";
import { ConflictError, LastAdminError, NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import type { UserPatchInput } from "@/lib/users/schema";

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
    // Callers pre-flight-check same-org duplicates via findOrgUserByEmail, but
    // User.email is globally unique, so P2002 can also mean the email belongs
    // to ANOTHER org (or a concurrent insert raced us). Surface one generic
    // error so the response never reveals cross-tenant registration (#324).
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError(
        "Unable to create a user with these details.",
        "USER_CREATE_FAILED"
      );
    }
    throw err;
  }
}

/** Org-scoped email lookup — use for tenant-facing duplicate checks so the
 *  result never reveals users in other orgs. */
export function findOrgUserByEmail(orgId: string, email: string) {
  return prisma.user.findFirst({
    where: { orgId, email },
    select: { id: true },
  });
}

/** Global (cross-org) lookup. NOT for tenant-facing responses (see #324). */
export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

/** Platform-wide user count for the super-admin dashboard. Not org-scoped —
 *  the caller must already be gated by `isSuperAdmin`. */
export function countUsersForAdmin(): Promise<number> {
  return prisma.user.count();
}

export type AuthState = { orgId: string; role: string; archived: boolean };

export function findAuthState(id: string): Promise<AuthState | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { orgId: true, role: true, archived: true },
  });
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

/**
 * Optional hooks a caller can plug into `applyUserPatch`'s pipeline to run a
 * guard check immediately before the corresponding field is applied — e.g.
 * the self-org route's "can't demote/archive yourself" checks. Each hook
 * should throw to abort (before that field's write, but after any earlier
 * field in the patch has already been applied — matches the historical
 * per-route ordering this replaces).
 */
export type UserPatchGuards = {
  beforeRoleChange?: (role: string) => void;
  beforeArchive?: (archived: boolean) => void;
};

/**
 * Apply a role / name / title / archived patch to a user, scoped to `orgId`.
 * Orchestrates: role change (via `updateRole`) -> profile fields (via
 * `updateProfile`) -> archived flag (via `setArchived`) -> re-fetch. Shared by
 * the self-org and super-admin PATCH routes; route-specific self-guard checks
 * (self-demote, self-archive) are injected via `guards`, invoked at the same
 * point in the pipeline the original per-route code checked them.
 *
 * Throws `NotFoundError` if `userId` isn't in `orgId` at any step, or
 * `LastAdminError` (bubbled from `updateRole`/`setArchived`) if the change
 * would strip the org's last admin.
 */
export async function applyUserPatch(
  userId: string,
  orgId: string,
  patch: UserPatchInput,
  guards: UserPatchGuards = {}
): Promise<UserRow> {
  if (patch.role !== undefined) {
    guards.beforeRoleChange?.(patch.role);
    // updateRole throws LastAdminError if this would demote the last admin.
    if (!(await updateRole(userId, orgId, patch.role))) {
      throw new NotFoundError();
    }
  }

  if (patch.name !== undefined || patch.title !== undefined) {
    const ok = await updateProfile(userId, orgId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
    });
    if (!ok) throw new NotFoundError();
  }

  if (patch.archived !== undefined) {
    guards.beforeArchive?.(patch.archived);
    // setArchived throws LastAdminError if this would archive the last admin.
    if (!(await setArchived(userId, orgId, patch.archived))) {
      throw new NotFoundError();
    }
  }

  const row = await findUserRow(userId, orgId);
  if (!row) throw new NotFoundError();
  return row;
}
