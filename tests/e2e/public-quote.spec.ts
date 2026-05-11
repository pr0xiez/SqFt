import { expect, type Page, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures/auth";

// ── 1.4 Public token-authed quote view ────────────────────────────────────────
//
// Tests are serial: beforeAll logs in as the seeded demo user, creates a
// customer + estimate, creates a draft quote from that estimate, then
// generates an approval token. Every test exercises the public /q/[token]
// route or an interaction with it.

test.describe
  .serial("1.4 Public quote view", () => {
    let quoteId: number;
    let approvalToken: string;

    test.beforeAll(async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      await page.goto("/login");
      await page.fill("#email", DEMO_EMAIL);
      await page.fill("#password", DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL("/");

      const custRes = await ctx.request.post("/api/customers", {
        data: { name: "Carla Customer", source: "phone" },
      });
      const customer = await custRes.json();

      const estRes = await ctx.request.post("/api/estimates", {
        data: { customerId: customer.id },
      });
      const estimate = await estRes.json();
      const estimateId = estimate.id;

      // Create a draft quote from the estimate
      const quoteRes = await ctx.request.post("/api/quotes", {
        data: { estimateId },
      });
      const quote = await quoteRes.json();
      quoteId = quote.id;

      // Rotate (and obtain) the quote's approval token
      const tokenRes = await ctx.request.post(
        `/api/quotes/${quoteId}/approval-token`
      );
      const tokenJson = await tokenRes.json();
      approvalToken = tokenJson.approvalToken;

      await ctx.close();
    });

    async function login(page: Page) {
      await page.goto("/login");
      await page.fill("#email", DEMO_EMAIL);
      await page.fill("#password", DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL("/");
    }

    // ── token shape ────────────────────────────────────────────────────────────

    test("1.4.1 approval-token endpoint returns a URL-safe token", () => {
      expect(approvalToken).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(approvalToken.length).toBeGreaterThanOrEqual(32);
    });

    // ── public route ──────────────────────────────────────────────────────────

    test("1.4.2 valid token renders the public quote without auth", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const res = await page.goto(`/q/${approvalToken}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByText(/^Quote$/i).first()).toBeVisible();
      await expect(page.getByText("Carla Customer")).toBeVisible();
      await expect(
        page.getByText("Johnson Flooring Co.", { exact: true })
      ).toBeVisible();
      await ctx.close();
    });

    test("1.4.3 invalid token returns 404", async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const res = await page.goto("/q/totally-not-a-real-token-1234567890");
      expect(res?.status()).toBe(404);
      await ctx.close();
    });

    test("1.4.4 short/garbage token returns 404 without DB lookup", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const res = await page.goto("/q/abc");
      expect(res?.status()).toBe(404);
      await ctx.close();
    });

    // ── regeneration invalidates old token ────────────────────────────────────

    test("1.4.5 regenerating the token invalidates the old one", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page);
      // Rotate to a new token via the API
      const rotateRes = await ctx.request.post(
        `/api/quotes/${quoteId}/approval-token`
      );
      const { approvalToken: newToken } = await rotateRes.json();
      expect(newToken).not.toBe(approvalToken);

      // Old token now 404s
      const oldPage = await ctx.newPage();
      const oldRes = await oldPage.goto(`/q/${approvalToken}`);
      expect(oldRes?.status()).toBe(404);

      // New token works
      const newPage = await ctx.newPage();
      const newRes = await newPage.goto(`/q/${newToken}`);
      expect(newRes?.status()).toBe(200);

      // Reset for downstream tests in case any rely on approvalToken
      approvalToken = newToken;
      await ctx.close();
    });

    // ── tenant isolation ──────────────────────────────────────────────────────

    test("1.4.6 unauthenticated POST to approval-token endpoint is rejected", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const res = await ctx.request.post(
        `/api/quotes/${quoteId}/approval-token`
      );
      expect(res.status()).toBe(401);
      await ctx.close();
    });
  });
