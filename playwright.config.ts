import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

// Worktrees live at .claude/worktrees/<name>/ — the main project .env is 3
// levels up. Load it so the dev server starts with DATABASE_URL + AUTH_SECRET.
const localEnv = resolve(process.cwd(), ".env");
const parentEnv = resolve(process.cwd(), "../../..", ".env");
loadDotenv({ path: existsSync(localEnv) ? localEnv : parentEnv });

// .env.test overrides DATABASE_URL (and anything else) for E2E runs.
const localTestEnv = resolve(process.cwd(), ".env.test");
const parentTestEnv = resolve(process.cwd(), "../../..", ".env.test");
loadDotenv({
  path: existsSync(localTestEnv) ? localTestEnv : parentTestEnv,
  override: true,
});

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Pass the resolved env to the spawned dev server process so
    // AUTH_SECRET and DATABASE_URL are available even without a local .env.
    env: process.env as Record<string, string>,
  },
});
