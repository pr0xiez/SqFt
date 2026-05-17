import { expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  seedAcceptedQuote,
  seedDeclinedQuote,
} from "./fixtures/seed";

// ── 9.1 PATCH lockdown ───────────────────────────────────────────────────────

test.describe("9.1 PATCH lockdown", () => {
  test("9.1.1 PATCH on accepted quote returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    const res = await ctx.request.patch(`/api/quotes/${quoteId}`, {
      data: { markupPct: 0.25 },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
    await ctx.close();
  });

  test("9.1.2 PATCH on declined quote returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedDeclinedQuote(ctx.request, estimateId);

    const res = await ctx.request.patch(`/api/quotes/${quoteId}`, {
      data: { markupPct: 0.25 },
    });
    expect(res.status()).toBe(409);
    await ctx.close();
  });
});

// ── 9.2 Lock banners on the builder ──────────────────────────────────────────

test.describe("9.2 Lock banners", () => {
  test("9.2.1 accepted quote shows the accepted banner", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByText(/^Accepted/)).toBeVisible();
    await expect(
      page.getByText(/This quote is locked\. Use Revise to make changes\./)
    ).toBeVisible();
    await ctx.close();
  });

  test("9.2.2 declined quote shows the declined banner with reason", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedDeclinedQuote(
      ctx.request,
      estimateId,
      "Picked another bid"
    );

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByText(/Declined by customer/i)).toBeVisible();
    await expect(page.getByText("Picked another bid")).toBeVisible();
    await expect(
      page.getByText(
        /This quote is locked\. Use Revise to send a new version\./
      )
    ).toBeVisible();
    await ctx.close();
  });
});
