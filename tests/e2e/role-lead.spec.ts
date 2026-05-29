import { expect, test } from "@playwright/test";
import {
  addUserToOrg,
  createOrgWithAdmin,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async ({ browser }) => {
  const { org } = await createOrgWithAdmin(browser);
  user = await addUserToOrg(browser, org, "lead");
});

test("lead login lands on /", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(page).toHaveURL("/");
  await ctx.close();
});

test("lead /settings shows only line-item-templates", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: /line item templates/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Workspace$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Members$/ })).toHaveCount(0);
  await ctx.close();
});

test("lead is redirected from /settings/workspace and /settings/members", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);

  await page.goto("/settings/workspace");
  await expect(page).toHaveURL("/settings");

  await page.goto("/settings/members");
  await expect(page).toHaveURL("/settings");

  await ctx.close();
});
