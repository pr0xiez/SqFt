import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createCustomerAndEstimate,
  createEstimate,
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
    // Quote numbers are per-org sequential, so they collide across orgs and
    // can't distinguish tenants. Assert isolation via uniquely-named customers:
    // the worker org's own quote is listed; the secondary org's is not.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mineCustomerName = `Worker ${suffix}`;
    const otherCustomerName = `Secondary ${suffix}`;

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const otherCust = await createCustomer(ctxB.request, {
      name: otherCustomerName,
    });
    const otherEst = await createEstimate(ctxB.request, otherCust.id);
    await seedQuoteWithLineItem(ctxB.request, otherEst.id);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctxA);
    const mineCust = await createCustomer(ctxA.request, {
      name: mineCustomerName,
    });
    const mineEst = await createEstimate(ctxA.request, mineCust.id);
    await seedQuoteWithLineItem(ctxA.request, mineEst.id);

    await page.goto("/quotes");
    await expect(page.getByText(mineCustomerName)).toBeVisible();
    await expect(page.getByText(otherCustomerName)).toHaveCount(0);
    await ctxA.close();
  });
});
