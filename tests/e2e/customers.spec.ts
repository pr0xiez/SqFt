import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createSiteMeasure,
  seedApprovedEstimate,
} from "./fixtures/seed";

/**
 * True only for the list endpoint with a query string
 * (`/api/customers?…`), never the detail call (`/api/customers/{id}`).
 */
function isListRequest(url: string): boolean {
  return url.includes("/api/customers?");
}

// ── 10.1 Customers — API CRUD ────────────────────────────────────────────────

test.describe
  .serial("10.1 Customers API", () => {
    let ctx: BrowserContext;
    let customerId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("10.1.1 POST creates a customer (201)", async () => {
      const res = await ctx.request.post("/api/customers", {
        data: {
          name: "Acme Co",
          phone: "555-0100",
          email: "ops@acme.example",
          source: "referral",
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.id).toBeGreaterThan(0);
      expect(body.name).toBe("Acme Co");
      customerId = body.id;
    });

    test("10.1.2 GET returns the customer", async () => {
      const res = await ctx.request.get(`/api/customers/${customerId}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Acme Co");
      expect(body.source).toBe("referral");
    });

    test("10.1.3 PATCH updates the customer", async () => {
      const res = await ctx.request.patch(`/api/customers/${customerId}`, {
        data: { name: "Acme Corp" },
      });
      expect(res.status()).toBe(200);
      const got = await (
        await ctx.request.get(`/api/customers/${customerId}`)
      ).json();
      expect(got.name).toBe("Acme Corp");
    });

    test("10.1.4 cross-org GET returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.get(`/api/customers/${customerId}`);
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.5 cross-org PATCH returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.patch(`/api/customers/${customerId}`, {
        data: { name: "Hijacked" },
      });
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.6 cross-org DELETE returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.delete(`/api/customers/${customerId}`);
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.7 unauth GET returns 401", async ({ browser }) => {
      const anon = await browser.newContext();
      const res = await anon.request.get("/api/customers");
      expect(res.status()).toBe(401);
      await anon.close();
    });

    test("10.1.8 DELETE removes the customer", async () => {
      const res = await ctx.request.delete(`/api/customers/${customerId}`);
      expect(res.status()).toBe(204);
      const get = await ctx.request.get(`/api/customers/${customerId}`);
      expect(get.status()).toBe(404);
    });
  });

// ── 10.2 Customers — list page ───────────────────────────────────────────────

test.describe("10.2 Customers list page", () => {
  test("10.2.1 list renders and seeded customer appears", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const unique = `List Visible ${Date.now()}`;
    const created = await ctx.request.post("/api/customers", {
      data: { name: unique, source: "phone" },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/customers");
    await expect(page.getByText(unique)).toBeVisible();
    await ctx.close();
  });

  test("10.2.2 Open button navigates to the customer detail page", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const unique = `Open Me ${Date.now()}`;
    const created = await ctx.request.post("/api/customers", {
      data: { name: unique, source: "phone" },
    });
    const { id } = await created.json();

    await page.goto("/customers");

    // The customer list renders each row as a <button> that navigates on click.
    // There is no <a> link — clicking the row button (which contains the customer
    // name) navigates to the detail page. We click the button that contains the
    // customer name text directly.
    await page.getByRole("button", { name: new RegExp(unique) }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${id}`));
    await ctx.close();
  });
});

// ── 10.3 Customers list — server-driven pagination ───────────────────────────

test.describe("10.3 Customers list — server-driven pagination", () => {
  test("10.3.1 list request carries page & perPage params", async ({
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
      page.goto("/customers"),
    ]);

    const listUrl = listResp.url();
    expect(listUrl).toMatch(/[?&]page=\d+/);
    expect(listUrl).toMatch(/[?&]perPage=\d+/);
    await ctx.close();
  });

  test("10.3.2 the Last activity column is gone", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    await page.goto("/customers");
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText("Last activity")).toHaveCount(0);
    await ctx.close();
  });

  test("10.3.3 source pill filters server-side with source=<x>", async ({
    browser,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const phoneName = `Greenfield ${suffix}`;
    const referralName = `Birchwood ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    // Two customers with distinct sources and distinctive names.
    await createCustomer(ctx.request, { name: phoneName, source: "phone" });
    await createCustomer(ctx.request, {
      name: referralName,
      source: "referral",
    });

    await page.goto("/customers");
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // Narrow to our seeded rows so both are present on one page regardless of
    // how many other rows the shared worker org already has.
    const [searchResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes(`q=${suffix}`) &&
          r.status() === 200
      ),
      page.getByPlaceholder(/Search/i).fill(suffix),
    ]);
    expect(searchResp.url()).toContain(`q=${suffix}`);

    // Both rows present under the default "All" source filter.
    await expect(page.getByText(phoneName)).toBeVisible();
    await expect(page.getByText(referralName)).toBeVisible();

    // Clicking the "Phone" pill issues a request carrying source=phone.
    const [filterResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes("source=phone") &&
          r.status() === 200
      ),
      page
        .getByRole("button", { name: /^Phone/ })
        .first()
        .click(),
    ]);
    expect(filterResp.url()).toContain("source=phone");

    // The phone row remains; the referral row drops out.
    await expect(page.getByText(phoneName)).toBeVisible();
    await expect(page.getByText(referralName)).toHaveCount(0);
    await ctx.close();
  });

  test("10.3.4 pipeline pill filters server-side with pipeline=accepted", async ({
    browser,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const wonName = `Greenfield ${suffix}`;
    const coldName = `Birchwood ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    // "Won" bucket: a customer with an approved estimate. seedApprovedEstimate
    // drives a draft estimate to approved via the public one-click endpoint.
    const wonCust = await createCustomer(ctx.request, { name: wonName });
    const wonSm = await createSiteMeasure(ctx.request, wonCust.id);
    await seedApprovedEstimate(ctx.request, wonSm.id);

    // "Cold" bucket: a customer with no estimates at all.
    await createCustomer(ctx.request, { name: coldName });

    await page.goto("/customers");
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // Narrow to the two seeded rows.
    const [searchResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes(`q=${suffix}`) &&
          r.status() === 200
      ),
      page.getByPlaceholder(/Search/i).fill(suffix),
    ]);
    expect(searchResp.url()).toContain(`q=${suffix}`);

    // Both present under the default "Any pipeline" filter.
    await expect(page.getByText(wonName)).toBeVisible();
    await expect(page.getByText(coldName)).toBeVisible();

    // Clicking the "Won" pipeline pill issues a request carrying
    // pipeline=accepted.
    const [filterResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes("pipeline=accepted") &&
          r.status() === 200
      ),
      page.getByRole("button", { name: /^Won/ }).first().click(),
    ]);
    expect(filterResp.url()).toContain("pipeline=accepted");

    // The won customer remains; the cold one drops out.
    await expect(page.getByText(wonName)).toBeVisible();
    await expect(page.getByText(coldName)).toHaveCount(0);
    await ctx.close();
  });

  test("10.3.5 search issues a debounced request carrying q=", async ({
    browser,
  }) => {
    // Single-token term so the encoded `q=` value is stable (a space would be
    // encoded as `+`, not `%20`).
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const term = `Zephyr${suffix.replace(/-/g, "")}`;
    const targetName = `${term} Flooring`;
    const otherName = `Other ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    await createCustomer(ctx.request, { name: targetName });
    await createCustomer(ctx.request, { name: otherName });

    await page.goto("/customers");
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // Typing fires a debounced (~300ms) request carrying q=<term>.
    const [searchResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes(`q=${term}`) &&
          r.status() === 200
      ),
      page.getByPlaceholder(/Search/i).fill(term),
    ]);
    expect(searchResp.url()).toContain(`q=${term}`);

    // The list narrows to the matching customer; the other drops out.
    await expect(page.getByText(targetName)).toBeVisible();
    await expect(page.getByText(otherName)).toHaveCount(0);
    await ctx.close();
  });
});
