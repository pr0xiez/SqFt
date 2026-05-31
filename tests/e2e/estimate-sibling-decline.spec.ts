import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  getApprovalToken,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 8.1 Approve cascades decline to siblings ─────────────────────────────────

test.describe("8.1 Approve cascades to siblings", () => {
  test("8.1.1 approving one estimate declines open siblings on the same siteMeasure", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);

    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);

    // Two open estimates on the same site measure.
    const a = await seedEstimateWithLineItem(ctx.request, siteMeasureId);
    const b = await seedEstimateWithLineItem(ctx.request, siteMeasureId);

    const token1 = await getApprovalToken(ctx.request, a.estimateId);

    // The approve endpoint is public (token-authorized), so an anonymous
    // request context is sufficient here.
    const anon = await browser.newContext();
    const approveRes = await anon.request.post(
      `/api/estimate-review/${token1}/approve`
    );
    expect(approveRes.status()).toBe(200);
    await anon.close();

    // Approved estimate a is approved; sibling b is auto-declined.
    const aRes = await ctx.request.get(`/api/estimates/${a.estimateId}`);
    expect((await aRes.json()).status).toBe("approved");

    const bRes = await ctx.request.get(`/api/estimates/${b.estimateId}`);
    const bBody = await bRes.json();
    expect(bBody.status).toBe("declined");
    expect(bBody.declineReason ?? "").toMatch(/Superseded/);

    await ctx.close();
  });
});
