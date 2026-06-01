import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createCustomerAndEstimate,
  createSiteMeasure,
  seedApprovedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

/**
 * True only for the list endpoint with a query string
 * (`/api/estimates?…`), never the detail call (`/api/estimates/{id}`).
 */
function isListRequest(url: string): boolean {
  return url.includes("/api/estimates?");
}

test.describe("13.1 Estimates list page", () => {
  test("13.1.1 seeded estimate appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );

    // EstimateList renders buttons (not <a> links). Fetch the estimate number to
    // find the row via the mono #N label.
    const estimate = await (
      await ctx.request.get(`/api/estimates/${estimateId}`)
    ).json();
    const estimateNumber = estimate.estimateNumber as number;

    await page.goto("/estimates");
    await expect(
      page
        .locator("button")
        .filter({ hasText: `#${estimateNumber}` })
        .first()
    ).toBeVisible();
    await ctx.close();
  });

  test("13.1.2 revised estimate shows ↶ rev badge", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );
    const revRes = await ctx.request.post(
      `/api/estimates/${estimateId}/revise`
    );
    expect(revRes.status()).toBe(200);

    await page.goto("/estimates");
    await expect(
      page.locator('[title="Revised estimate"]').first()
    ).toBeVisible();
    await ctx.close();
  });

  test("13.1.3 other-org estimate does not appear in this org's list", async ({
    browser,
  }) => {
    // Estimate numbers are per-org sequential, so they collide across orgs and
    // can't distinguish tenants. Assert isolation via uniquely-named customers:
    // the worker org's own estimate is listed; the secondary org's is not.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mineCustomerName = `Worker ${suffix}`;
    const otherCustomerName = `Secondary ${suffix}`;

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const otherCust = await createCustomer(ctxB.request, {
      name: otherCustomerName,
    });
    const otherEst = await createSiteMeasure(ctxB.request, otherCust.id);
    await seedEstimateWithLineItem(ctxB.request, otherEst.id);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctxA);
    const mineCust = await createCustomer(ctxA.request, {
      name: mineCustomerName,
    });
    const mineEst = await createSiteMeasure(ctxA.request, mineCust.id);
    await seedEstimateWithLineItem(ctxA.request, mineEst.id);

    await page.goto("/estimates");
    await expect(page.getByText(mineCustomerName)).toBeVisible();
    await expect(page.getByText(otherCustomerName)).toHaveCount(0);
    await ctxA.close();
  });
});

test.describe("13.2 Estimates list — server-driven pagination", () => {
  test("13.2.1 list request carries page & perPage params", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const [listResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.request().method() === "GET" &&
          r.status() === 200
      ),
      page.goto("/estimates"),
    ]);

    const listUrl = listResp.url();
    expect(listUrl).toMatch(/[?&]page=\d+/);
    expect(listUrl).toMatch(/[?&]perPage=\d+/);
    await ctx.close();
  });

  test("13.2.2 status pill filters server-side with status=approved", async ({
    browser,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Avoid the literal pill labels ("Approved"/"Draft") in customer names so a
    // text/role lookup can't confuse a seeded row with a status pill.
    const approvedName = `Greenfield ${suffix}`;
    const draftName = `Birchwood ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    // Seed one approved + one draft estimate with distinctive customer names.
    const approvedCust = await createCustomer(ctx.request, {
      name: approvedName,
    });
    const approvedSm = await createSiteMeasure(ctx.request, approvedCust.id);
    await seedApprovedEstimate(ctx.request, approvedSm.id);

    const draftCust = await createCustomer(ctx.request, { name: draftName });
    const draftSm = await createSiteMeasure(ctx.request, draftCust.id);
    await seedEstimateWithLineItem(ctx.request, draftSm.id);

    await page.goto("/estimates");
    // Both rows are present under the default "All" filter.
    await expect(page.getByText(approvedName)).toBeVisible();
    await expect(page.getByText(draftName)).toBeVisible();

    // Clicking "Approved" issues a request carrying status=approved.
    const [filterResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes("status=approved") &&
          r.status() === 200
      ),
      page
        .getByRole("button", { name: /^Approved/ })
        .first()
        .click(),
    ]);
    expect(filterResp.url()).toContain("status=approved");

    // The approved row remains; the draft row drops out.
    await expect(page.getByText(approvedName)).toBeVisible();
    await expect(page.getByText(draftName)).toHaveCount(0);
    await ctx.close();
  });

  test("13.2.3 search issues a debounced request carrying q=", async ({
    browser,
  }) => {
    // Use a single-token search term (no spaces) so the encoded `q=` value is
    // stable: URLSearchParams would encode a space as `+`, not `%20`.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const term = `Zephyr${suffix.replace(/-/g, "")}`;
    const targetName = `${term} Flooring`;
    const otherName = `Other ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const targetCust = await createCustomer(ctx.request, { name: targetName });
    const targetSm = await createSiteMeasure(ctx.request, targetCust.id);
    await seedEstimateWithLineItem(ctx.request, targetSm.id);

    const otherCust = await createCustomer(ctx.request, { name: otherName });
    const otherSm = await createSiteMeasure(ctx.request, otherCust.id);
    await seedEstimateWithLineItem(ctx.request, otherSm.id);

    await page.goto("/estimates");
    await expect(page.getByText(targetName)).toBeVisible();

    const searchInput = page.locator('input[placeholder^="Search estimate"]');

    // Typing fires a debounced (~300ms) request carrying q=<term>.
    const [searchResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes(`q=${term}`) &&
          r.status() === 200
      ),
      searchInput.fill(term),
    ]);
    expect(searchResp.url()).toContain(`q=${term}`);

    // The list narrows to the matching customer; the other drops out.
    await expect(page.getByText(targetName)).toBeVisible();
    await expect(page.getByText(otherName)).toHaveCount(0);
    await ctx.close();
  });
});
