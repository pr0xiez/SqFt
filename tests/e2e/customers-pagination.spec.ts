import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import { reloadFresh } from "./fixtures/seed";

// Golden-path test for the new list-table primitives: pagination,
// URL state persistence, and density localStorage persistence. We
// stand up enough customers to guarantee >1 page at the default
// perPage (25), then drive the UI through one realistic flow.

const PAGE_SIZE_TAG = `e2e-pg-${Date.now()}`;
const ROW_COUNT = 30; // exceeds default perPage of 25 → 2 pages

test.describe
  .serial("16.1 Customers list — pagination + table state", () => {
    test("16.1.1 paginates, persists page to URL, restores on reload", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await loginAsWorkerOrg(browser, ctx);

      // Seed N customers with a unique prefix so we can isolate them with
      // the search filter, regardless of how many seed/demo rows exist.
      await Promise.all(
        Array.from({ length: ROW_COUNT }, (_, i) =>
          ctx.request.post("/api/customers", {
            data: {
              name: `${PAGE_SIZE_TAG} ${String(i + 1).padStart(2, "0")}`,
              source: "phone",
            },
          })
        )
      );

      await reloadFresh(page);
      await page.goto("/customers");
      await expect(page.getByText("Loading…")).toHaveCount(0);

      // Filter to just our seeded rows so the visible total is deterministic.
      await page.getByPlaceholder(/Search/i).fill(PAGE_SIZE_TAG);

      // Pagination footer should appear with the range readout. We don't
      // assert exact numbers (other tests may have lingering test rows under
      // a different tag); we assert structure.
      await expect(page.getByText(/of \d+ customer/i)).toBeVisible();

      // We're on page 1 by default — no ?page query param.
      expect(new URL(page.url()).searchParams.get("page")).toBeNull();

      // The default sort is surfaced in the URL from first paint, not only
      // after the first pagination interaction.
      await expect
        .poll(() => new URL(page.url()).searchParams.get("sort"), {
          timeout: 2000,
        })
        .toBe("createdAt");
      expect(new URL(page.url()).searchParams.get("dir")).toBe("desc");

      // Advance to page 2 via the Next button.
      await page.getByRole("button", { name: "Next page" }).click();

      // URL should now reflect page 2.
      await expect
        .poll(() => new URL(page.url()).searchParams.get("page"), {
          timeout: 2000,
        })
        .toBe("2");

      // Reload and confirm the hook rehydrates page=2 from the URL.
      await page.reload();
      await expect(page.getByText("Loading…")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("page")).toBe("2");

      await ctx.close();
    });

    test("16.1.2 density preference persists across reload via localStorage", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await loginAsWorkerOrg(browser, ctx);

      await page.goto("/customers");
      await expect(page.getByText("Loading…")).toHaveCount(0);

      // Flip to compact density.
      await page.getByRole("button", { name: "Compact density" }).click();

      // Confirm the value made it into localStorage.
      const stored = await page.evaluate(() =>
        window.localStorage.getItem("tbl:customers:density")
      );
      expect(stored).toBe("compact");

      // Reload (without nuking localStorage) and confirm the toggle is
      // still in the compact state via aria-pressed.
      await page.reload();
      await expect(page.getByText("Loading…")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Compact density" })
      ).toHaveAttribute("aria-pressed", "true");

      await ctx.close();
    });

    test("16.1.3 clicking a sortable column header writes sort/dir to URL", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await loginAsWorkerOrg(browser, ctx);

      await page.goto("/customers");
      await expect(page.getByText("Loading…")).toHaveCount(0);

      // The Customer column header is a button labeled "Sort by Customer, …".
      await page.getByRole("button", { name: /Sort by Customer/i }).click();

      // Default direction for the name column is asc per CustomerList wiring.
      await expect
        .poll(() => new URL(page.url()).searchParams.get("sort"), {
          timeout: 2000,
        })
        .toBe("name");
      expect(new URL(page.url()).searchParams.get("dir")).toBe("asc");

      // Second click flips to desc.
      await page.getByRole("button", { name: /Sort by Customer/i }).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("dir"), {
          timeout: 2000,
        })
        .toBe("desc");

      await ctx.close();
    });
  });
