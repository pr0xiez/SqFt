import { expect, test } from "@playwright/test";

// ── helpers ───────────────────────────────────────────────────────────────────

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

async function apiSignup(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  email: string,
  password: string,
  name = "Test User"
) {
  return request.post("/api/auth/signup", {
    data: { name, email, password },
  });
}

// ── 1.1 Signup ────────────────────────────────────────────────────────────────

test.describe("1.1 Signup", () => {
  test("1.1.1 happy path redirects to /onboarding", async ({ page }) => {
    await page.goto("/signup");
    await page.fill("#name", "Jane Doe");
    await page.fill("#email", uniqueEmail());
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/onboarding");
  });

  test("1.1.2 password too short — browser validation, no redirect", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.fill("#name", "Test User");
    await page.fill("#email", uniqueEmail());
    await page.fill("#password", "abc1234"); // 7 chars — below minLength={8}
    await page.click('button[type="submit"]');

    // Browser constraint validation blocks form submission
    await expect(page).toHaveURL("/signup");

    const msg = await page
      .locator("#password")
      .evaluate((el) => (el as HTMLInputElement).validationMessage);
    // Chrome/Edge: "Please lengthen this text to 8 characters or more…"
    expect(msg).toContain("8");
  });

  test("1.1.3 missing name — browser required validation, no redirect", async ({
    page,
  }) => {
    await page.goto("/signup");
    // Deliberately leave #name blank
    await page.fill("#email", uniqueEmail());
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/signup");

    const missing = await page
      .locator("#name")
      .evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
    expect(missing).toBe(true);
  });

  test("1.1.4 duplicate email shows error banner", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    await apiSignup(request, email, "password123");

    await page.goto("/signup");
    await page.fill("#name", "Another User");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');

    await expect(
      page.getByText(/already exists/i, { exact: false })
    ).toBeVisible();
    await expect(page).toHaveURL("/signup");
  });

  test("1.1.5 invalid email — browser type validation, no redirect", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.fill("#name", "Test User");
    await page.fill("#email", "notanemail");
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/signup");

    const mismatch = await page
      .locator("#email")
      .evaluate((el) => (el as HTMLInputElement).validity.typeMismatch);
    expect(mismatch).toBe(true);
  });
});

// ── 1.2 Onboarding ────────────────────────────────────────────────────────────

test.describe("1.2 Onboarding", () => {
  test("1.2.1 happy path redirects to /", async ({ page, request }) => {
    const email = uniqueEmail();
    await apiSignup(request, email, "password123");

    // Log in first (signup API does not create a session automatically)
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    await page.goto("/onboarding");
    await page.fill("#company", "Acme Floors");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  test("1.2.2 empty company name — submit button disabled", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    await apiSignup(request, email, "password123");

    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    await page.goto("/onboarding");
    // Company field should be empty; button must be disabled
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Filling then clearing should re-disable
    await page.fill("#company", "x");
    await page.fill("#company", "");
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("1.2.3 already configured — redirect to /", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    await apiSignup(request, email, "password123");

    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Complete onboarding
    await page.goto("/onboarding");
    await page.fill("#company", "Already Named Co");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Visiting /onboarding again should redirect back to /
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/");
  });
});

// ── 1.3 Login ─────────────────────────────────────────────────────────────────

test.describe("1.3 Login", () => {
  // Create one user shared across all login tests
  let sharedEmail: string;
  const sharedPassword = "password123";

  test.beforeAll(async ({ request }) => {
    sharedEmail = uniqueEmail();
    await apiSignup(request, sharedEmail, sharedPassword);
  });

  test("1.3.1 happy path redirects to /", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", sharedEmail);
    await page.fill("#password", sharedPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  test("1.3.2 wrong password shows error, stays on /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", sharedEmail);
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(
      page.getByText(/incorrect email or password/i, { exact: false })
    ).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("1.3.3 non-existent email shows error, stays on /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", "nobody@nowhere.example.com");
    await page.fill("#password", sharedPassword);
    await page.click('button[type="submit"]');

    await expect(
      page.getByText(/incorrect email or password/i, { exact: false })
    ).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("1.3.4 password show/hide toggle changes input type", async ({
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

// ── 1.4 Auth guards ───────────────────────────────────────────────────────────

test.describe("1.4 Auth guards", () => {
  test("1.4.1 unauthenticated access to /customers redirects to /login", async ({
    page,
  }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL("/login");
  });

  test("1.4.2 unauthenticated API call returns 401", async ({ request }) => {
    const res = await request.get("/api/customers");
    expect(res.status()).toBe(401);
  });
});
