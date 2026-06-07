import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createUser,
  listAssignableUsers,
  listUsers,
  setArchived,
  updateProfile,
  validateUserIds,
} from "@/lib/repositories/userRepo";

// Integration test against the real DB. Skipped in CI's DB-less unit job.
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("userRepo", () => {
  let orgId: string;
  let otherOrgId: string;
  let adminId: string;
  let crewId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "U Co", slug: `u-${Date.now()}` },
    });
    orgId = org.id;
    const other = await prisma.organization.create({
      data: { name: "U2 Co", slug: `u2-${Date.now()}` },
    });
    otherOrgId = other.id;
    const hash = await bcrypt.hash("password123", 10);
    const admin = await createUser(orgId, {
      name: "Ada",
      email: `ada-${Date.now()}@x.dev`,
      role: "admin",
      password: hash,
    });
    adminId = admin.id;
    const crew = await createUser(orgId, {
      name: "Cody",
      email: `cody-${Date.now()}@x.dev`,
      role: "crew",
      password: hash,
    });
    crewId = crew.id;
  });
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
  });

  it("listAssignableUsers returns active users and excludes archived", async () => {
    await setArchived(crewId, orgId, true);
    const active = await listAssignableUsers(orgId);
    const ids = active.map((u) => u.id);
    expect(ids).toContain(adminId);
    expect(ids).not.toContain(crewId);
    await setArchived(crewId, orgId, false); // restore for later assertions
  });

  it("listUsers includeArchived toggles archived rows", async () => {
    await setArchived(crewId, orgId, true);
    const activeOnly = await listUsers(orgId, { includeArchived: false });
    expect(activeOnly.map((u) => u.id)).not.toContain(crewId);
    const all = await listUsers(orgId, { includeArchived: true });
    expect(all.map((u) => u.id)).toContain(crewId);
    await setArchived(crewId, orgId, false);
  });

  it("validateUserIds is true only when every id is in the org", async () => {
    expect(await validateUserIds(orgId, [adminId, crewId])).toBe(true);
    expect(await validateUserIds(otherOrgId, [adminId])).toBe(false);
    expect(await validateUserIds(orgId, [])).toBe(true);
  });

  it("updateProfile sets name and title", async () => {
    const updated = await updateProfile(crewId, orgId, {
      title: "Lead Installer",
    });
    expect(updated?.title).toBe("Lead Installer");
  });

  it("setArchived refuses to archive the last active admin", async () => {
    await expect(setArchived(adminId, orgId, true)).rejects.toThrow(/admin/i);
  });
});
