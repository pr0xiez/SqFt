/**
 * Shared auth fixture for E2E tests.
 *
 * Usage in any test file that needs a logged-in user:
 *
 *   import { test, expect } from "@/tests/e2e/fixtures/auth";
 *   test("does something", async ({ authedPage }) => { ... });
 *
 * `authedPage` is a browser page with an active session. The session is
 * created once per worker by logging in as the seeded demo user and reused
 * across tests in the same worker via storageState.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { test as base } from "@playwright/test";

export const authDir = path.join(process.cwd(), "tests/e2e/.auth");

export const DEMO_EMAIL = "demo@sqft.dev";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_OTHER_EMAIL = "demo2@sqft.dev";
export const DEMO_OTHER_PASSWORD = "demo1234";

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

      // Always refresh the worker session — the seeded user is shared, so
      // re-logging in is cheap and avoids stale cookies between runs.
      const ctx = await browser.newContext({ baseURL });
      const page = await ctx.newPage();

      await page.goto("/login");
      await page.fill("#email", DEMO_EMAIL);
      await page.fill("#password", DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");

      await ctx.storageState({ path: stateFile });
      await ctx.close();

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
