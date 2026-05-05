/**
 * Shared auth fixture for E2E tests.
 *
 * Usage in any test file that needs a logged-in user:
 *
 *   import { test, expect } from "@/tests/e2e/fixtures/auth";
 *   test("does something", async ({ authedPage }) => { ... });
 *
 * `authedPage` is a browser page with an active session. The session is
 * created once per worker (signup → login → onboarding) and reused across
 * tests in the same worker via storageState.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { test as base } from "@playwright/test";

export const authDir = path.join(process.cwd(), "tests/e2e/.auth");

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

type AuthFixtures = {
  authedPage: import("@playwright/test").Page;
};

type AuthWorkerFixtures = {
  authStateFile: string;
};

export const test = base.extend<AuthFixtures, AuthWorkerFixtures>({
  authStateFile: [
    async ({ browser }, use, workerInfo) => {
      fs.mkdirSync(authDir, { recursive: true });
      const stateFile = path.join(
        authDir,
        `worker-${workerInfo.workerIndex}.json`
      );
      const baseURL =
        (workerInfo.project.use.baseURL as string | undefined) ??
        "http://localhost:3000";

      if (!fs.existsSync(stateFile)) {
        const email = uniqueEmail();
        const password = "TestPassword1!";

        // Create account via API (faster than driving the signup form)
        await fetch(`${baseURL}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test User", email, password }),
        });

        const ctx = await browser.newContext({ baseURL });
        const page = await ctx.newPage();

        await page.goto("/login");
        await page.fill("#email", email);
        await page.fill("#password", password);
        await page.click('button[type="submit"]');
        await page.waitForURL("/");

        // Complete onboarding if the app redirects there after login
        if (page.url().includes("/onboarding")) {
          await page.fill("#company", "Test Co");
          await page.click('button[type="submit"]');
          await page.waitForURL("/");
        }

        await ctx.storageState({ path: stateFile });
        await ctx.close();
      }

      await use(stateFile);
    },
    { scope: "worker" },
  ],

  authedPage: async ({ browser, authStateFile }, use, testInfo) => {
    const baseURL =
      (testInfo.project.use.baseURL as string | undefined) ??
      "http://localhost:3000";
    const ctx = await browser.newContext({
      baseURL,
      storageState: authStateFile,
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
});

export { expect } from "@playwright/test";
