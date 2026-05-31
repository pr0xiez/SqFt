import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  createEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 18.1 Line item section ──────────────────────────────────────────────────
// Characterization coverage for the LineItemSection seams the room-link-picker
// specs (4.1.x) miss: plain row edits, subtotal back-calc, template apply, and
// the totals section. Seeds via API, drives the UI, asserts persisted shape via
// GET /api/estimates/{id}.

test.describe("18.1 Line item section — rows", () => {
  test("18.1.1 add, edit qty/rate, then remove a line item persists each step", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Add a line item.
    const [addPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page.getByRole("button", { name: "+ Add Line Item" }).click(),
    ]);
    expect(addPatch.status()).toBe(200);
    await expect(page.locator('input[value="New line item"]')).toBeVisible();

    // Edit qty (manual) to 5, committing on blur and waiting for its own PATCH
    // so it doesn't race the rate save below.
    const qty = page.locator('input[inputmode="decimal"]').first();
    await qty.fill("5");
    const [qtyPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      qty.blur(),
    ]);
    expect(qtyPatch.status()).toBe(200);

    // Edit rate to 10, again waiting for the commit PATCH.
    const rate = page.locator('input[inputmode="decimal"]').nth(1);
    await rate.fill("10");
    const [editPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      rate.blur(),
    ]);
    expect(editPatch.status()).toBe(200);

    // Server reflects qty=5, rate=10.
    const get1 = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const body1 = await get1.json();
    expect(body1.lineItems).toHaveLength(1);
    expect(body1.lineItems[0].qty).toBe(5);
    expect(body1.lineItems[0].rate).toBe(10);

    // Remove the line item (✕ button).
    const [delPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page.getByRole("button", { name: "✕" }).click(),
    ]);
    expect(delPatch.status()).toBe(200);
    const get2 = await ctx.request.get(`/api/estimates/${estimate.id}`);
    expect((await get2.json()).lineItems).toHaveLength(0);

    await ctx.close();
  });
});
