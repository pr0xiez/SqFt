/**
 * Per-test user fixtures. Each call creates a fresh user with a unique
 * email so parallel tests don't collide. The caller is responsible for
 * deleting the user (or batch-deleting after the suite via the cleanup
 * helper).
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type Role = "admin" | "lead" | "crew";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
  orgId: string;
};

const PLAYWRIGHT_PASSWORD = "test-pw-1234";

/**
 * Create a user in the demo org with the given role. The email is
 * "{role}-{uuid}@playwright.test", which never collides with seed data.
 */
export async function createTestUser(role: Role): Promise<TestUser> {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "johnson-flooring-demo" },
  });
  const email = `${role}-${randomUUID()}@playwright.test`;
  const password = PLAYWRIGHT_PASSWORD;
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name: `Test ${role}`,
      email,
      password: hash,
      role,
      orgId: org.id,
    },
  });
  return { id: user.id, email, password, role, orgId: org.id };
}

export async function deleteTestUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => {});
}

/**
 * Login helper that drives the login form, awaits navigation, and
 * returns when the page is settled on the post-login route. Works for
 * any role — caller verifies the landing URL.
 */
export async function loginAsTestUser(
  page: import("@playwright/test").Page,
  user: TestUser
): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await Promise.all([
    page.waitForURL(user.role === "crew" ? "/schedule" : "/"),
    page.click('button[type="submit"]'),
  ]);
}
