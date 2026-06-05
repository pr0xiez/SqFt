import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe
  .serial("Invoice payment", () => {
    let ctx: BrowserContext;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      const seed = await seedEstimateWithLineItem(
        ctx.request,
        ids.siteMeasureId
      );
      estimateId = seed.estimateId;
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const est = await get.json();
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...est.lineItems[0], qty: 100 }] },
      });
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("partial then full payment drives partial → paid", async () => {
      const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
        amount: 100,
      });

      const p1 = await ctx.request.post(`/api/invoices/${invoiceId}/payments`, {
        data: { amount: 40, method: "check" },
      });
      expect(p1.status()).toBe(201);
      let inv = await (
        await ctx.request.get(`/api/invoices/${invoiceId}`)
      ).json();
      expect(inv.status).toBe("partial");

      const p2 = await ctx.request.post(`/api/invoices/${invoiceId}/payments`, {
        data: { amount: 60, method: "cash" },
      });
      expect(p2.status()).toBe(201);
      inv = await (await ctx.request.get(`/api/invoices/${invoiceId}`)).json();
      expect(inv.status).toBe("paid");
      expect(inv.paidAt).toBeTruthy();
    });

    test("void excludes the invoice from billing", async () => {
      const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
        amount: 50,
      });
      const res = await ctx.request.post(`/api/invoices/${invoiceId}/void`);
      expect(res.status()).toBe(200);
      const inv = await (
        await ctx.request.get(`/api/invoices/${invoiceId}`)
      ).json();
      expect(inv.status).toBe("void");
    });
  });
