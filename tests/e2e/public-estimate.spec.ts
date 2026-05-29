import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg, workerOrg } from "./fixtures/org";
import { createLocation } from "./fixtures/seed";

// ── 1.4 Public token-authed estimate view ────────────────────────────────────────
//
// Tests are serial: beforeAll logs in as the seeded demo user, creates a
// customer + siteMeasure, creates a draft estimate from that siteMeasure, then
// generates an approval token. Every test exercises the public /q/[token]
// route or an interaction with it.

test.describe
  .serial("1.4 Public estimate view", () => {
    let estimateId: number;
    let approvalToken: string;
    let orgName: string;

    test.beforeAll(async ({ browser }) => {
      const ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      orgName = (await workerOrg(browser)).orgName;

      const custRes = await ctx.request.post("/api/customers", {
        data: { name: "Carla Customer", source: "phone" },
      });
      const customer = await custRes.json();

      const location = await createLocation(ctx.request, customer.id, {
        address: "500 Public Way",
      });

      const estRes = await ctx.request.post("/api/site-measures", {
        data: { locationId: location.id },
      });
      const siteMeasure = await estRes.json();
      const siteMeasureId = siteMeasure.id;

      // Create a draft estimate from the siteMeasure
      const estimateRes = await ctx.request.post("/api/estimates", {
        data: { siteMeasureId },
      });
      const estimate = await estimateRes.json();
      estimateId = estimate.id;

      // Rotate (and obtain) the estimate's approval token
      const tokenRes = await ctx.request.post(
        `/api/estimates/${estimateId}/approval-token`
      );
      const tokenJson = await tokenRes.json();
      approvalToken = tokenJson.approvalToken;

      await ctx.close();
    });

    // ── token shape ────────────────────────────────────────────────────────────

    test("1.4.1 approval-token endpoint returns a URL-safe token", () => {
      expect(approvalToken).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(approvalToken.length).toBeGreaterThanOrEqual(32);
    });

    // ── public route ──────────────────────────────────────────────────────────

    test("1.4.2 valid token renders the public estimate without auth", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const res = await page.goto(`/q/${approvalToken}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByText(/^Estimate$/i).first()).toBeVisible();
      await expect(page.getByText("Carla Customer")).toBeVisible();
      await expect(
        page.getByText(orgName, { exact: true }).first()
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
      await loginAsWorkerOrg(browser, ctx);
      // Rotate to a new token via the API
      const rotateRes = await ctx.request.post(
        `/api/estimates/${estimateId}/approval-token`
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
        `/api/estimates/${estimateId}/approval-token`
      );
      expect(res.status()).toBe(401);
      await ctx.close();
    });
  });
