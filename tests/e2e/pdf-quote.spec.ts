import { expect, type Page, test } from "@playwright/test";

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

// ── 2.1 PDF Quote Generation ──────────────────────────────────────────────────
//
// Tests are serial: beforeAll creates one user + customer + estimate that all
// subsequent tests navigate to.

test.describe
  .serial("2.1 PDF Quote Generation", () => {
    let userEmail: string;
    const userPassword = "password123";
    let estimateId: number;
    let quoteNumber: number;

    test.beforeAll(async ({ browser }) => {
      userEmail = uniqueEmail();
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      // Sign up
      await ctx.request.post("/api/auth/signup", {
        data: {
          name: "PDF Test User",
          email: userEmail,
          password: userPassword,
        },
      });

      // Log in
      await page.goto("/login");
      await page.fill("#email", userEmail);
      await page.fill("#password", userPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL("/");

      // Complete onboarding so the org exists
      await page.goto("/onboarding");
      await page.fill("#company", "Test Floors LLC");
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL("/");

      // Create a customer (authenticated via shared context cookies)
      const custRes = await ctx.request.post("/api/customers", {
        data: { name: "Alice Builder", source: "phone" },
      });
      const customer = await custRes.json();

      // Create an estimate — quoteNumber assigned atomically in createEstimate()
      const estRes = await ctx.request.post("/api/estimates", {
        data: { customerId: customer.id },
      });
      const estimate = await estRes.json();
      estimateId = estimate.id;
      quoteNumber = estimate.quoteNumber;

      await ctx.close();
    });

    async function login(page: Page) {
      await page.goto("/login");
      await page.fill("#email", userEmail);
      await page.fill("#password", userPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL("/");
    }

    // ── quote number assignment ────────────────────────────────────────────────

    test("2.1.1 quoteNumber is a positive integer assigned on estimate creation", () => {
      expect(typeof quoteNumber).toBe("number");
      expect(quoteNumber).toBeGreaterThanOrEqual(1);
    });

    test("2.1.2 a second estimate gets the next sequential quote number", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      await page.goto("/login");
      await page.fill("#email", userEmail);
      await page.fill("#password", userPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");

      const custRes = await ctx.request.post("/api/customers", {
        data: { name: "Bob Builder", source: "phone" },
      });
      const customer = await custRes.json();

      const estRes = await ctx.request.post("/api/estimates", {
        data: { customerId: customer.id },
      });
      const estimate2 = await estRes.json();

      expect(estimate2.quoteNumber).toBe(quoteNumber + 1);

      await ctx.close();
    });

    // ── actions dropdown ───────────────────────────────────────────────────────

    test("2.1.3 Actions dropdown button is visible on the estimate page", async ({
      page,
    }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await expect(
        page.getByRole("button", { name: /actions/i })
      ).toBeVisible();
    });

    test("2.1.4 clicking Actions reveals the Download PDF item", async ({
      page,
    }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await expect(
        page.getByRole("button", { name: /download pdf/i })
      ).toBeVisible();
    });

    // ── PDF modal ─────────────────────────────────────────────────────────────

    test("2.1.5 clicking Download PDF opens the PDF modal", async ({
      page,
    }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await page.getByRole("button", { name: /download pdf/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText("Quote PDF")).toBeVisible();
    });

    test("2.1.6 PDF modal subtitle contains the quote number", async ({
      page,
    }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await page.getByRole("button", { name: /download pdf/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("dialog").getByText(`Q-${quoteNumber}`)
      ).toBeVisible();
    });

    test("2.1.7 PDF modal renders a PDF viewer iframe", async ({ page }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await page.getByRole("button", { name: /download pdf/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // PDFViewer renders an iframe once the PDF is generated client-side
      await expect(page.getByRole("dialog").locator("iframe")).toBeVisible({
        timeout: 15_000,
      });
    });

    test("2.1.8 PDF modal header has a Download PDF button once ready", async ({
      page,
    }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await page.getByRole("button", { name: /download pdf/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      // PDFDownloadLink switches from "Generating…" to "Download PDF" once ready
      await expect(
        dialog.getByRole("button", { name: /download pdf/i })
      ).toBeVisible({ timeout: 15_000 });
    });

    // ── dismiss behaviour ─────────────────────────────────────────────────────

    test("2.1.9 Escape closes the PDF modal", async ({ page }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await page.getByRole("button", { name: /download pdf/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    });

    test("2.1.10 Close button dismisses the PDF modal", async ({ page }) => {
      await login(page);
      await page.goto(`/estimates/${estimateId}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await page.getByRole("button", { name: /download pdf/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /close/i }).click();
      await expect(dialog).not.toBeVisible();
    });
  });
