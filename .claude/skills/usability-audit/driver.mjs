#!/usr/bin/env node
/**
 * SqFt usability-audit driver.
 *
 * Logs in as the seeded demo user and walks the app's frequent-task flows at
 * both desktop and mobile widths, dropping a full-page screenshot + a plain
 * text dump (for reading copy / labels / cognitive load) at each stop.
 *
 * This is NOT a pass/fail test. It is a capture harness: it produces the
 * artifacts a UX reviewer (human or agent) then reads to write the audit.
 * Every stop is wrapped so one broken flow never aborts the tour — a stop
 * that throws is recorded as an error in manifest.json and the tour continues.
 *
 * Usage:
 *   node driver.mjs                      # desktop + mobile, all stops
 *   node driver.mjs --viewport=desktop   # one width only
 *   node driver.mjs --viewport=mobile
 *   node driver.mjs --only=estimates,schedule   # subset by stop id
 *
 * Env:
 *   BASE_URL   default http://localhost:3000
 *   EMAIL      default demo@sqft.dev
 *   PASSWORD   default demo1234
 *   OUT_DIR    default ./audit-artifacts   (relative to repo root / cwd)
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "demo@sqft.dev";
const PASSWORD = process.env.PASSWORD ?? "demo1234";
const OUT_DIR = process.env.OUT_DIR ?? "audit-artifacts";

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const viewportArg = arg("viewport"); // desktop | mobile | undefined(=both)
const onlyArg = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 }, // iPhone 14-ish — field crews live here
};

// Settle helper: wait for network to go quiet, let any "Loading…" placeholder
// (client-side React Query fetch) clear, then a beat for animations.
async function settle(page, ms = 600) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page
    .locator("text=/Loading/i")
    .first()
    .waitFor({ state: "detached", timeout: 8_000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

// Dev-only chrome (Next.js dev indicator, React Query devtools toggle) is not
// part of the product — hide it so screenshots show only what a user sees.
async function hideDevChrome(page) {
  await page
    .addStyleTag({
      content: `
        nextjs-portal, [data-nextjs-toast], #__next-build-watcher,
        .tsqd-parent-container, [aria-label="Open Tanstack query devtools"] {
          display: none !important;
        }`,
    })
    .catch(() => {});
}

/**
 * Click the first list-row button inside <main> whose text matches `pattern`.
 * Scoping to <main> is deliberate: it keeps us clear of the nav chrome (the
 * sign-out avatar is a button too — clicking it mid-tour ends the session).
 * Returns true if a row was clicked.
 */
async function clickFirstRow(page, pattern) {
  const rows = page.locator("main button", { hasText: pattern });
  if (await rows.count()) {
    await rows.first().click();
    return true;
  }
  return false;
}

/**
 * Each stop: { id, title, run(page) }. `run` should leave the page on the
 * screen we want captured. Navigation-by-clicking is preferred over deep
 * links so the tour exercises the real path a user takes.
 */
