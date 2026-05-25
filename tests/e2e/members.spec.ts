import { expect, test } from "@playwright/test";
import {
  createTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let admin: TestUser;
let target: TestUser;

test.beforeAll(async ({ browser }) => {
  admin = await createTestUser(browser, "admin");
  target = await createTestUser(browser, "crew");
});

// The row containing a given email is the parent of the email cell. The email
// cell is a direct child of the row, so a single ".." gets the row itself.
// Walking ".." twice lands on the list container and matches every select.
function memberRow(page: import("@playwright/test").Page, email: string) {
  return page.locator(`text=${email}`).locator("..");
}

test("admin sees Members card on /settings", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /^Members\b/ })).toBeVisible();
  await ctx.close();
});

test("admin can change another member's role and refresh sees the change", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  const select = memberRow(page, target.email).locator("select");
  await expect(select).toHaveValue("crew");

  await select.selectOption("lead");
  await expect(select).not.toBeDisabled();

  await page.reload();
  const reloadedSelect = memberRow(page, target.email).locator("select");
  await expect(reloadedSelect).toHaveValue("lead");

  await ctx.close();
});

test("admin cannot change their own role (dropdown disabled)", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  const ownSelect = memberRow(page, admin.email).locator("select");
  await expect(ownSelect).toBeDisabled();

  await ctx.close();
});

test("admin can invite a new member", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  await page.getByRole("button", { name: /invite member/i }).click();

  // Scope to the form — each existing row also has a "Role for X" select.
  const form = page.locator("form").filter({ hasText: /add member/i });
  const newEmail = `invited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@playwright.test`;
  await form.getByLabel("Name").fill("Invited Person");
  await form.getByLabel("Email").fill(newEmail);
  await form.getByLabel("Role").selectOption("crew");
  await form.getByLabel("Temporary password").fill("invitedpw1234");
  await form.getByRole("button", { name: /add member/i }).click();

  await expect(page.locator(`text=${newEmail}`)).toBeVisible();

  // No cleanup — invited user remains in the test DB. Unique email per run
  // prevents collisions, same as the other e2e fixtures.

  await ctx.close();
});
