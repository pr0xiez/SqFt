import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
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

    test("cross-org POST payments returns 404", async ({ browser }) => {
      const { invoiceId: crossOrgInvoiceId } = await seedInvoice(
        ctx.request,
        estimateId,
        { amount: 10 }
      );
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.post(
        `/api/invoices/${crossOrgInvoiceId}/payments`,
        { data: { amount: 5, method: "check" } }
      );
      expect(res.status()).toBe(404);
      await otherCtx.close();

      // Confirm the cross-org attempt did not sneak a payment in: the invoice
      // is still unpaid from the worker org's own point of view.
      const inv = await (
        await ctx.request.get(`/api/invoices/${crossOrgInvoiceId}`)
      ).json();
      expect(inv.status).toBe("draft");
    });

    test("cross-org POST void returns 404", async ({ browser }) => {
      const { invoiceId: crossOrgInvoiceId } = await seedInvoice(
        ctx.request,
        estimateId,
        { amount: 10 }
      );
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.post(
        `/api/invoices/${crossOrgInvoiceId}/void`
      );
      expect(res.status()).toBe(404);
      await otherCtx.close();

      // Confirm the cross-org attempt did not void it out from under the
      // worker org.
      const inv = await (
        await ctx.request.get(`/api/invoices/${crossOrgInvoiceId}`)
      ).json();
      expect(inv.status).toBe("draft");
    });
  });
