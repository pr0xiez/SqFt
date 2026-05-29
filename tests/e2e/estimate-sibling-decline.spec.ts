import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createSiteMeasure,
  getApprovalToken,
  seedEstimateWithLineItem,
  TEST_SIGNATURE_PNG,
} from "./fixtures/seed";

// ── 8.1 Accept cascades decline to siblings ──────────────────────────────────

test.describe("8.1 Sibling auto-decline", () => {
  test("8.1.1 accepting one open estimate auto-declines siblings on same siteMeasure", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);

    const customer = await createCustomer(ctx.request, {
      name: "Cascade Customer",
    });
    const siteMeasure = await createSiteMeasure(ctx.request, customer.id);
    const q1 = await seedEstimateWithLineItem(ctx.request, siteMeasure.id);
    const q2 = await seedEstimateWithLineItem(ctx.request, siteMeasure.id);
    const token1 = await getApprovalToken(ctx.request, q1.estimateId);

    const anon = await browser.newContext();
    const acceptRes = await anon.request.post(`/api/q/${token1}/accept`, {
      data: {
        name: "Cx",
        email: "c@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree.",
      },
    });
    expect(acceptRes.status()).toBe(200);
    await anon.close();

    const got1 = await (
      await ctx.request.get(`/api/estimates/${q1.estimateId}`)
    ).json();
    const got2 = await (
      await ctx.request.get(`/api/estimates/${q2.estimateId}`)
    ).json();
    expect(got1.status).toBe("accepted");
    expect(got2.status).toBe("declined");
    expect(got2.estimateEvents?.[0]?.source).toBe("system_supersede");
    await ctx.close();
  });

  test("8.1.2 estimates on a different siteMeasure are not affected", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);

    const c1 = await createCustomer(ctx.request, { name: "Iso A" });
    const e1 = await createSiteMeasure(ctx.request, c1.id);
    const qA = await seedEstimateWithLineItem(ctx.request, e1.id);
    const tokenA = await getApprovalToken(ctx.request, qA.estimateId);

    const c2 = await createCustomer(ctx.request, { name: "Iso B" });
    const e2 = await createSiteMeasure(ctx.request, c2.id);
    const qB = await seedEstimateWithLineItem(ctx.request, e2.id);

    const anon = await browser.newContext();
    const res = await anon.request.post(`/api/q/${tokenA}/accept`, {
      data: {
        name: "Cx",
        email: "c@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree.",
      },
    });
    expect(res.status()).toBe(200);
    await anon.close();

    const gotB = await (
      await ctx.request.get(`/api/estimates/${qB.estimateId}`)
    ).json();
    expect(gotB.status).toBe("draft");
    await ctx.close();
  });

  test("8.1.3 superseded sibling shows auto-decline banner on builder", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const customer = await createCustomer(ctx.request, {
      name: "Banner Customer",
    });
    const siteMeasure = await createSiteMeasure(ctx.request, customer.id);
    const q1 = await seedEstimateWithLineItem(ctx.request, siteMeasure.id);
    const q2 = await seedEstimateWithLineItem(ctx.request, siteMeasure.id);
    const token1 = await getApprovalToken(ctx.request, q1.estimateId);

    const anon = await browser.newContext();
    const acceptRes = await anon.request.post(`/api/q/${token1}/accept`, {
      data: {
        name: "Cx",
        email: "c@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree.",
      },
    });
    expect(acceptRes.status()).toBe(200);
    await anon.close();

    await page.goto(`/estimates/${q2.estimateId}`);
    await expect(page.getByText(/Auto-declined/i)).toBeVisible();
    await ctx.close();
  });
});
