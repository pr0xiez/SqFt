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
  user = await addUserToOrg(browser, org, "crew");
});

test("crew login lands on /my-schedule", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(page).toHaveURL("/my-schedule");
  await ctx.close();
});

test("crew nav shows only My Schedule", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  const desktopNav = page.locator('nav[aria-label="Main navigation"]').first();
  await expect(
    desktopNav.getByRole("link", { name: "My Schedule" })
  ).toBeVisible();
  await expect(
    desktopNav.getByRole("link", { name: "Schedule Manager" })
  ).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Dashboard" })).toHaveCount(
    0
  );
  await expect(desktopNav.getByRole("link", { name: "Customers" })).toHaveCount(
    0
  );
  await expect(
    desktopNav.getByRole("link", { name: "Site Measures" })
  ).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Estimates" })).toHaveCount(
    0
  );
  await expect(desktopNav.getByRole("link", { name: "Settings" })).toHaveCount(
    0
  );
  await ctx.close();
});

test.describe("crew page redirects", () => {
  const restricted = [
    "/",
    "/schedule",
    "/customers",
    "/site-measures",
    "/estimates",
    "/settings",
    "/settings/workspace",
    "/settings/members",
    "/settings/line-item-templates",
  ];

  for (const path of restricted) {
    test(`GET ${path} redirects to /my-schedule`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginAsTestUser(page, user);
      await page.goto(path);
      await expect(page).toHaveURL("/my-schedule");
      await ctx.close();
    });
  }
});

test("crew my-schedule has no create affordance", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(
    page.getByRole("button", { name: /new event|add event|create event/i })
  ).toHaveCount(0);
  await ctx.close();
});
