import { type APIRequestContext, expect, test } from "@playwright/test";

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

async function setupOrgAndEstimate(
  ctx: APIRequestContext,
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await ctx.post("/api/auth/signup", {
    data: { name: "Invoice Test User", email, password },
  });
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");

  await page.goto("/onboarding");
  await page.fill("#company", "Invoice Floors LLC");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");

  const custRes = await ctx.post("/api/customers", {
    data: { name: "Invoice Customer", source: "phone" },
  });
  const customer = await custRes.json();

  const estRes = await ctx.post("/api/estimates", {
    data: { customerId: customer.id },
  });
  const estimate = await estRes.json();

  // Move estimate out of "quote" status so it's invoiceable
  await ctx.patch(`/api/estimates/${estimate.id}`, {
    data: { status: "scheduled" },
  });

  return estimate.id as number;
}

test.describe
  .serial("2.2 Quote → Invoice conversion", () => {
    test("2.2.1 marking an estimate as invoice assigns a number and dueDate", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const email = uniqueEmail();
      const id = await setupOrgAndEstimate(
        ctx.request,
        page,
        email,
        "password123"
      );

      const res = await ctx.request.post(`/api/estimates/${id}/invoice`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(typeof body.invoiceNumber).toBe("number");
      expect(body.invoiceNumber).toBeGreaterThanOrEqual(1);
      expect(body.invoicedAt).toBeTruthy();
      expect(body.dueDate).toBeTruthy();

      await ctx.close();
    });

    test("2.2.2 invoicing twice returns 409", async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const email = uniqueEmail();
      const id = await setupOrgAndEstimate(
        ctx.request,
        page,
        email,
        "password123"
      );

      const first = await ctx.request.post(`/api/estimates/${id}/invoice`);
      expect(first.status()).toBe(200);

      const second = await ctx.request.post(`/api/estimates/${id}/invoice`);
      expect(second.status()).toBe(409);

      await ctx.close();
    });

    test("2.2.3 cannot invoice an estimate still in quote status", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const email = uniqueEmail();
      await ctx.request.post("/api/auth/signup", {
        data: { name: "Quote Status User", email, password: "password123" },
      });
      await page.goto("/login");
      await page.fill("#email", email);
      await page.fill("#password", "password123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
      await page.goto("/onboarding");
      await page.fill("#company", "QS Floors");
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
      const custRes = await ctx.request.post("/api/customers", {
        data: { name: "QS Customer", source: "phone" },
      });
      const customer = await custRes.json();
      const estRes = await ctx.request.post("/api/estimates", {
        data: { customerId: customer.id },
      });
      const estimate = await estRes.json();

      const res = await ctx.request.post(
        `/api/estimates/${estimate.id}/invoice`
      );
      expect(res.status()).toBe(409);

      await ctx.close();
    });

    test("2.2.4 invoice numbers are sequential within an org", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const email = uniqueEmail();
      const id1 = await setupOrgAndEstimate(
        ctx.request,
        page,
        email,
        "password123"
      );

      // Create a second invoiceable estimate
      const cust2 = await (
        await ctx.request.post("/api/customers", {
          data: { name: "Second Customer", source: "phone" },
        })
      ).json();
      const est2 = await (
        await ctx.request.post("/api/estimates", {
          data: { customerId: cust2.id },
        })
      ).json();
      await ctx.request.patch(`/api/estimates/${est2.id}`, {
        data: { status: "scheduled" },
      });

      const r1 = await (
        await ctx.request.post(`/api/estimates/${id1}/invoice`)
      ).json();
      const r2 = await (
        await ctx.request.post(`/api/estimates/${est2.id}/invoice`)
      ).json();

      expect(r2.invoiceNumber).toBe(r1.invoiceNumber + 1);

      await ctx.close();
    });

    test("2.2.5 UI shows invoice badge and Download Invoice PDF action after marking", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const email = uniqueEmail();
      const id = await setupOrgAndEstimate(
        ctx.request,
        page,
        email,
        "password123"
      );

      await page.goto(`/estimates/${id}`);
      await page.getByRole("button", { name: /actions/i }).click();
      page.once("dialog", (d) => d.accept());
      await page.getByTestId("mark-as-invoice").click();

      await expect(page.getByTestId("invoice-badge")).toBeVisible();

      await page.getByRole("button", { name: /actions/i }).click();
      await expect(
        page.getByRole("button", { name: /download invoice pdf/i })
      ).toBeVisible();

      await ctx.close();
    });

    test("2.2.6 Mark as Invoice action is hidden once invoiced", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const email = uniqueEmail();
      const id = await setupOrgAndEstimate(
        ctx.request,
        page,
        email,
        "password123"
      );

      await ctx.request.post(`/api/estimates/${id}/invoice`);

      await page.goto(`/estimates/${id}`);
      await page.getByRole("button", { name: /actions/i }).click();
      await expect(page.getByTestId("mark-as-invoice")).toHaveCount(0);

      await ctx.close();
    });
  });
