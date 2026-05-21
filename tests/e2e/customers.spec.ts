import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsDemo, loginAsOtherDemo } from "./fixtures/seed";

// ── 10.1 Customers — API CRUD ────────────────────────────────────────────────

test.describe
  .serial("10.1 Customers API", () => {
    let ctx: BrowserContext;
    let customerId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsDemo(ctx);
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
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.get(`/api/customers/${customerId}`);
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.5 cross-org PATCH returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.patch(`/api/customers/${customerId}`, {
        data: { name: "Hijacked" },
      });
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.6 cross-org DELETE returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
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
    const page = await loginAsDemo(ctx);

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
    const page = await loginAsDemo(ctx);
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
