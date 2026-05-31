import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedApprovedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 7.1 POST /api/estimates/[id]/revise ─────────────────────────────────────────

test.describe("7.1 Estimate revise — API", () => {
  test("7.1.1 happy path on accepted estimate: 200, returns new estimate id", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );

    const res = await ctx.request.post(`/api/estimates/${estimateId}/revise`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("number");
    expect(body.id).not.toBe(estimateId);

    const get = await ctx.request.get(`/api/estimates/${body.id}`);
    const newEstimate = await get.json();
    expect(newEstimate.status).toBe("draft");
    expect(newEstimate.siteMeasureId).toBe(siteMeasureId);
    await ctx.close();
  });

  test("7.1.2 revising a draft returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );

    const res = await ctx.request.post(`/api/estimates/${estimateId}/revise`);
    expect(res.status()).toBe(409);
    await ctx.close();
  });

  test("7.1.3 unauth returns 401", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.post("/api/estimates/1/revise");
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("7.1.4 cross-org returns 404", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );
    await ctx.close();

    const otherCtx = await browser.newContext();
    await loginAsSecondaryOrg(browser, otherCtx);
    const res = await otherCtx.request.post(
      `/api/estimates/${estimateId}/revise`
    );
    expect(res.status()).toBe(404);
    await otherCtx.close();
  });
});

// ── 7.2 Revise button UI ─────────────────────────────────────────────────────

test.describe("7.2 Revise button UI", () => {
  test("7.2.1 Revise button is visible on an accepted estimate", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );

    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByRole("button", { name: /^Revise$/ })).toBeVisible();
    await ctx.close();
  });

  test("7.2.2 Revise button is NOT visible on a draft estimate", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );

    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Revise$/ })).toHaveCount(0);
    await ctx.close();
  });

  test("7.2.3 clicking Revise navigates to the new estimate builder", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );

    await page.goto(`/estimates/${estimateId}`);
    await page.getByRole("button", { name: /^Revise$/ }).click();
    // Wait for navigation to a different estimate page (not the original)
    await page.waitForURL((url) => {
      const match = url.pathname.match(/^\/estimates\/(\d+)$/);
      return match !== null && Number(match[1]) !== estimateId;
    });
    await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    await ctx.close();
  });
});

// ── 7.3 Revision badge in estimate list ─────────────────────────────────────────

test.describe("7.3 Revision badge", () => {
  test("7.3.1 revised estimate shows the ↶ rev badge in the estimate list", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );

    const reviseRes = await ctx.request.post(
      `/api/estimates/${estimateId}/revise`
    );
    expect(reviseRes.status()).toBe(200);

    await page.goto("/estimates");
    await expect(
      page.locator('[title="Revised estimate"]').first()
    ).toBeVisible();
    await ctx.close();
  });
});
