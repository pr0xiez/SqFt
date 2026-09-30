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
 * The reliability UX: an armed realm failure surfaces as a failed badge
 * WITH the error attached, and Retry drains it to synced. This is the
 * competitor failure mode ("it silently didn't sync") made impossible.
 */
test.describe
  .serial("QBO failure + retry", () => {
    let ctx: BrowserContext;
    let enabled = false;
    let realmId: string;
    let invoiceId: number;

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
      invoiceId = (await seedInvoice(ctx.request, estimateId, { amount: 100 }))
        .invoiceId;
    });
    test.afterAll(async () => {
      await ctx.close();
    });

    test("armed failure → failed badge with error → Retry → synced", async () => {
      test.skip(!enabled, "mock QBO realm not enabled on this deployment");

      // The first entity write after send will 500.
      const arm = await ctx.request.post("/api/qbo-mock/arm", {
        data: { realmId, failNextWrites: 1 },
      });
      expect(arm.ok()).toBeTruthy();

      const send = await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "sam@example.com", subject: "Your invoice" },
      });
      expect(send.ok()).toBeTruthy();

      await waitForQboState(ctx, invoiceId, "failed");

      const page = await ctx.newPage();
      await page.goto(`/invoices/${invoiceId}`);
      await expect(page.getByText("QuickBooks · failed")).toBeVisible();

      await page.getByRole("button", { name: "Retry" }).click();
      await waitForQboState(ctx, invoiceId, "synced");
      // The badge polls while pending, so the same page flips to synced
      // without a reload.
      await expect(page.getByText("QuickBooks ✓")).toBeVisible({
        timeout: 15_000,
      });
      await page.close();

      const realm = await readMockRealm(ctx, realmId);
      expect(realm.invoices).toHaveLength(1);
    });
  });
