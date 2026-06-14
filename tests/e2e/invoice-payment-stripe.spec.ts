import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

// The webhook is a BARE route (not wrapped in apiRoute/publicRoute). It must be
// reachable WITHOUT a session — the Stripe signature is the credential, and the
// route is allowlisted in lib/publicRoutes.ts. The default request fixture is
// logged-out (no global storageState), so this also proves the allowlist entry:
// without it the auth proxy would redirect/deny instead of returning 400. The
// 400 holds whether or not Stripe env keys are set, since an unverifiable
// signature (or an unconfigured client) is rejected before any dispatch.
test("Stripe webhook is reachable logged-out and 400s a bad signature", async ({
  request,
}) => {
  const res = await request.post("/api/stripe/webhook", {
    headers: { "stripe-signature": "bad" },
    data: "{}",
  });
  expect(res.status()).toBe(400);
});

test.describe
  .serial("Online payments — public Pay button gating", () => {
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
      // Give the single line item a quantity so the estimate has a non-zero
      // total to invoice against.
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { lineItems: [{ ...est.lineItems[0], qty: 100 }] },
      });
      const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
        amount: 100,
      });
      // Sending freezes the snapshot the public page requires and mints the
      // publicToken.
      await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "customer@example.com", subject: "Invoice" },
      });
      const inv = await (
        await ctx.request.get(`/api/invoices/${invoiceId}`)
      ).json();
      token = inv.publicToken;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    // Navigated LOGGED OUT: customers open the emailed link with no session, and
    // a logged-in context would mask a missing /invoice-review/ allowlist entry.
    test("un-onboarded org hides the Pay button on the public invoice", async ({
      browser,
    }) => {
      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();
      await page.goto(`/invoice-review/${token}`);
      await expect(page.getByText("Balance due")).toBeVisible();
      // The worker org is un-onboarded (stripeChargesEnabled defaults to false),
      // so the page must not offer the online Pay button.
      await expect(
        page.getByRole("link", { name: /pay invoice/i })
      ).toHaveCount(0);
      await anonCtx.close();
    });

    // The positive path — an onboarded (stripeChargesEnabled=true) org SHOWS the
    // Pay button — can't be driven end-to-end here: that flag is system-managed
    // (written only by the account.updated webhook) and the e2e API surface has
    // no hook to force it without real Stripe onboarding, which CI can't do. It
    // IS covered at the unit/component level instead: PublicInvoiceView renders
    // the "Pay invoice" link whenever payUrl is set (PublicInvoiceView.test.tsx),
    // the public page derives payUrl from `canPay` (which gates on
    // stripeChargesEnabled), and the pay route's redirect/guards are covered by
    // __tests__/api/invoice-pay.test.ts.
    test.skip("onboarded org shows the Pay button (covered by unit/component tests)", () => {});
  });
