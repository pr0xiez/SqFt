import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createLocation,
  createSiteMeasure,
  reloadFresh,
  seedApprovedEstimate,
  seedDeclinedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 17.1 Customer detail page ───────────────────────────────────────────────
// Characterization coverage for the CustomerDetail seams (info card, stat strip,
// pipeline rows, locations add-form, start-site-measure branching) ahead of the
// component decomposition. Seeds via API, drives the UI, asserts rendered output
// and persisted shape.

test.describe("17.1 Customer detail — info card", () => {
  test("17.1.1 editing a field via blur PATCHes and persists on reload", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Edit Me ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // The info-card inputs have no accessible labels, so target by type.
    const phoneInput = page.locator('input[type="tel"]');
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/customers/${customer.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      (async () => {
        await phoneInput.fill("555-0100");
        await phoneInput.blur();
      })(),
    ]);
    expect(patch.status()).toBe(200);

    await reloadFresh(page);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.locator('input[type="tel"]')).toHaveValue("555-0100");

    await ctx.close();
  });
});

test.describe("17.2 Customer detail — stats & pipeline", () => {
  test("17.2.1 stat strip reflects seeded estimate statuses", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Stats ${Date.now()}`,
    });
    const sm = await createSiteMeasure(ctx.request, customer.id);
    // 1 approved, 1 declined, 1 open on this site measure. Approving an estimate
    // supersedes (auto-declines) its open siblings, so the plain draft is seeded
    // LAST — after the approval — to leave exactly one open estimate.
    await seedApprovedEstimate(ctx.request, sm.id);
    await seedDeclinedEstimate(ctx.request, sm.id);
    await seedEstimateWithLineItem(ctx.request, sm.id);

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // "Accepted" stat shows 1; the declined hint reads "1 declined".
    // Exact match avoids the "✓ Accepted" pill in the site-measure row.
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(page.getByText("1 declined")).toBeVisible();
    // Site Measures stat label (scoped to main to avoid the nav link / title).
    await expect(
      page.getByRole("main").getByText("Site Measures", { exact: true })
    ).toBeVisible();

    await ctx.close();
  });

  test("17.2.2 pipeline rows render and navigate to estimate + site measure", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Pipeline ${Date.now()}`,
    });
    const sm = await createSiteMeasure(ctx.request, customer.id);
    const { estimateId } = await seedEstimateWithLineItem(ctx.request, sm.id);

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    // Exact heading avoids matching the customer name if it contains "Pipeline".
    await expect(
      page.getByRole("heading", { name: "Pipeline", exact: true })
    ).toBeVisible();

    // The estimate row shows its E# and links to the estimate.
    await page.getByText(/E#\d+/).first().click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}$`));

    // Back on the detail page, the site-measure header links to the site measure.
    await page.goBack();
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await page.getByText(/Site Measure #\d+/i).first().click();
    await expect(page).toHaveURL(new RegExp(`/site-measures/${sm.id}$`));

    await ctx.close();
  });
});

test.describe("17.3 Customer detail — locations & start site measure", () => {
  test("17.3.1 add-location form creates and persists a location", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `AddLoc ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    await page.getByRole("button", { name: "+ Add location" }).click();
    await page.getByPlaceholder("Street, City").fill("742 Evergreen Terrace");
    await page.getByPlaceholder("e.g. Rental, Main house").fill("Main");

    const [post] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/locations") &&
          r.request().method() === "POST" &&
          r.status() === 201
      ),
      page.getByRole("button", { name: "Save location" }).click(),
    ]);
    expect(post.status()).toBe(201);

    // Address renders in both the header subtitle and the locations card.
    await expect(
      page.getByText("742 Evergreen Terrace").first()
    ).toBeVisible();

    // Persisted: GET lists the location for this customer.
    const list = await ctx.request.get(
      `/api/locations?customerId=${customer.id}`
    );
    const locs = (await list.json()) as Array<{ address: string }>;
    expect(locs.map((l) => l.address)).toContain("742 Evergreen Terrace");

    await ctx.close();
  });

  test("17.3.2 single-location customer: Start first site measure navigates", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `OneLoc ${Date.now()}`,
    });
    await createLocation(ctx.request, customer.id, { address: "1 Only St" });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    await page
      .getByRole("button", { name: "+ Start first site measure" })
      .click();
    await expect(page).toHaveURL(/\/site-measures\/\d+$/);

    await ctx.close();
  });

  test("17.3.3 zero-location customer: Start first site measure shows a toast", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `NoLoc ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    await page
      .getByRole("button", { name: "+ Start first site measure" })
      .click();
    await expect(page.getByText("Add a location first")).toBeVisible();
    // Stays on the customer page (no navigation).
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));

    await ctx.close();
  });
});
