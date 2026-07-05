import { expect, test } from "@playwright/test";
import {
  createOrg,
  loginViaForm,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from "./fixtures/org";

test.describe("admin org member management", () => {
  test("super-admin adds a user to an org and manages the row", async ({
    browser,
  }) => {
    // A fresh org (created via the super-admin API) to mutate in isolation.
    const org = await createOrg(browser, "member-mgmt");

    const ctx = await browser.newContext();
    const page = await loginViaForm(
      ctx,
      SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD
    );

    await page.goto(`/admin/orgs/${org.orgId}`);
    await expect(
      page.getByRole("heading", { name: org.orgName })
    ).toBeVisible();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEmail = `crew+${suffix}@playwright.test`;

    await page.getByRole("button", { name: /add user/i }).click();
    const form = page.locator("form");
    await form.getByLabel(/name/i).fill(`Crew ${suffix}`);
    await form.getByLabel(/email/i).fill(newEmail);
    await form.getByLabel(/temporary password/i).fill(`pw-${suffix}-A1`);
    await form.getByRole("button", { name: /^add user$/i }).click();

    // Credential reveal shows the new email (scope to the reveal block, since
    // the new member row also renders the email at the same time).
    const reveal = page.getByText(/hand these off out-of-band/i).locator("..");
    await expect(reveal.getByText(newEmail)).toBeVisible();
    // After dismissing the reveal, the email remains in the member list.
    await page.getByRole("button", { name: /done/i }).click();
    await expect(page.getByText(newEmail)).toBeVisible();

    await ctx.close();
  });

  test("Admin nav link is visible only to super-admins", async ({
    browser,
  }) => {
    // Super-admin sees it.
    const superCtx = await browser.newContext();
    const superPage = await loginViaForm(
      superCtx,
      SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD
    );
    const superNav = superPage
      .locator('nav[aria-label="Main navigation"]')
      .first();
    await expect(superNav.getByRole("link", { name: /^Admin$/ })).toBeVisible();
    await superCtx.close();

    // A normal org admin does not.
    const org = await createOrg(browser, "no-admin-link");
    const ctx = await browser.newContext();
    const page = await loginViaForm(ctx, org.adminEmail, org.adminPassword);
    await expect(page.getByRole("link", { name: /^Admin$/ })).toHaveCount(0);
    await ctx.close();
  });

  test("non-super-admin is blocked from admin pages via direct URL", async ({
    browser,
  }) => {
    // Hiding the nav link isn't access control: a normal org admin who types the
    // URL directly must hit the layout's ForbiddenPanel, and the page body must
    // render no operator/cross-org data.
    const org = await createOrg(browser, "guard");
    const ctx = await browser.newContext();
    const page = await loginViaForm(ctx, org.adminEmail, org.adminPassword);

    // Dashboard: forbidden, and its own "Admin" <h1> / org+user stats never render.
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /super-admin only/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Admin", exact: true })
    ).toHaveCount(0);
    await expect(page.getByText("Organizations", { exact: true })).toHaveCount(
      0
    );

    // Org detail: forbidden, and the target org's member list never renders
    // (the org-name heading is the tell — it's only emitted by the detail view).
    await page.goto(`/admin/orgs/${org.orgId}`);
    await expect(
      page.getByRole("heading", { name: /super-admin only/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: org.orgName })).toHaveCount(
      0
    );

    await ctx.close();
  });
});
