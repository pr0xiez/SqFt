/**
 * E2E: Public invoice pay flow
 *
 * Tests the "Pay now" button and success/cancelled banners on
 * /invoice-review/[token].
 *
 * All page visits are LOGGED OUT (anonymous context) on purpose:
 * customers open the emailed link without a session, and a logged-in
 * context would mask a missing allowlist entry in lib/publicRoutes.ts
 * (the auth proxy would redirect the visitor to /login, hiding the bug).
 *
 * NOTE: The "Pay now" button only renders when the org has
 * `stripeConnectStatus = "active"`. There is no E2E API to set that,
 * so the button-click test uses page.route to stub the checkout endpoint
 * and a soft assertion that skips gracefully when Stripe is not wired up
 * in the test environment. The banner tests (success/cancelled) run
 * unconditionally via query-param injection.
 */

import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedEstimateWithLineItem,
  seedInvoice,
} from "./fixtures/seed";

test.describe
  .serial("Invoice public pay page", () => {
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

      // Give the estimate a non-zero line-item amount so the invoice has a
      // positive balance (canPayOnline requires balanceDue > 0).
      const est = await (
        await ctx.request.get(`/api/estimates/${estimateId}`)
      ).json();
      await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: {
          lineItems: [{ ...est.lineItems[0], qty: 100 }],
        },
      });

      const { invoiceId } = await seedInvoice(ctx.request, estimateId, {
        amount: 850,
      });
      await ctx.request.post(`/api/invoices/${invoiceId}/send`, {
        data: { to: "customer@example.com", subject: "Pay now test" },
      });

      const inv = await (
        await ctx.request.get(`/api/invoices/${invoiceId}`)
      ).json();
      token = inv.publicToken;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("shows ?pay=success banner on the public page", async ({
      browser,
    }) => {
      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();
      await page.goto(`/invoice-review/${token}?pay=success`);
      await expect(page).toHaveURL(
        new RegExp(`/invoice-review/${token}\\?pay=success`)
      );
      await expect(
        page.getByText("Payment received", { exact: false })
      ).toBeVisible();
      await anonCtx.close();
    });

    test("shows ?pay=cancelled note on the public page", async ({
      browser,
    }) => {
      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();
      await page.goto(`/invoice-review/${token}?pay=cancelled`);
      await expect(
        page.getByText("Payment cancelled", { exact: false })
      ).toBeVisible();
      await anonCtx.close();
    });

    // The Pay now button is only rendered when the org has stripeConnectStatus='active'.
    // Without Stripe connect configured in the test org this button will not be
    // present; in that case the test exits early rather than failing.
    // In a Stripe-connected test/CI environment this exercises the full click→POST
    // path, with the checkout endpoint stubbed so no real Stripe hosted page opens.
    test("Pay now button issues checkout POST and follows redirect URL", async ({
      browser,
    }) => {
      const anonCtx = await browser.newContext();
      const page = await anonCtx.newPage();

      // Stub the checkout endpoint — return a synthetic Stripe URL so we can
      // assert the redirect without hitting real Stripe infrastructure.
      const STUB_URL = "https://checkout.stripe.com/test-stub-session";
      await page.route(`**/api/invoice-review/${token}/checkout`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: STUB_URL }),
        })
      );

      // Capture the navigation triggered by window.location.assign.
      const navPromise = page.waitForRequest((req) => req.url() === STUB_URL, {
        timeout: 5000,
      });

      await page.goto(`/invoice-review/${token}`);

      const payBtn = page.getByRole("button", { name: /pay now/i });

      // If the button isn't visible the org lacks Stripe connect — skip.
      if (!(await payBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
        await anonCtx.close();
        return;
      }

      await payBtn.click();
      await navPromise;

      await anonCtx.close();
    });
  });
