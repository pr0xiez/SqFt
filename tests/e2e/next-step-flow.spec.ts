import { type APIRequestContext, expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createEstimate,
  createSiteMeasure,
  getApprovalToken,
  seedInvoice,
} from "./fixtures/seed";

/** An approved estimate with a real total: 100 ft² × $8.50 = $850. */
async function seedPricedApprovedEstimate(
  request: APIRequestContext,
  siteMeasureId: number
): Promise<number> {
  const { id } = await createEstimate(request, siteMeasureId);
  const patch = await request.patch(`/api/estimates/${id}`, {
    data: {
      lineItems: [
        {
          id: 9001,
          name: "Engineered hardwood",
          rate: 8.5,
          qtyMode: "manual",
          qty: 100,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
    },
  });
  expect(patch.ok()).toBeTruthy();
  const token = await getApprovalToken(request, id);
  const res = await request.post(`/api/estimate-review/${token}/approve`);
  expect(res.status()).toBe(200);
  return id;
}

// ── 21 Lead → job flow ──────────────────────────────────────────────────────
// The streamlined path through the record chain: one-pass intake from "+ New",
// the record trail, and the estimate page's status-driven next step.

test.describe("21.1 Lead intake", () => {
  test("21.1.1 New customer with an address lands on their page with the location", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const last = `Intake${Date.now()}`;

    await page.goto("/customers");
    await page.getByRole("button", { name: "New Customer" }).click();
    const panel = page.getByRole("dialog");
    await panel.getByPlaceholder("Jordan").fill("Rae");
    await panel.getByPlaceholder("Henderson").fill(last);
    await panel.getByPlaceholder("(614) 555-...").fill("614-555-0199");
    await panel
      .getByPlaceholder("Start typing an address…")
      .fill("742 Evergreen Terrace");
    await panel.getByPlaceholder("Columbus").fill("Springfield");
    await panel.getByPlaceholder("OH").fill("OH");
    await panel.getByPlaceholder("43215").fill("45501");

    const [post] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/customers") && r.request().method() === "POST"
      ),
      panel.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(post.status()).toBe(201);
    const created = await post.json();

    await expect(page).toHaveURL(new RegExp(`/customers/${created.id}$`));
    await expect(
      page.getByRole("heading", { name: `Rae ${last}` })
    ).toBeVisible();
    await expect(
      page.getByText("742 Evergreen Terrace, Springfield, OH 45501").first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New site measure" })
    ).toBeVisible();

    await ctx.close();
  });

  test("21.1.2 the sidebar + New menu offers the whole chain", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    await page.goto("/");
    await page.getByRole("button", { name: "New", exact: true }).click();
    const menu = page.getByRole("menu");
    for (const label of [
      "New customer",
      "New site measure",
      "New estimate",
      "New invoice",
      "New event",
    ]) {
      await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
    }
    await menu.getByRole("menuitem", { name: "New site measure" }).click();
    await expect(
      page.getByRole("dialog").getByText("New site measure")
    ).toBeVisible();

    await ctx.close();
  });
});

test.describe("21.2 Next step on the estimate", () => {
  test("21.2.1 an approved estimate bills the deposit at the estimate's own %", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const name = `NextStep ${Date.now()}`;
    const customer = await createCustomer(ctx.request, { name });
    const sm = await createSiteMeasure(ctx.request, customer.id);
    const estimateId = await seedPricedApprovedEstimate(ctx.request, sm.id);
    const est = await (
      await ctx.request.get(`/api/estimates/${estimateId}`)
    ).json();

    await page.goto(`/estimates/${estimateId}`);
    await expect(
      page.getByRole("list", { name: "Job progress" })
    ).toBeVisible();
    // The record trail leads back up the chain.
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByRole("link", { name: name })).toHaveAttribute(
      "href",
      `/customers/${customer.id}`
    );

    await page.getByRole("button", { name: "Bill deposit" }).click();
    const dialog = page.getByRole("dialog", { name: "New invoice" });
    await expect(
      dialog.getByRole("button", { name: "% of balance" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Percent of balance")).toHaveValue(
      String(Math.round(est.depositPct * 100))
    );
    await expect(dialog.getByLabel("Memo (optional)")).toHaveValue("Deposit");

    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/invoices\/\d+$/);
    // The invoice names its customer and links back up the chain.
    await expect(
      page.getByRole("main").getByRole("link", { name: name }).first()
    ).toBeVisible();

    await ctx.close();
  });

  test("21.2.2 with the deposit billed, Schedule job opens a pre-filled job form", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const name = `Schedule ${Date.now()}`;
    const customer = await createCustomer(ctx.request, { name });
    const sm = await createSiteMeasure(ctx.request, customer.id);
    const estimateId = await seedPricedApprovedEstimate(ctx.request, sm.id);
    await seedInvoice(ctx.request, estimateId, { pct: 0.3 });

    await page.goto(`/estimates/${estimateId}`);
    const header = page.locator("header").first();
    await header.getByRole("button", { name: "Schedule job" }).click();

    const form = page.getByRole("dialog");
    await expect(form.getByText("New Event")).toBeVisible();
    await expect(form.getByRole("button", { name: "job" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(form.getByLabel("Title")).toHaveValue(`Install: ${name}`);
    // An install defaults to a working day, not a one-hour slot.
    await expect(form.getByLabel("Start", { exact: true })).toHaveValue(
      "08:00"
    );
    await expect(form.getByLabel("End", { exact: true })).toHaveValue("17:00");

    await ctx.close();
  });
});
