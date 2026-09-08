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

    // Runs last in the serial block: voiding is terminal. A customer holding a
    // stale link to a cancelled invoice must not be able to view or pay it.
    test("a voided invoice's public link is dead — 404, no Pay invoice CTA", async ({
      browser,
    }) => {
      const voidRes = await ctx.request.post(`/api/invoices/${invoiceId}/void`);
      expect(voidRes.ok()).toBeTruthy();

      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();
      const res = await page.goto(`/invoice-review/${token}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("link", { name: "Pay invoice" })).toHaveCount(
        0
      );
      await anonCtx.close();
    });
  });
