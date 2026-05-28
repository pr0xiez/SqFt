import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import { createCustomerAndEstimate } from "./fixtures/seed";

test.describe("15.1 Estimates list page", () => {
  test("15.1.1 seeded estimate appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);

    // EstimateList renders <button onClick={router.push}> not <a href> links.
    // Row buttons show customer name; the estimate # is in a hidden-md:block
    // span. Wait for loading to finish then match the row button by its #{id}.
    //
    // Two robustness steps before the visibility check:
    //   1. Poll /api/estimates until the just-created row is observable. The
    //      preview deploy sometimes races: POST commits, but the next GET on a
    //      different pooled connection still returns the prior snapshot.
    //   2. Clear localStorage so the persisted React Query cache (Dashboard at
    //      "/" hydrated useEstimates with a 60s staleTime) doesn't replay a
    //      stale list on /estimates.
    await expect
      .poll(
        async () => {
          const res = await ctx.request.get("/api/estimates");
          const list = (await res.json()) as Array<{ id: number }>;
          return list.some((e) => e.id === estimateId);
        },
        { timeout: 10000 }
      )
      .toBe(true);
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
    await loginAsSecondaryOrg(browser, ctxB);
    const { estimateId } = await createCustomerAndEstimate(ctxB.request);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctxA);
    await page.goto("/estimates");
    await expect(
      page.locator("button").filter({ hasText: `#${estimateId}` })
    ).toHaveCount(0);
    await ctxA.close();
  });
});
