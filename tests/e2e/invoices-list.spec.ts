import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

/**
 * Row locator for an invoice list row. Rows are <button> elements containing
 * the mono `#<invoiceNumber>` label. A word boundary after the number keeps
 * `#12` from substring-matching `#120` (the worker-org DB persists invoices
 * across runs). Status pills are also buttons but never contain "#".
 */
function invoiceRow(page: Page, invoiceNumber: number) {
  return page
    .locator("button")
    .filter({ hasText: new RegExp(`#${invoiceNumber}\\b`) });
}

test.describe
  .serial("Invoices list page", () => {
    let ctx: BrowserContext;
    let sentInvoiceNumber: number;
    let draftInvoiceNumber: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
      const { estimateId } = await seedEstimateWithLineItem(
        ctx.request,
        siteMeasureId
      );
      // give the line item quantity so the estimate has a non-zero total
      const est = await (
        await ctx.request.get(`/api/estimates/${estimateId}`)
      ).json();
      const li = est.lineItems[0];
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...li, qty: 100 }] },
      });

      // one OPEN invoice (sent) and one DRAFT invoice
      const sent = await seedInvoice(ctx.request, estimateId, { amount: 100 });
      const sendRes = await ctx.request.post(
        `/api/invoices/${sent.invoiceId}/send`,
        { data: { to: "customer@example.com", subject: "Invoice" } }
      );
      expect(sendRes.ok()).toBe(true);
      const draft = await seedInvoice(ctx.request, estimateId, { amount: 50 });

      sentInvoiceNumber = (
        await (await ctx.request.get(`/api/invoices/${sent.invoiceId}`)).json()
      ).invoiceNumber;
      draftInvoiceNumber = (
        await (await ctx.request.get(`/api/invoices/${draft.invoiceId}`)).json()
      ).invoiceNumber;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("Invoices nav tab opens the list defaulting to All", async () => {
      const page = await ctx.newPage();
      await page.goto("/estimates");
      await page.getByRole("link", { name: "Invoices" }).first().click();
      await expect(page).toHaveURL(/\/invoices(\?.*)?$/);

      // Default is the All filter: the just-sent invoice sorts first (sentAt
      // desc)…
      await expect(invoiceRow(page, sentInvoiceNumber).first()).toBeVisible();
      // …and the draft is included too. Search by number so the nulls-last
      // draft is on page 1 even with invoices accumulated from earlier runs.
      await page
        .locator('input[placeholder^="Search invoice"]')
        .fill(`#${draftInvoiceNumber}`);
      await expect(invoiceRow(page, draftInvoiceNumber).first()).toBeVisible();
      await page.close();
    });

    test("Open pill excludes drafts", async () => {
      const page = await ctx.newPage();
      await page.goto("/invoices");
      // Exact match: the dev-tools button "Open Next.js Dev Tools" also
      // starts with "Open". Generous timeout for Vercel preview cold starts.
      await page
        .getByRole("button", { name: "Open", exact: true })
        .click({ timeout: 30_000 });

      const search = page.locator('input[placeholder^="Search invoice"]');
      // The sent invoice is open → visible under the Open filter.
      await search.fill(`#${sentInvoiceNumber}`);
      await expect(invoiceRow(page, sentInvoiceNumber).first()).toBeVisible();
      // The draft is not open → excluded even when searched directly.
      await search.fill(`#${draftInvoiceNumber}`);
      await expect(invoiceRow(page, draftInvoiceNumber)).toHaveCount(0);
      await page.close();
    });

    test("Draft pill reveals the draft invoice", async () => {
      const page = await ctx.newPage();
      await page.goto("/invoices");
      await page.getByRole("button", { name: /^Draft/ }).click();
      // Drafts have no sentAt and sort last; search by number so the row is
      // on page 1 even with invoices accumulated from earlier runs.
      await page
        .locator('input[placeholder^="Search invoice"]')
        .fill(`#${draftInvoiceNumber}`);
      await expect(invoiceRow(page, draftInvoiceNumber).first()).toBeVisible();
      await page.close();
    });

    test("clicking a row opens the invoice detail", async () => {
      const page = await ctx.newPage();
      await page.goto("/invoices");
      await invoiceRow(page, sentInvoiceNumber).first().click();
      await expect(page).toHaveURL(/\/invoices\/\d+/);
      await page.close();
    });
  });
