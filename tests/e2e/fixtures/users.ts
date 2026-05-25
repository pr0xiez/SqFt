/**
 * Per-test user fixtures. Creates users via POST /api/users using a
 * temporary admin session driven through the seeded demo admin. Each call
 * generates a unique email so parallel tests don't collide. There is no
 * cleanup — the test DB accumulates users across runs, which matches the
 * pattern of the other e2e fixtures (customers, estimates, etc).
 *
 * Direct Prisma access would be cleaner but the generated client is
 * CommonJS and Playwright's runtime is ESM, so we go through HTTP.
 */

import type { Browser } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./auth";

export type Role = "admin" | "lead" | "crew";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

const PLAYWRIGHT_PASSWORD = "test-pw-1234";

/**
 * Create a user in the seeded demo org with the given role. The email is
 * `{role}-{timestamp}-{rand}@playwright.test`, which never collides with
 * seed data or prior runs.
 */
export async function createTestUser(
  browser: Browser,
  role: Role
): Promise<TestUser> {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill("#email", DEMO_EMAIL);
    await page.fill("#password", DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@playwright.test`;
    const res = await ctx.request.post("/api/users", {
      data: {
        name: `Test ${role}`,
        email,
        role,
        password: PLAYWRIGHT_PASSWORD,
      },
    });
    if (!res.ok()) {
      throw new Error(
        `createTestUser(${role}) failed: ${res.status()} ${await res.text()}`
      );
    }
    const user = (await res.json()) as { id: string };
    return { id: user.id, email, password: PLAYWRIGHT_PASSWORD, role };
  } finally {
    await ctx.close();
  }
}

/**
 * Login helper that drives the login form, awaits navigation, and
 * returns when the page is settled on the post-login route.
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
