import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  getApprovalToken,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

test.describe("6.1 Public approve endpoint", () => {
  test("6.1.1 happy path: one-click approve with no body returns 200", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    const anon = await browser.newContext();
    const res = await anon.request.post(
      `/api/estimate-review/${token}/approve`
    );
    expect(res.status()).toBe(200);
    await anon.close();
    await ctx.close();
  });

  test("6.1.2 second approval returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    const anon = await browser.newContext();
    const first = await anon.request.post(
      `/api/estimate-review/${token}/approve`
    );
    expect(first.status()).toBe(200);
    const second = await anon.request.post(
      `/api/estimate-review/${token}/approve`
    );
    expect(second.status()).toBe(409);
    await anon.close();
    await ctx.close();
  });
});

test.describe("6.2 Public approve UI", () => {
  test("6.2.1 clicking Approve flips status to Approved (no signature pad)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    await page.goto(`/estimate-review/${token}`);

    // There must be no signature pad anywhere on the page.
    await expect(page.locator("canvas")).toHaveCount(0);

    await page
      .getByRole("button", { name: /Approve & get on the schedule/i })
      .click();

    await expect(page.getByText(/^Approved/).first()).toBeVisible();
    await ctx.close();
  });
});

test.describe("6.3 Decline flow", () => {
  test("6.3.1 decline endpoint with reason succeeds", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    const anon = await browser.newContext();
    const res = await anon.request.post(
      `/api/estimate-review/${token}/decline`,
      { data: { reason: "Found a better price" } }
    );
    expect(res.status()).toBe(200);
    await anon.close();
    await ctx.close();
  });

  test("6.3.2 declining via the UI flips status to Declined", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );
    const token = await getApprovalToken(ctx.request, estimateId);

    await page.goto(`/estimate-review/${token}`);
    await page.getByRole("button", { name: /^Decline$/ }).click();
    await page
      .getByRole("button", { name: /Decline estimate/i })
      .click({ noWaitAfter: true });

    await expect(page.getByText(/^Declined/).first()).toBeVisible();
    await ctx.close();
  });
});
