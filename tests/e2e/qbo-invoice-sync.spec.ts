import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsFreshOrg } from "./fixtures/org";
import {
  connectQboViaMock,
  mockRealmEnabled,
  readMockRealm,
  waitForQboState,
} from "./fixtures/qbo";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

/**
 * The core promise, end to end through the deployed app: send an invoice →
 * it lands in the (mock) QBO realm built from the frozen snapshot; record a
 * payment → it lands linked to that invoice; the badge reads "QuickBooks ✓".
 */
test.describe
  .serial("QBO invoice sync", () => {
    let ctx: BrowserContext;
    let enabled = false;
    let realmId: string;
    let invoiceId: number;
    let invoiceNumber: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsFreshOrg(browser, ctx);
      enabled = await mockRealmEnabled(ctx);
      if (!enabled) return;

      const page = await ctx.newPage();
      realmId = await connectQboViaMock(ctx, page);
      await page.close();

      const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
      const { estimateId } = await seedEstimateWithLineItem(
        ctx.request,
        siteMeasureId
      );
      const est = await (
        await ctx.request.get(`/api/estimates/${estimateId}`)
      ).json();
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...est.lineItems[0], qty: 100 }] },
      });
      const seeded = await seedInvoice(ctx.request, estimateId, {
        amount: 100,
      });
      invoiceId = seeded.invoiceId;
      const inv = await (
        await ctx.request.get(`/api/invoices/${invoiceId}`)
      ).json();
      invoiceNumber = inv.invoiceNumber;
    });
    test.afterAll(async () => {
      await ctx.close();
    });

    test("sending the invoice mirrors customer + invoice into the realm", async () => {
      test.skip(!enabled, "mock QBO realm not enabled on this deployment");
      const send = await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "sam@example.com", subject: "Your invoice" },
      });
      expect(send.ok()).toBeTruthy();

      await waitForQboState(ctx, invoiceId, "synced");

      const realm = await readMockRealm(ctx, realmId);
      expect(realm.customers.length).toBe(1);
      const mirrored = realm.invoices.find(
        (i) => i.DocNumber === String(invoiceNumber)
      );
      expect(mirrored).toBeTruthy();
      expect(mirrored?.TotalAmt).toBe(100);
    });

    test("the invoice page shows the synced badge", async () => {
      test.skip(!enabled, "mock QBO realm not enabled on this deployment");
      const page = await ctx.newPage();
      await page.goto(`/invoices/${invoiceId}`);
      await expect(page.getByText("QuickBooks ✓")).toBeVisible();
      await page.close();
    });

    test("recording a payment mirrors it, linked to the invoice", async () => {
      test.skip(!enabled, "mock QBO realm not enabled on this deployment");
      const pay = await ctx.request.post(
        `/api/invoices/${invoiceId}/payments`,
        { data: { amount: 60, method: "check" } }
      );
      expect(pay.ok()).toBeTruthy();

      await expect
        .poll(
          async () => {
            await ctx.request.get("/api/qbo/status");
            const realm = await readMockRealm(ctx, realmId);
            return realm.payments.length;
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] }
        )
        .toBe(1);

      const realm = await readMockRealm(ctx, realmId);
      const payment = realm.payments[0];
      expect(payment.TotalAmt).toBe(60);
      const invoiceQboId = realm.invoices.find(
        (i) => i.DocNumber === String(invoiceNumber)
      )?.Id;
      expect(payment.Line?.[0]?.LinkedTxn?.[0]?.TxnId).toBe(invoiceQboId);
    });
  });