const STOPS = [
  {
    id: "dashboard",
    title: "Dashboard (landing after login)",
    run: async (page) => {
      await page.goto(`${BASE_URL}/`);
      await settle(page);
    },
  },
  {
    id: "customers-list",
    title: "Customers — list",
    run: async (page) => {
      await page.goto(`${BASE_URL}/customers`);
      await settle(page);
    },
  },
  {
    id: "customer-new",
    title: "Customers — new customer form (frequent task: add a lead)",
    run: async (page) => {
      await page.goto(`${BASE_URL}/customers`);
      await settle(page);
      await page.getByRole("button", { name: /New Customer/i }).first().click();
      await settle(page, 400);
    },
  },
  {
    id: "customer-detail",
    title: "Customers — detail (first row)",
    run: async (page) => {
      await page.goto(`${BASE_URL}/customers`);
      await settle(page);
      // Customer rows are full-width buttons with a left source-accent border
      // (`border-l-[3px]`) — a class the sort headers and filter chips lack,
      // so this reliably lands on a real customer, not a column toggle.
      await page.locator('main button[class*="border-l-"]').first().click();
      await settle(page);
    },
  },
  {
    id: "site-measures-list",
    title: "Site Measures — list",
    run: async (page) => {
      await page.goto(`${BASE_URL}/site-measures`);
      await settle(page);
    },
  },
  {
    id: "site-measure-builder",
    title: "Site Measures — builder (measure rooms; frequent field task)",
    run: async (page) => {
      await page.goto(`${BASE_URL}/site-measures`);
      await settle(page);
      // Rows are <main> buttons labeled with a "#<number>".
      await clickFirstRow(page, /#\s*\d/);
      await settle(page);
    },
  },
  {
    id: "estimates-list",
    title: "Estimates — list",
    run: async (page) => {
      await page.goto(`${BASE_URL}/estimates`);
      await settle(page);
    },
  },
  {
    id: "estimate-builder",
    title: "Estimates — builder/detail (core daily task: price a job)",
    run: async (page) => {
      await page.goto(`${BASE_URL}/estimates`);
      await settle(page);
      // Rows are <main> buttons labeled with a "#<estimate number>".
      await clickFirstRow(page, /#\s*\d/);
      await settle(page);
    },
  },
  {
    id: "schedule",
    title: "Schedule (calendar / crew dispatch)",
    run: async (page) => {
      await page.goto(`${BASE_URL}/schedule`);
      await settle(page);
    },
  },
  {
    id: "settings",
    title: "Settings — index",
    run: async (page) => {
      await page.goto(`${BASE_URL}/settings`);
      await settle(page);
    },
  },
  {
    id: "settings-members",
    title: "Settings — team members",
    run: async (page) => {
      await page.goto(`${BASE_URL}/settings/members`);
      await settle(page);
    },
  },
  {
    id: "settings-templates",
    title: "Settings — line item templates",
    run: async (page) => {
      await page.goto(`${BASE_URL}/settings/line-item-templates`);
      await settle(page);
    },
  },
  {
    id: "settings-workspace",
    title: "Settings — workspace / pricing defaults",
    run: async (page) => {
      await page.goto(`${BASE_URL}/settings/workspace`);
      await settle(page);
    },
  },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
  await settle(page);
}

async function captureStop(page, stop, dir) {
  const result = { id: stop.id, title: stop.title, url: null, error: null };
  try {
    await stop.run(page);
    result.url = page.url();
    await hideDevChrome(page);
    await page.screenshot({ path: join(dir, `${stop.id}.png`), fullPage: true });
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    await writeFile(join(dir, `${stop.id}.txt`), text, "utf8");
    console.log(`  ✓ ${stop.id.padEnd(22)} ${result.url}`);
  } catch (err) {
    result.error = String(err?.message ?? err);
    // Still grab whatever is on screen so the reviewer can see the failure.
    await page
      .screenshot({ path: join(dir, `${stop.id}.ERROR.png`), fullPage: true })
      .catch(() => {});
    console.log(`  ✗ ${stop.id.padEnd(22)} ${result.error.split("\n")[0]}`);
  }
  return result;
}

async function tourViewport(browser, vpName, stops, cleanDir) {
  const vp = VIEWPORTS[vpName];
  const dir = join(OUT_DIR, vpName);
  // Clean this viewport's subdir on a full run so stale stops don't linger.
  // On an `--only` run, leave the other stops in place and just overwrite the
  // selected ones — you're refreshing a subset, not regenerating the set.
  if (cleanDir) await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: vp });
  const page = await context.newPage();
  console.log(`\n▌ ${vpName} (${vp.width}×${vp.height})`);
  await login(page);
  const results = [];
  for (const stop of stops) results.push(await captureStop(page, stop, dir));
  await context.close();
  return { viewport: vpName, dimensions: vp, stops: results };
}

async function main() {
  const stops = onlyArg ? STOPS.filter((s) => onlyArg.includes(s.id)) : STOPS;
  if (!stops.length) {
    console.error(`No stops match --only=${onlyArg?.join(",")}`);
    process.exit(1);
  }
  const viewports = viewportArg ? [viewportArg] : ["desktop", "mobile"];

  await mkdir(OUT_DIR, { recursive: true });

  const cleanDir = !onlyArg; // full run wipes the viewport dir; --only refreshes in place
  const browser = await chromium.launch();
  const manifest = { baseUrl: BASE_URL, email: EMAIL, tours: [] };
  try {
    for (const vp of viewports) {
      manifest.tours.push(await tourViewport(browser, vp, stops, cleanDir));
    }
  } finally {
    await browser.close();
  }

  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  const errors = manifest.tours.flatMap((t) => t.stops.filter((s) => s.error));
  console.log(`\n✅ Artifacts in ${OUT_DIR}/  (${errors.length} stop error(s))`);
  if (errors.length) for (const e of errors) console.log(`   ✗ ${e.id}: ${e.error.split("\n")[0]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
