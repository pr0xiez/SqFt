import { expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  loginAsOtherDemo,
} from "./fixtures/seed";

test.describe("15.1 Estimates list page", () => {
  test("15.1.1 seeded estimate appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);

    // EstimateList renders <button onClick={router.push}> not <a href> links.
    // Row buttons show customer name; the estimate # is in a hidden-md:block
    // span. Wait for loading to finish then match the row button by its #{id}.
    //
    // Clear the persisted React Query cache first: the Dashboard at "/" already
    // hydrated useEstimates with a 60s staleTime, so without this the page
    // would render the cached (pre-POST) list and never see the new estimate.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/estimates");
    // Wait for loading indicator to disappear.
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(
      page
        .locator("button")
        .filter({ hasText: `#${estimateId}` })
        .first()
    ).toBeVisible({ timeout: 10000 });
    await ctx.close();
  });

  test("15.1.2 other-org estimate does not appear", async ({ browser }) => {
    const ctxB = await browser.newContext();
    await loginAsOtherDemo(ctxB);
    const { estimateId } = await createCustomerAndEstimate(ctxB.request);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsDemo(ctxA);
    await page.goto("/estimates");
    await expect(
      page.locator("button").filter({ hasText: `#${estimateId}` })
    ).toHaveCount(0);
    await ctxA.close();
  });
});
