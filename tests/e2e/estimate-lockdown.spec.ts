import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedAcceptedEstimate,
  seedDeclinedEstimate,
} from "./fixtures/seed";

// ── 9.1 PATCH lockdown ───────────────────────────────────────────────────────

test.describe("9.1 PATCH lockdown", () => {
  test("9.1.1 PATCH on accepted estimate returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedAcceptedEstimate(
      ctx.request,
      siteMeasureId
    );

    const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { markupPct: 0.25 },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ESTIMATE_LOCKED");
    expect(body.error.message).toMatch(/locked/i);
    await ctx.close();
  });

  test("9.1.2 PATCH on declined estimate returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedDeclinedEstimate(
      ctx.request,
      siteMeasureId
    );

    const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { markupPct: 0.25 },
    });
    expect(res.status()).toBe(409);
    await ctx.close();
  });
});

// ── 9.2 Lock banners on the builder ──────────────────────────────────────────

test.describe("9.2 Lock banners", () => {
  test("9.2.1 accepted estimate shows the accepted banner", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedAcceptedEstimate(
      ctx.request,
      siteMeasureId
    );

    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByText(/^Accepted/)).toBeVisible();
    await expect(
      page.getByText(/This estimate is locked\. Use Revise to make changes\./)
    ).toBeVisible();
    await ctx.close();
  });

  test("9.2.2 declined estimate shows the declined banner with reason", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedDeclinedEstimate(
      ctx.request,
      siteMeasureId,
      "Picked another bid"
    );

    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByText(/Declined by customer/i)).toBeVisible();
    await expect(page.getByText("Picked another bid")).toBeVisible();
    await expect(
      page.getByText(
        /This estimate is locked\. Use Revise to send a new version\./
      )
    ).toBeVisible();
    await ctx.close();
  });
});
