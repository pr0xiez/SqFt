import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createCustomerAndEstimate,
  createSiteMeasure,
  seedAcceptedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

test.describe("13.1 Estimates list page", () => {
  test("13.1.1 seeded estimate appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );

    // EstimateList renders buttons (not <a> links). Fetch the estimate number to
    // find the row via the mono #N label.
    const estimate = await (
      await ctx.request.get(`/api/estimates/${estimateId}`)
    ).json();
    const estimateNumber = estimate.estimateNumber as number;

    await page.goto("/estimates");
    await expect(
      page
        .locator("button")
        .filter({ hasText: `#${estimateNumber}` })
        .first()
    ).toBeVisible();
    await ctx.close();
  });

  test("13.1.2 revised estimate shows ↶ rev badge", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedAcceptedEstimate(
      ctx.request,
      siteMeasureId
    );
    const revRes = await ctx.request.post(
      `/api/estimates/${estimateId}/revise`
    );
    expect(revRes.status()).toBe(200);

    await page.goto("/estimates");
    await expect(
      page.locator('[title="Revised estimate"]').first()
    ).toBeVisible();
    await ctx.close();
  });

  test("13.1.3 other-org estimate does not appear in this org's list", async ({
    browser,
  }) => {
    // Estimate numbers are per-org sequential, so they collide across orgs and
    // can't distinguish tenants. Assert isolation via uniquely-named customers:
    // the worker org's own estimate is listed; the secondary org's is not.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mineCustomerName = `Worker ${suffix}`;
    const otherCustomerName = `Secondary ${suffix}`;

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const otherCust = await createCustomer(ctxB.request, {
      name: otherCustomerName,
    });
    const otherEst = await createSiteMeasure(ctxB.request, otherCust.id);
    await seedEstimateWithLineItem(ctxB.request, otherEst.id);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctxA);
    const mineCust = await createCustomer(ctxA.request, {
      name: mineCustomerName,
    });
    const mineEst = await createSiteMeasure(ctxA.request, mineCust.id);
    await seedEstimateWithLineItem(ctxA.request, mineEst.id);

    await page.goto("/estimates");
    await expect(page.getByText(mineCustomerName)).toBeVisible();
    await expect(page.getByText(otherCustomerName)).toHaveCount(0);
    await ctxA.close();
  });
});
