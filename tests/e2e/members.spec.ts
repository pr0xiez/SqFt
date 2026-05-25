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

test("admin sees Members card on /settings", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /^Members$/ })).toBeVisible();
  await ctx.close();
});

test("admin can change another member's role and refresh sees the change", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  const row = page.locator(`text=${target.email}`).locator("..").locator("..");
  const select = row.locator("select");
  await expect(select).toHaveValue("crew");

  await select.selectOption("lead");
  await expect(select).not.toBeDisabled();

  await page.reload();
  const reloadedSelect = page
    .locator(`text=${target.email}`)
    .locator("..")
    .locator("..")
    .locator("select");
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

  const ownRow = page
    .locator(`text=${admin.email}`)
    .locator("..")
    .locator("..");
  const ownSelect = ownRow.locator("select");
  await expect(ownSelect).toBeDisabled();

  await ctx.close();
});

test("admin can invite a new member", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  await page.getByRole("button", { name: /invite member/i }).click();

  const newEmail = `invited-${Date.now()}@playwright.test`;
  await page.getByLabel("Name").fill("Invited Person");
  await page.getByLabel("Email").fill(newEmail);
  await page.getByLabel("Role").selectOption("crew");
  await page.getByLabel("Temporary password").fill("invitedpw1234");
  await page.getByRole("button", { name: /add member/i }).click();

  await expect(page.locator(`text=${newEmail}`)).toBeVisible();

  // No cleanup — invited user remains in the test DB. Unique email per run
  // prevents collisions, same as the other e2e fixtures.

  await ctx.close();
});
