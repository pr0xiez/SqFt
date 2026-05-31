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
