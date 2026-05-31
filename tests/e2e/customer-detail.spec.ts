import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createLocation,
  createSiteMeasure,
  reloadFresh,
  seedApprovedEstimate,
  seedDeclinedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 17.1 Customer detail page ───────────────────────────────────────────────
// Characterization coverage for the CustomerDetail seams (info card, stat strip,
// pipeline rows, locations add-form, start-site-measure branching) ahead of the
// component decomposition. Seeds via API, drives the UI, asserts rendered output
// and persisted shape.

test.describe("17.1 Customer detail — info card", () => {
  test("17.1.1 editing a field via blur PATCHes and persists on reload", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Edit Me ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // The info-card inputs have no accessible labels, so target by type.
    const phoneInput = page.locator('input[type="tel"]');
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/customers/${customer.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      (async () => {
        await phoneInput.fill("555-0100");
        await phoneInput.blur();
      })(),
    ]);
    expect(patch.status()).toBe(200);

    await reloadFresh(page);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.locator('input[type="tel"]')).toHaveValue("555-0100");

    await ctx.close();
  });
});
