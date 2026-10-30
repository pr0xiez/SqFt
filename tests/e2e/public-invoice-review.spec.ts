import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  getInvoicePublicToken,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe
  .serial("Public invoice review", () => {
    let ctx: BrowserContext;
    let token: string;
    let invoiceId: number;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      ({ estimateId } = await seedEstimateWithLineItem(
        ctx.request,
        ids.siteMeasureId
      ));
      const est = await (
        await ctx.request.get(`/api/estimates/${estimateId}`)
      ).json();
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { markupPct: 25, lineItems: [{ ...est.lineItems[0], qty: 100 }] },
      });
      ({ invoiceId } = await seedInvoice(ctx.request, estimateId, {
        amount: 100,
      }));
      await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "customer@example.com", subject: "Invoice #1" },
      });
      // Partial payment: the public page must show the remaining balance,
      // not the full invoice amount.
      await ctx.request.post(`/api/invoices/${invoiceId}/payments`, {
        data: { amount: 40, method: "check" },
      });
      token = await getInvoicePublicToken(ctx.request, invoiceId);
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    // The public page is navigated LOGGED OUT on purpose: customers open the
    // emailed link with no session, and a logged-in context would mask a
    // missing allowlist entry in lib/publicRoutes.ts (the proxy would
    // redirect anonymous visitors to /login).
    test("public invoice loads without a session and shows the remaining balance, never a Markup line", async ({
      browser,
    }) => {
      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();
      await page.goto(`/invoice-review/${token}`);
      await expect(page).toHaveURL(new RegExp(`/invoice-review/${token}$`));
      await expect(page.getByText("Balance due")).toBeVisible();
      await expect(page.getByText("Paid to date")).toBeVisible();
      // Remaining balance ($100 − $40) appears in the header and balance row.
      await expect(page.getByText("$60.00").first()).toBeVisible();
      await expect(page.getByText("Markup", { exact: false })).toHaveCount(0);
      await expect(
        page.getByText("Labor & margin", { exact: false })
      ).toHaveCount(0);
      await anonCtx.close();
    });

    // An invoice with a recorded payment can't be voided (INVOICE_HAS_PAYMENTS):
    // the server refuses, the builder hides Void and says why, and the
    // customer's link keeps working.
    test("an invoice with a payment can't be voided — 409, Void hidden, link still live", async ({
      browser,
    }) => {
      const voidRes = await ctx.request.post(`/api/invoices/${invoiceId}/void`);
      expect(voidRes.status()).toBe(409);
      expect((await voidRes.json()).error.code).toBe("INVOICE_HAS_PAYMENTS");

      const page = await ctx.newPage();
      await page.goto(`/invoices/${invoiceId}`);
      await expect(
        page.getByRole("button", { name: "Record payment" })
      ).toBeVisible();
      await expect(
        page.getByText(
          "This invoice has payments recorded, so it can't be voided.",
          { exact: false }
        )
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Void", exact: true })
      ).toHaveCount(0);
      await page.close();

      const anonCtx = await browser.newContext();
      const anonPage = await anonCtx.newPage();
      const res = await anonPage.goto(`/invoice-review/${token}`);
      expect(res?.status()).toBe(200);
      await expect(anonPage.getByText("Balance due")).toBeVisible();
      await anonCtx.close();
    });

    // A customer holding a stale link to a cancelled invoice must not be able
    // to view or pay it. Uses its own unpaid invoice: one with payments can't
    // be voided (see above).
    test("a voided invoice's public link is dead — 404, no Pay invoice CTA", async ({
      browser,
    }) => {
      const { invoiceId: unpaidId } = await seedInvoice(
        ctx.request,
        estimateId,
        { amount: 20 }
      );
      const sendRes = await ctx.request.post(`/api/invoices/${unpaidId}/send`, {
        data: { to: "customer@example.com", subject: "Invoice #2" },
      });
      expect(sendRes.status()).toBe(200);
      const unpaidToken = await getInvoicePublicToken(ctx.request, unpaidId);

      const voidRes = await ctx.request.post(`/api/invoices/${unpaidId}/void`);
      expect(voidRes.ok()).toBeTruthy();

      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();
      const res = await page.goto(`/invoice-review/${unpaidToken}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("link", { name: "Pay invoice" })).toHaveCount(
        0
      );
      await anonCtx.close();
    });
  });
