import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  addUserToOrg,
  createOrgWithAdmin,
  loginAsTestUser,
} from "./fixtures/users";

test.describe("12.1 Org settings GET", () => {
  test("12.1.1 demo user GETs their org", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const res = await ctx.request.get("/api/org");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBeTruthy();
    await ctx.close();
  });

  test("12.1.2 unauth returns 401", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.get("/api/org");
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("12.1.3 two demo users see different orgs", async ({ browser }) => {
    const ctxA = await browser.newContext();
    await loginAsWorkerOrg(browser, ctxA);
    const orgA = await (await ctxA.request.get("/api/org")).json();

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const orgB = await (await ctxB.request.get("/api/org")).json();

    expect(orgA.id).not.toBe(orgB.id);
    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("12.2 Workspace settings save flow", () => {
  test("12.2.1 admin edits a default rate + an identity field, saves, and a reload shows it persisted", async ({
    browser,
  }) => {
    const { org, admin } = await createOrgWithAdmin(browser);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAsTestUser(page, admin);

    await page.goto("/settings/workspace");
    await expect(
      page.getByRole("heading", { name: "Workspace" })
    ).toBeVisible();

    // Identity field: company name.
    const nameInput = page.locator("#identity input[type='text']");
    const newName = `${org.orgName}-edited`;
    await nameInput.fill(newName);

    // Default rate: the deposit-percent slider that folds into
    // computeEstimateView for every new estimate. Range inputs aren't
    // fillable in Playwright, so drive it with real key presses.
    const depositSlider = page.locator("#defaults input[type='range']");
    const before = Number(await depositSlider.inputValue());
    const target = Math.min(100, before + 15);
    await depositSlider.focus();
    for (let v = before; v < target; v++) {
      await depositSlider.press("ArrowRight");
    }
    await expect(depositSlider).toHaveValue(String(target));

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/org") && res.request().method() === "PATCH"
      ),
      page.getByRole("button", { name: "Save workspace" }).click(),
    ]);
    expect(response.ok()).toBe(true);

    await page.reload();
    await expect(page.locator("#identity input[type='text']")).toHaveValue(
      newName
    );
    await expect(page.locator("#defaults input[type='range']")).toHaveValue(
      String(target)
    );

    await ctx.close();
  });

  test("12.2.2 a non-admin (lead) is denied /settings/workspace", async ({
    browser,
  }) => {
    const { org } = await createOrgWithAdmin(browser);
    const lead = await addUserToOrg(browser, org, "lead");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAsTestUser(page, lead);

    await page.goto("/settings/workspace");
    await expect(page).toHaveURL("/settings");
    await expect(page.getByRole("link", { name: /^Workspace$/ })).toHaveCount(
      0
    );

    await ctx.close();
  });
});
