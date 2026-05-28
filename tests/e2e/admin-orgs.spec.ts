import { expect, test } from "@playwright/test";
import {
  createOrg,
  loginViaForm,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from "./fixtures/org";

test.describe("admin-orgs UI", () => {
  test("super-admin creates an org; new admin logs in isolated", async ({
    browser,
  }) => {
    // 1. Super-admin signs in and opens the admin page.
    const adminCtx = await browser.newContext();
    const adminPage = await loginViaForm(
      adminCtx,
      SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD
    );
    await adminPage.goto("/admin/orgs");
    await expect(
      adminPage.getByRole("heading", { name: /organizations/i })
    ).toBeVisible();

    // 2. Fill the create form with unique values.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const orgName = `UI Pilot ${suffix}`;
    const newAdminEmail = `ui-pilot+${suffix}@playwright.test`;
    const newAdminPassword = `pw-${suffix}-A1`;

    await adminPage.getByRole("button", { name: /new organization/i }).click();
    const form = adminPage.locator("form");
    await form.getByLabel(/organization name/i).fill(orgName);
    await form.getByLabel(/admin name/i).fill(`Pilot Admin ${suffix}`);
    await form.getByLabel(/admin email/i).fill(newAdminEmail);
    await form.getByLabel(/temporary password/i).fill(newAdminPassword);
    await form.getByRole("button", { name: /create org/i }).click();

    // 3. Success card shows the new admin email.
    await expect(adminPage.getByText(newAdminEmail)).toBeVisible();
    await adminCtx.close();

    // 4. New admin signs in to a fresh context and sees an empty tenant.
    const newCtx = await browser.newContext();
    const newPage = await loginViaForm(newCtx, newAdminEmail, newAdminPassword);
    await newPage.goto("/customers");
    // A brand-new org has zero customers — the seeded demo customers must not
    // be visible to this tenant.
    await expect(newPage.getByText("Acme Co")).toHaveCount(0);
    await expect(newPage.getByText("Johnson", { exact: false })).toHaveCount(0);
    await newCtx.close();
  });

  test("non-super-admin gets the 403 panel", async ({ browser }) => {
    // A fresh org's admin is a normal admin, not a super-admin.
    const org = await createOrg(browser, "non-super");
    const ctx = await browser.newContext();
    const page = await loginViaForm(ctx, org.adminEmail, org.adminPassword);
    await page.goto("/admin/orgs");
    await expect(page.getByText(/super-admin only/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Organizations$/ })
    ).toHaveCount(0);
    await ctx.close();
  });
});
