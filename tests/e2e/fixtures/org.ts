/**
 * E2E tenant fixtures.
 *
 * Every org is created at runtime through the Phase 2 super-admin endpoint
 * POST /api/admin/orgs, authenticated as the seeded `admin@sqft.dev`
 * super-admin. There is no test-only API and no teardown: each org gets a
 * unique name + admin email, so reruns never collide and the ephemeral Neon
 * preview branch is the only cleanup needed.
 *
 * Two scopes:
 *  - `loginAsWorkerOrg` — one org shared per Playwright worker (read-mostly
 *    specs; cheap, mirrors the old shared-demo-org behaviour).
 *  - `loginAsFreshOrg` / `loginAsSecondaryOrg` — a brand-new org per call
 *    (org-state mutators and cross-org isolation tests).
 *
 * Requires `SUPER_ADMIN_EMAILS` to include `admin@sqft.dev` in the target
 * environment (already set on Vercel Preview; locally it must be in `.env`).
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";

export const SUPER_ADMIN_EMAIL = "admin@sqft.dev";
export const SUPER_ADMIN_PASSWORD = "demo1234";

export type OrgCreds = {
  orgId: string;
  slug: string;
  orgName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Drive the login form in `ctx` and resolve once settled on `/`. Returns the
 * page so callers can keep using it.
 */
export async function loginViaForm(
  ctx: BrowserContext,
  email: string,
  password: string
): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  return page;
}

/**
 * Create a fresh org via the super-admin endpoint, using a throwaway
 * super-admin context so callers never manage one. The org's admin user is
 * created by `createOrganization` with the email/password returned here.
 */
export async function createOrg(
  browser: Browser,
  label = "e2e"
): Promise<OrgCreds> {
  const suffix = uniqueSuffix();
  const orgName = `${label}-${suffix}`;
  const adminName = `Admin ${suffix}`;
  const adminEmail = `${label}+${suffix}@playwright.test`;
  const adminPassword = `pw-${suffix}-A1`;

  const adminCtx = await browser.newContext();
  try {
    await loginViaForm(adminCtx, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await adminCtx.request.post("/api/admin/orgs", {
      data: { orgName, adminName, adminEmail, adminPassword },
    });
    if (!res.ok()) {
      throw new Error(`createOrg failed: ${res.status()} ${await res.text()}`);
    }
    const body = (await res.json()) as { orgId: string; slug: string };
    return {
      orgId: body.orgId,
      slug: body.slug,
      orgName,
      adminName,
      adminEmail,
      adminPassword,
    };
  } finally {
    await adminCtx.close();
  }
}

/**
 * Worker-scoped org. Each Playwright worker runs in its own process, so a
 * module-level promise memoizes exactly one org per worker.
 */
let workerOrgPromise: Promise<OrgCreds> | null = null;
export function workerOrg(browser: Browser): Promise<OrgCreds> {
  if (!workerOrgPromise) workerOrgPromise = createOrg(browser, "worker");
  return workerOrgPromise;
}

/** Read-mostly specs: log `ctx` into the worker's shared org. Page on `/`. */
export async function loginAsWorkerOrg(
  browser: Browser,
  ctx: BrowserContext
): Promise<Page> {
  const creds = await workerOrg(browser);
  return loginViaForm(ctx, creds.adminEmail, creds.adminPassword);
}

/**
 * Mutator / isolation specs: create a brand-new org and log `ctx` into it.
 * Returns the page plus the creds (some specs assert on the email/slug).
 */
export async function loginAsFreshOrg(
  browser: Browser,
  ctx: BrowserContext,
  label = "fresh"
): Promise<{ page: Page; org: OrgCreds }> {
  const org = await createOrg(browser, label);
  const page = await loginViaForm(ctx, org.adminEmail, org.adminPassword);
  return { page, org };
}

/**
 * Cross-org tests needing a second, different org in the same test. Drop-in
 * for the old `loginAsOtherDemo(ctx)` — returns a Page on `/`.
 */
export async function loginAsSecondaryOrg(
  browser: Browser,
  ctx: BrowserContext
): Promise<Page> {
  const { page } = await loginAsFreshOrg(browser, ctx, "secondary");
  return page;
}
