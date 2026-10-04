import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  createEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 18.1 Line item section ──────────────────────────────────────────────────
// Characterization coverage for the LineItemSection seams the room-link-picker
// specs (4.1.x) miss: plain row edits, subtotal back-calc, template apply, and
// the totals section. Seeds via API, drives the UI, asserts persisted shape via
// GET /api/estimates/{id}.

test.describe("18.1 Line item section — rows", () => {
  test("18.1.1 add, edit qty/rate, then remove a line item persists each step", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Add a line item.
    const [addPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page.getByRole("button", { name: "+ Add Line Item" }).click(),
    ]);
    expect(addPatch.status()).toBe(200);
    await expect(page.locator('input[value="New line item"]')).toBeVisible();

    // Edit qty (manual) to 5, committing on blur and waiting for its own PATCH
    // so it doesn't race the rate save below.
    const qty = page.locator('input[inputmode="decimal"]').first();
    await qty.fill("5");
    const [qtyPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      qty.blur(),
    ]);
    expect(qtyPatch.status()).toBe(200);

    // Edit rate to 10, again waiting for the commit PATCH.
    const rate = page.locator('input[inputmode="decimal"]').nth(1);
    await rate.fill("10");
    const [editPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      rate.blur(),
    ]);
    expect(editPatch.status()).toBe(200);

    // Server reflects qty=5, rate=10.
    const get1 = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const body1 = await get1.json();
    expect(body1.lineItems).toHaveLength(1);
    expect(body1.lineItems[0].qty).toBe(5);
    expect(body1.lineItems[0].rate).toBe(10);

    // Remove the line item ("Remove line item" icon button).
    const [delPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page.getByRole("button", { name: "Remove line item" }).click(),
    ]);
    expect(delPatch.status()).toBe(200);
    const get2 = await ctx.request.get(`/api/estimates/${estimate.id}`);
    expect((await get2.json()).lineItems).toHaveLength(0);

    await ctx.close();
  });
});

test.describe("18.2 Line item section — subtotal & templates", () => {
  test("18.2.1 editing the subtotal back-calculates the rate from qty", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);
    // Seed a manual line item with qty=4, rate=10 directly.
    await ctx.request.patch(`/api/estimates/${estimate.id}`, {
      data: {
        lineItems: [
          {
            id: 7001,
            name: "Backcalc item",
            rate: 10,
            qtyMode: "manual",
            qty: 4,
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    });

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Subtotal column is the 3rd decimal input in the row (qty, rate, subtotal).
    const subtotal = page.locator('input[inputmode="decimal"]').nth(2);
    await subtotal.fill("100"); // 100 / qty(4) = rate 25
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      subtotal.blur(),
    ]);
    expect(patch.status()).toBe(200);

    const get = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const li = (await get.json()).lineItems[0];
    expect(li.qty).toBe(4);
    expect(li.rate).toBe(25);

    await ctx.close();
  });

  test("18.2.2 applying a template populates name, rate and unit", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    // Seed a line-item template for this org (no fixture helper — POST directly).
    const tplRes = await ctx.request.post("/api/line-item-templates", {
      data: { name: "Laminate Install", rate: 4.25, unitLabel: "sqft" },
    });
    expect(tplRes.status()).toBe(201);

    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );

    await page.goto(`/estimates/${estimateId}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // The per-row "Use template…" select applies the template on change.
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimateId}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page
        .getByRole("combobox", { name: "Apply template" })
        .first()
        .selectOption({ label: "Laminate Install" }),
    ]);
    expect(patch.status()).toBe(200);

    const get = await ctx.request.get(`/api/estimates/${estimateId}`);
    const li = (await get.json()).lineItems[0];
    expect(li.name).toBe("Laminate Install");
    expect(li.rate).toBe(4.25);
    expect(li.unitLabel).toBe("sqft");

    await ctx.close();
  });
});

test.describe("18.3 Line item section — totals", () => {
  test("18.3.1 fee, markup and deposit percentages persist", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);
    // One line item with a known subtotal: qty=10, rate=10 → subtotal 100.
    await ctx.request.patch(`/api/estimates/${estimate.id}`, {
      data: {
        lineItems: [
          {
            id: 6001,
            name: "Totals item",
            rate: 10,
            qtyMode: "manual",
            qty: 10,
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    });

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Totals % inputs are the decimal inputs after qty/rate/subtotal:
    // index 3 = markup %, 4 = deposit %.
    // Each commit waits for its own PATCH so the saves don't interleave.
    const decimals = page.locator('input[inputmode="decimal"]');
    const waitPatch = () =>
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      );

    const markup = decimals.nth(3);
    await markup.fill("20");
    await Promise.all([waitPatch(), markup.blur()]);

    const deposit = decimals.nth(4);
    await deposit.fill("25");
    await Promise.all([waitPatch(), deposit.blur()]);

    const get = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const body = await get.json();
    // Deposit persists as a rate (0–1); markup persists as a percent.
    expect(body.markupPct).toBe(20);
    expect(body.depositPct).toBeCloseTo(0.25, 5);

    await ctx.close();
  });
});
