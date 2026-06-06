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
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    const res = await page.goto(`/estimate-review/${token}`);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole("button", { name: /Approve & get on the schedule/i })
    ).toBeVisible();
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

    const page = await ctx.newPage();
    await page.goto(`/estimate-review/${token}`);
    await expect(page.getByText("Line items")).toBeVisible();
    await expect(page.getByText("Markup", { exact: false })).toHaveCount(0);
    await expect(
      page.getByText("Labor & margin", { exact: false })
    ).toHaveCount(0);
    await ctx.close();
  });
});
