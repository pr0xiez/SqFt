import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe
  .serial("Invoice send", () => {
    let ctx: BrowserContext;
    let invoiceId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
      const { estimateId } = await seedEstimateWithLineItem(
        ctx.request,
        siteMeasureId
      );
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const est = await get.json();
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...est.lineItems[0], qty: 100 }] },
      });
      invoiceId = (await seedInvoice(ctx.request, estimateId, { amount: 100 }))
        .invoiceId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("sending flips the invoice to sent", async () => {
      const res = await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "customer@example.com", subject: "Invoice #1" },
      });
      expect(res.status()).toBe(200);

      const get = await ctx.request.get(`/api/invoices/${invoiceId}`);
      const inv = await get.json();
      expect(inv.status).toBe("sent");
      expect(inv.sentToEmail).toBe("customer@example.com");
    });

    test("invalid email returns 400", async () => {
      const res = await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "nope", subject: "x" },
      });
      expect(res.status()).toBe(400);
    });

    test("cross-org POST send returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.post(
        `/api/invoices/${invoiceId}/send`,
        { data: { to: "customer@example.com", subject: "Invoice" } }
      );
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });
  });
