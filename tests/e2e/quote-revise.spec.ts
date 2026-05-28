import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedAcceptedQuote,
  seedQuoteWithLineItem,
} from "./fixtures/seed";

// ── 7.1 POST /api/quotes/[id]/revise ─────────────────────────────────────────

test.describe("7.1 Quote revise — API", () => {
  test("7.1.1 happy path on accepted quote: 200, returns new quote id", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    const res = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("number");
    expect(body.id).not.toBe(quoteId);

    const get = await ctx.request.get(`/api/quotes/${body.id}`);
    const newQuote = await get.json();
    expect(newQuote.status).toBe("draft");
    expect(newQuote.estimateId).toBe(estimateId);
    await ctx.close();
  });

  test("7.1.2 revising a draft returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);

    const res = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(res.status()).toBe(409);
    await ctx.close();
  });

  test("7.1.3 unauth returns 401", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.post("/api/quotes/1/revise");
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("7.1.4 cross-org returns 404", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);
    await ctx.close();

    const otherCtx = await browser.newContext();
    await loginAsSecondaryOrg(browser, otherCtx);
    const res = await otherCtx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(res.status()).toBe(404);
    await otherCtx.close();
  });
});

// ── 7.2 Revise button UI ─────────────────────────────────────────────────────

test.describe("7.2 Revise button UI", () => {
  test("7.2.1 Revise button is visible on an accepted quote", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByRole("button", { name: /^Revise$/ })).toBeVisible();
    await ctx.close();
  });

  test("7.2.2 Revise button is NOT visible on a draft quote", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Revise$/ })).toHaveCount(0);
    await ctx.close();
  });

  test("7.2.3 clicking Revise navigates to the new quote builder", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await page.getByRole("button", { name: /^Revise$/ }).click();
    // Wait for navigation to a different quote page (not the original)
    await page.waitForURL((url) => {
      const match = url.pathname.match(/^\/quotes\/(\d+)$/);
      return match !== null && Number(match[1]) !== quoteId;
    });
    await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    await ctx.close();
  });
});

// ── 7.3 Revision badge in quote list ─────────────────────────────────────────

test.describe("7.3 Revision badge", () => {
  test("7.3.1 revised quote shows the ↶ rev badge in the quote list", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    const reviseRes = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(reviseRes.status()).toBe(200);

    await page.goto("/quotes");
    await expect(page.locator('[title="Revised quote"]').first()).toBeVisible();
    await ctx.close();
  });
});
