import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe
  .serial("Public invoice review", () => {
    let ctx: BrowserContext;
    let token: string;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      const { estimateId } = await seedEstimateWithLineItem(
        ctx.request,
        ids.siteMeasureId
      );
      const est = await (
        await ctx.request.get(`/api/estimates/${estimateId}`)
      ).json();
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { markupPct: 25, lineItems: [{ ...est.lineItems[0], qty: 100 }] },
      });
      const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
        amount: 100,
      });
      await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "customer@example.com", subject: "Invoice #1" },
      });
      const inv = await (
        await ctx.request.get(`/api/invoices/${invoiceId}`)
      ).json();
      token = inv.publicToken;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("public invoice shows balance due but never a Markup line", async () => {
      const page = await ctx.newPage();
      await page.goto(`/invoice-review/${token}`);
      await expect(page.getByText("Balance due")).toBeVisible();
      await expect(page.getByText("Markup", { exact: false })).toHaveCount(0);
      await expect(
        page.getByText("Labor & margin", { exact: false })
      ).toHaveCount(0);
      await page.close();
    });
  });
