import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUser("crew");
});

test.afterAll(async () => {
  await deleteTestUser(user.id);
});

test("crew login lands on /schedule", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(page).toHaveURL("/schedule");
  await ctx.close();
});

test("crew nav shows only Schedule", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  const desktopNav = page.locator('nav[aria-label="Main navigation"]').first();
  await expect(
    desktopNav.getByRole("link", { name: "Schedule" })
  ).toBeVisible();
  await expect(desktopNav.getByRole("link", { name: "Dashboard" })).toHaveCount(
    0
  );
  await expect(desktopNav.getByRole("link", { name: "Customers" })).toHaveCount(
    0
  );
  await expect(desktopNav.getByRole("link", { name: "Estimates" })).toHaveCount(
    0
  );
  await expect(desktopNav.getByRole("link", { name: "Quotes" })).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Settings" })).toHaveCount(
    0
  );
  await ctx.close();
});

test.describe("crew page redirects", () => {
  const restricted = [
    "/",
    "/customers",
    "/estimates",
    "/quotes",
    "/settings",
    "/settings/workspace",
    "/settings/members",
    "/settings/line-item-templates",
  ];

  for (const path of restricted) {
    test(`GET ${path} redirects to /schedule`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginAsTestUser(page, user);
      await page.goto(path);
      await expect(page).toHaveURL("/schedule");
      await ctx.close();
    });
  }
});

test("crew schedule has no create affordance", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(
    page.getByRole("button", { name: /new event|add event|create event/i })
  ).toHaveCount(0);
  await ctx.close();
});
