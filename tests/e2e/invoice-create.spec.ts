import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

test.describe
  .serial("Invoice create", () => {
    let ctx: BrowserContext;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
      const seed = await seedEstimateWithLineItem(ctx.request, siteMeasureId);
      estimateId = seed.estimateId;
      // give the line item a quantity so the estimate has a non-zero total
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const est = await get.json();
      const li = est.lineItems[0];
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...li, qty: 100 }] },
      });
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("POST creates a draft invoice (201) and it appears in the list", async () => {
      const res = await ctx.request.post(
        `/api/estimates/${estimateId}/invoices`,
        { data: { amount: 100 } }
      );
      expect(res.status()).toBe(201);
      const inv = await res.json();
      expect(inv.status).toBe("draft");

      const list = await ctx.request.get(
        `/api/estimates/${estimateId}/invoices`
      );
      const rows = await list.json();
      expect(rows.some((r: { id: number }) => r.id === inv.id)).toBe(true);
    });

    test("over-billing past the unbilled balance is rejected", async () => {
      const res = await ctx.request.post(
        `/api/estimates/${estimateId}/invoices`,
        { data: { amount: 99999 } }
      );
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });

    test("the detail page renders the invoice", async () => {
      const created = await ctx.request.post(
        `/api/estimates/${estimateId}/invoices`,
        { data: { amount: 50 } }
      );
      const inv = await created.json();
      const page = await ctx.newPage();
      await page.goto(`/invoices/${inv.id}`);
      await expect(
        page.getByText(`Invoice #${inv.invoiceNumber}`)
      ).toBeVisible();
      await page.close();
    });
  });
