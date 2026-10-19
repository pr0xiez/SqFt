import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  getApprovalToken,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

test.describe("Public estimate review view", () => {
  test("renders the public estimate for a valid token", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    // Navigated LOGGED OUT on purpose: customers open the emailed link with no
    // session, and a logged-in context would mask a missing allowlist entry in
    // lib/publicRoutes.ts (the proxy would redirect anonymous visitors to
    // /login). Data is seeded via the authed ctx; the page uses a fresh one.
    const anonCtx = await browser.newContext();
    const page = await anonCtx.newPage();
    const res = await page.goto(`/estimate-review/${token}`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/estimate-review/${token}$`));
    await expect(
      page.getByRole("button", { name: /Approve & get on the schedule/i })
    ).toBeVisible();
    await anonCtx.close();
    await ctx.close();
  });

  test("returns 404 for an unknown token", async ({ page }) => {
    const res = await page.goto(
      "/estimate-review/totally-not-a-real-token-1234567890"
    );
    expect(res?.status()).toBe(404);
  });

  test("returns 404 for a malformed token", async ({ page }) => {
    const res = await page.goto("/estimate-review/abc");
    expect(res?.status()).toBe(404);
  });
});

test.describe("public estimate hides markup", () => {
  test("renders no Markup / Labor & margin line even with markup set", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    await ctx.request.patch(`/api/estimates/${estimateId}`, {
      data: { markupPct: 25 },
    });
    const token = await getApprovalToken(ctx.request, estimateId);

    // Logged-out page (see note above): seed with ctx, render anonymously.
    const anonCtx = await browser.newContext();
    const page = await anonCtx.newPage();
    await page.goto(`/estimate-review/${token}`);
    await expect(page).toHaveURL(new RegExp(`/estimate-review/${token}$`));
    await expect(page.getByText("Line items")).toBeVisible();
    await expect(page.getByText("Markup", { exact: false })).toHaveCount(0);
    await expect(
      page.getByText("Labor & margin", { exact: false })
    ).toHaveCount(0);
    await anonCtx.close();
    await ctx.close();
  });
});
