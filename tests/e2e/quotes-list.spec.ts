import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedAcceptedQuote,
  seedQuoteWithLineItem,
} from "./fixtures/seed";

test.describe("13.1 Quotes list page", () => {
  test("13.1.1 seeded quote appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);

    // QuoteList renders buttons (not <a> links). Fetch the quote number to
    // find the row via the mono #N label.
    const quote = await (
      await ctx.request.get(`/api/quotes/${quoteId}`)
    ).json();
    const quoteNumber = quote.quoteNumber as number;

    await page.goto("/quotes");
    await expect(
      page
        .locator("button")
        .filter({ hasText: `#${quoteNumber}` })
        .first()
    ).toBeVisible();
    await ctx.close();
  });

  test("13.1.2 revised quote shows ↶ rev badge", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);
    const revRes = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(revRes.status()).toBe(200);

    await page.goto("/quotes");
    await expect(page.locator('[title="Revised quote"]').first()).toBeVisible();
    await ctx.close();
  });

  test("13.1.3 other-org quote does not appear in this org's list", async ({
    browser,
  }) => {
    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const { estimateId } = await createCustomerAndEstimate(ctxB.request);
    const { quoteId: otherQuoteId } = await seedQuoteWithLineItem(
      ctxB.request,
      estimateId
    );
    const otherQuote = await (
      await ctxB.request.get(`/api/quotes/${otherQuoteId}`)
    ).json();
    const otherQuoteNumber = otherQuote.quoteNumber as number;
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctxA);
    await page.goto("/quotes");
    await expect(
      page.locator("button").filter({ hasText: `#${otherQuoteNumber}` })
    ).toHaveCount(0);
    await ctxA.close();
  });
});
