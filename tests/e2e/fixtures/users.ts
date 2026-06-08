/**
 * Per-org user fixtures for role/members specs.
 *
 * `createOrgWithAdmin` mints a fresh org via the super-admin endpoint; the
 * org's admin (created by `createOrganization`) is returned as a `TestUser`.
 * `addUserToOrg` logs in as that admin and creates an additional user of the
 * given role via POST /api/users. Every email is unique per run, so there is
 * no cleanup — matching the other e2e fixtures.
 *
 * Direct Prisma access would be cleaner but the generated client is CommonJS
 * and Playwright's runtime is ESM, so we go through HTTP.
 */
import type { Browser } from "@playwright/test";
import { createOrg, loginViaForm, type OrgCreds } from "./org";

export type Role = "admin" | "lead" | "crew";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

/**
 * Create a fresh org. Returns the org plus its admin as a `TestUser` (the
 * admin's `id` is unknown from the create response and left empty — specs key
 * off email/password, not id).
 */
export async function createOrgWithAdmin(
  browser: Browser
): Promise<{ org: OrgCreds; admin: TestUser }> {
  const org = await createOrg(browser, "roles");
  return {
    org,
    admin: {
      id: "",
      email: org.adminEmail,
      password: org.adminPassword,
      role: "admin",
    },
  };
}

/**
 * Add a user of `role` to an existing org by logging in as that org's admin
 * and POSTing /api/users. Email is `{role}-{timestamp}-{rand}@playwright.test`.
 */
export async function addUserToOrg(
  browser: Browser,
  org: OrgCreds,
  role: Role
): Promise<TestUser> {
  const password = "test-pw-1234";
  const ctx = await browser.newContext();
  try {
    await loginViaForm(ctx, org.adminEmail, org.adminPassword);
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@playwright.test`;
    const res = await ctx.request.post("/api/users", {
      data: { name: `Test ${role}`, email, role, password },
    });
    if (!res.ok()) {
      throw new Error(
        `addUserToOrg(${role}) failed: ${res.status()} ${await res.text()}`
      );
    }
    const user = (await res.json()) as { id: string };
    return { id: user.id, email, password, role };
  } finally {
    await ctx.close();
  }
}

/**
 * Login helper that drives the login form, awaits navigation, and returns when
 * the page is settled on the post-login route (crew → /my-schedule, else → /).
 */
export async function loginAsTestUser(
  page: import("@playwright/test").Page,
  user: TestUser
): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await Promise.all([
    page.waitForURL(user.role === "crew" ? "/my-schedule" : "/"),
    page.click('button[type="submit"]'),
  ]);
}
