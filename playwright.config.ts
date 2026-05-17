import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

// When BASE_URL is set, point tests at that deployment and skip the local
// dev server. Otherwise default to http://localhost:3000 with a local server.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const useExternalServer = !!process.env.BASE_URL;

// Only load .env files when starting a local dev server. Remote runs (CI
// against a Vercel preview) get their config from the deployment + workflow
// env, so loading dotenv here just spams the log with "tip" messages.
if (!useExternalServer) {
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
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
    extraHTTPHeaders: {
      "x-vercel-protection-bypass":
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET!,
      "x-vercel-set-bypass-cookie": "samesitenone",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useExternalServer
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Pass the resolved env to the spawned dev server process so
        // AUTH_SECRET and DATABASE_URL are available even without a local .env.
        // RESEND_API_KEY is force-cleared so lib/email/client.ts takes the
        // in-memory recordEmail path — out-of-process Playwright can't read
        // that buffer, but tests assert on sentAt / status, not email body.
        env: {
          ...(process.env as Record<string, string>),
          RESEND_API_KEY: "",
        },
      },
});
