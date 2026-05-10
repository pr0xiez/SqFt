import { expect, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures/auth";

// ── 1.1 Login ─────────────────────────────────────────────────────────────────

test.describe("1.1 Login", () => {
  test("1.1.1 happy path redirects to /", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", DEMO_EMAIL);
    await page.fill("#password", DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  test("1.1.2 wrong password shows error, stays on /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", DEMO_EMAIL);
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(
      page.getByText(/incorrect email or password/i, { exact: false })
    ).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("1.1.3 non-existent email shows error, stays on /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", "nobody@nowhere.example.com");
    await page.fill("#password", DEMO_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(
      page.getByText(/incorrect email or password/i, { exact: false })
    ).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("1.1.4 password show/hide toggle changes input type", async ({
    page,
  }) => {
    await page.goto("/login");
    const input = page.locator("#password");
    const toggle = page.getByLabel("Show password");

    await expect(input).toHaveAttribute("type", "password");

    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");

    await toggle.click();
    await expect(input).toHaveAttribute("type", "password");
  });
});

// ── 1.2 Auth guards ───────────────────────────────────────────────────────────

test.describe("1.2 Auth guards", () => {
  test("1.2.1 unauthenticated access to /customers redirects to /login", async ({
    page,
  }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL("/login");
  });

  test("1.2.2 unauthenticated API call returns 401", async ({ request }) => {
    const res = await request.get("/api/customers");
    expect(res.status()).toBe(401);
  });
});
