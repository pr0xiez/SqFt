# Organization Onboarding — Phase 3: E2E Test Orgs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Playwright spec run against an isolated tenant it creates at runtime through the existing super-admin endpoint, instead of sharing the two seeded demo orgs — eliminating shared-org flakes.

**Architecture:** A new `tests/e2e/fixtures/org.ts` exposes helpers that mint a fresh tenant via `POST /api/admin/orgs` (Phase 2's super-admin route, authenticated as the seeded `admin@sqft.dev`). Read-mostly specs share one worker-scoped org (`loginAsWorkerOrg`); org-state mutators and cross-org tests create brand-new orgs per test (`loginAsFreshOrg` / `loginAsSecondaryOrg`). `fixtures/users.ts` is adapted so role/members specs create their lead/crew users inside their own fresh org. There is **no** test-only API, **no** `E2E_TEST_MODE`, and **no** teardown: every org gets a unique name + admin email so reruns never collide. The seed is left intact as the manual-dev fallback.

**Tech Stack:** Playwright (`@playwright/test`), Next.js 16, Prisma 7, NextAuth (credentials login via `/login` form), biome (`biome ci .` must pass). Reuses Phase 2's `POST /api/admin/orgs` and the seeded `admin@sqft.dev` / `demo1234` super-admin.

**Spec:** [docs/superpowers/specs/2026-05-25-organization-onboarding-design.md](../specs/2026-05-25-organization-onboarding-design.md) — "Phase 3 — E2E Test Orgs" section.

## Files

**Create:**
- `tests/e2e/fixtures/org.ts` — `createOrg`, `workerOrg`, `loginAsWorkerOrg`, `loginAsFreshOrg`, `loginAsSecondaryOrg`, `OrgCreds`
- `tests/e2e/admin-orgs.spec.ts` — super-admin UI spec (deferred from Phase 2)

**Modify:**
- `tests/e2e/fixtures/users.ts` — replace demo-org `createTestUser` with `createOrgWithAdmin` + `addUserToOrg`
- `tests/e2e/fixtures/seed.ts` — remove `loginAs`, `loginAsDemo`, `loginAsOtherDemo` and the now-unused `fixtures/auth` import
- 19 spec files — swap login helpers (enumerated in Tasks 3–7)

**Delete:**
- `tests/e2e/fixtures/auth.ts` — the `DEMO_*` constants and the unused `authedPage` worker fixture become dead once specs migrate

---

## Task 1: The org-creation fixture (`fixtures/org.ts`)

**Files:**
- Create: `tests/e2e/fixtures/org.ts`

This is the core of Phase 3. Every other task depends on it. It has no test of its own — it is exercised by the entire migrated suite in Task 11.

- [ ] **Step 1: Write the fixture module**

Create `tests/e2e/fixtures/org.ts`:

```ts
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
      throw new Error(
        `createOrg failed: ${res.status()} ${await res.text()}`
      );
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
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors. (No spec imports it yet, so nothing else changes.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/org.ts
git commit -m "feat(e2e): add super-admin-backed org fixtures"
```

---

## Task 2: Adapt `fixtures/users.ts` to per-org users

**Files:**
- Modify: `tests/e2e/fixtures/users.ts`

The current `createTestUser` logs in as `demo@sqft.dev` and creates users in the shared demo org. After Phase 3, role/members specs need their users inside a **fresh** org. Replace `createTestUser` with two helpers: one that creates a fresh org (its admin is returned as a `TestUser`), and one that adds a user of a given role to an existing org.

- [ ] **Step 1: Rewrite the module**

Replace the entire contents of `tests/e2e/fixtures/users.ts` with:

```ts
/**
 * Per-org user fixtures for role/members specs.
 *
 * `createOrgWithAdmin` mints a fresh org via the super-admin endpoint; the
 * org's admin (created by `createOrganization`) is returned as a `TestUser`.
 * `addUserToOrg` logs in as that admin and creates an additional user of the
 * given role via POST /api/users. Every email is unique per run, so there is
 * no cleanup — matching the other e2e fixtures.
 *
 * Direct Prisma access would be cleaner but the generated client is CommonJS
 * and Playwright's runtime is ESM, so we go through HTTP.
 */
import type { Browser } from "@playwright/test";
import { createOrg, loginViaForm, type OrgCreds } from "./org";

export type Role = "admin" | "lead" | "crew";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

/**
 * Create a fresh org. Returns the org plus its admin as a `TestUser` (the
 * admin's `id` is unknown from the create response and left empty — specs key
 * off email/password, not id).
 */
export async function createOrgWithAdmin(
  browser: Browser
): Promise<{ org: OrgCreds; admin: TestUser }> {
  const org = await createOrg(browser, "roles");
  return {
    org,
    admin: {
      id: "",
      email: org.adminEmail,
      password: org.adminPassword,
      role: "admin",
    },
  };
}

/**
 * Add a user of `role` to an existing org by logging in as that org's admin
 * and POSTing /api/users. Email is `{role}-{timestamp}-{rand}@playwright.test`.
 */
export async function addUserToOrg(
  browser: Browser,
  org: OrgCreds,
  role: Role
): Promise<TestUser> {
  const password = "test-pw-1234";
  const ctx = await browser.newContext();
  try {
    await loginViaForm(ctx, org.adminEmail, org.adminPassword);
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@playwright.test`;
    const res = await ctx.request.post("/api/users", {
      data: { name: `Test ${role}`, email, role, password },
    });
    if (!res.ok()) {
      throw new Error(
        `addUserToOrg(${role}) failed: ${res.status()} ${await res.text()}`
      );
    }
    const user = (await res.json()) as { id: string };
    return { id: user.id, email, password, role };
  } finally {
    await ctx.close();
  }
}

/**
 * Login helper that drives the login form, awaits navigation, and returns when
 * the page is settled on the post-login route (crew → /schedule, else → /).
 */
export async function loginAsTestUser(
  page: import("@playwright/test").Page,
  user: TestUser
): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await Promise.all([
    page.waitForURL(user.role === "crew" ? "/schedule" : "/"),
    page.click('button[type="submit"]'),
  ]);
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: TypeScript errors in `role-lead.spec.ts`, `role-crew.spec.ts`, and `members.spec.ts` — they still import the removed `createTestUser`. That is expected; Tasks 5 and 6 fix them. The fixture file itself must compile (no errors *within* `users.ts`). If `npm run typecheck` reports errors only in those three spec files, proceed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/users.ts
git commit -m "refactor(e2e): per-org user fixtures (createOrgWithAdmin, addUserToOrg)"
```

---

## Task 3: Migrate the 6 single-org (`loginAsDemo`-only) specs

**Files:**
- Modify: `tests/e2e/quote-sibling-decline.spec.ts`
- Modify: `tests/e2e/quote-builder.spec.ts`
- Modify: `tests/e2e/quote-lockdown.spec.ts`
- Modify: `tests/e2e/public-quote.spec.ts`
- Modify: `tests/e2e/quote-accept-decline.spec.ts`
- Modify: `tests/e2e/customers-pagination.spec.ts`

These specs use only `loginAsDemo` (no `loginAsOtherDemo`). They only create row-level data (customers/estimates/quotes), so the shared worker org is correct and matches their prior shared-demo-org behaviour.

**The mechanical recipe (apply to each file):**

1. In the `import { … } from "./fixtures/seed"` line, **remove** `loginAsDemo`. Keep every other imported name (e.g. `createCustomer`, `seedQuoteWithLineItem`, `reloadFresh`, `TEST_SIGNATURE_PNG`). If `loginAsDemo` was the only import, delete the whole line.
2. Add a new import: `import { loginAsWorkerOrg } from "./fixtures/org";`
3. Replace every call `loginAsDemo(ctx)` with `loginAsWorkerOrg(browser, ctx)`. The enclosing test/hook always has `browser` in its args (`async ({ browser }) => …`) because the surrounding code calls `browser.newContext()`. If a given call site does not already destructure `browser`, add it to the test/hook signature.

- [ ] **Step 1: Apply the recipe to all 6 files**

Worked example — `customers-pagination.spec.ts`. Before:

```ts
import { expect, test } from "@playwright/test";
import { loginAsDemo, reloadFresh } from "./fixtures/seed";
```

After:

```ts
import { expect, test } from "@playwright/test";
import { reloadFresh } from "./fixtures/seed";
import { loginAsWorkerOrg } from "./fixtures/org";
```

…and each `const page = await loginAsDemo(ctx);` becomes `const page = await loginAsWorkerOrg(browser, ctx);` (ensuring the test signature is `async ({ browser }) => …`).

Apply the identical transformation to `quote-sibling-decline.spec.ts`, `quote-builder.spec.ts`, `quote-lockdown.spec.ts`, `public-quote.spec.ts`, and `quote-accept-decline.spec.ts`.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors in these 6 files. (The 3 users-based specs and `auth.spec.ts` may still error — that is fine until Tasks 5–7.)

- [ ] **Step 3: Run the migrated specs against a local server**

Start the dev server in the background and run just these specs:

Run: `npx playwright test customers-pagination quote-builder quote-lockdown public-quote quote-accept-decline quote-sibling-decline`

Expected: all pass. Requires `SUPER_ADMIN_EMAILS=admin@sqft.dev` in `.env` (see Task 10) and a seeded local DB (`npm run seed:dev`). If they fail with a 403 from `/api/admin/orgs`, the super-admin env var is missing — fix Task 10 first.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/quote-sibling-decline.spec.ts tests/e2e/quote-builder.spec.ts tests/e2e/quote-lockdown.spec.ts tests/e2e/public-quote.spec.ts tests/e2e/quote-accept-decline.spec.ts tests/e2e/customers-pagination.spec.ts
git commit -m "test(e2e): migrate single-org specs to worker org fixture"
```

---

## Task 4: Migrate the 9 two-org (`loginAsDemo` + `loginAsOtherDemo`) specs

**Files:**
- Modify: `tests/e2e/schedule.spec.ts`
- Modify: `tests/e2e/quotes-list.spec.ts`
- Modify: `tests/e2e/quote-revise.spec.ts`
- Modify: `tests/e2e/quote-send.spec.ts`
- Modify: `tests/e2e/org-settings.spec.ts`
- Modify: `tests/e2e/estimates-list.spec.ts`
- Modify: `tests/e2e/customers.spec.ts`
- Modify: `tests/e2e/estimate-builder.spec.ts`
- Modify: `tests/e2e/crew.spec.ts`

These use both helpers. The primary org becomes the worker org; the "other" org becomes a fresh secondary org so cross-org/isolation assertions still hold (different `orgId`, 404s across tenants).

**The mechanical recipe (apply to each file):**

1. In the `import { … } from "./fixtures/seed"` line, **remove** `loginAsDemo` and `loginAsOtherDemo`. Keep every other name (e.g. `createCustomer`). If they were the only imports, delete the line.
2. Add: `import { loginAsWorkerOrg, loginAsSecondaryOrg } from "./fixtures/org";`
3. Replace `loginAsDemo(ctx)` → `loginAsWorkerOrg(browser, ctx)`.
4. Replace `loginAsOtherDemo(ctx)` → `loginAsSecondaryOrg(browser, ctx)`.
5. Ensure each affected test/hook destructures `browser` in its args.

- [ ] **Step 1: Apply the recipe to all 9 files**

Worked example — `org-settings.spec.ts`. Before:

```ts
import { expect, test } from "@playwright/test";
import { loginAsDemo, loginAsOtherDemo } from "./fixtures/seed";

test.describe("12.1 Org settings GET", () => {
  test("12.1.1 demo user GETs their org", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const res = await ctx.request.get("/api/org");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBeTruthy();
    await ctx.close();
  });

  // 12.1.2 unchanged …

  test("12.1.3 two demo users see different orgs", async ({ browser }) => {
    const ctxA = await browser.newContext();
    await loginAsDemo(ctxA);
    const orgA = await (await ctxA.request.get("/api/org")).json();

    const ctxB = await browser.newContext();
    await loginAsOtherDemo(ctxB);
    const orgB = await (await ctxB.request.get("/api/org")).json();

    expect(orgA.id).not.toBe(orgB.id);
    await ctxA.close();
    await ctxB.close();
  });
});
```

After:

```ts
import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";

test.describe("12.1 Org settings GET", () => {
  test("12.1.1 demo user GETs their org", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const res = await ctx.request.get("/api/org");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBeTruthy();
    await ctx.close();
  });

  // 12.1.2 unchanged …

  test("12.1.3 two demo users see different orgs", async ({ browser }) => {
    const ctxA = await browser.newContext();
    await loginAsWorkerOrg(browser, ctxA);
    const orgA = await (await ctxA.request.get("/api/org")).json();

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const orgB = await (await ctxB.request.get("/api/org")).json();

    expect(orgA.id).not.toBe(orgB.id);
    await ctxA.close();
    await ctxB.close();
  });
});
```

Apply the identical transformation to the other 8 files. Note for `customers.spec.ts`: the cross-org 404 tests (10.1.4–10.1.6) currently call `loginAsOtherDemo(otherCtx)` — these become `loginAsSecondaryOrg(browser, otherCtx)`, and the enclosing tests already receive `browser` in their args.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors in these 9 files.

- [ ] **Step 3: Run the migrated specs**

Run: `npx playwright test schedule quotes-list quote-revise quote-send org-settings estimates-list customers estimate-builder crew`

Expected: all pass. Cross-org 404 / different-org-id assertions hold because the secondary org is a genuinely separate tenant.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/schedule.spec.ts tests/e2e/quotes-list.spec.ts tests/e2e/quote-revise.spec.ts tests/e2e/quote-send.spec.ts tests/e2e/org-settings.spec.ts tests/e2e/estimates-list.spec.ts tests/e2e/customers.spec.ts tests/e2e/estimate-builder.spec.ts tests/e2e/crew.spec.ts
git commit -m "test(e2e): migrate two-org specs to worker + secondary org fixtures"
```

---

## Task 5: Migrate `role-lead.spec.ts` and `role-crew.spec.ts`

**Files:**
- Modify: `tests/e2e/role-lead.spec.ts`
- Modify: `tests/e2e/role-crew.spec.ts`

Each creates a single role user. After migration, each creates its own fresh org and adds the role user to it.

- [ ] **Step 1: Update `role-lead.spec.ts`**

Replace the import block and `beforeAll` at the top. Before:

```ts
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async ({ browser }) => {
  user = await createTestUser(browser, "lead");
});
```

After:

```ts
import { expect, test } from "@playwright/test";
import {
  addUserToOrg,
  createOrgWithAdmin,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async ({ browser }) => {
  const { org } = await createOrgWithAdmin(browser);
  user = await addUserToOrg(browser, org, "lead");
});
```

Leave the three test bodies unchanged — they use `loginAsTestUser(page, user)`, which is unchanged.

- [ ] **Step 2: Update `role-crew.spec.ts`**

Apply the identical transformation, but with role `"crew"`:

```ts
import { expect, test } from "@playwright/test";
import {
  addUserToOrg,
  createOrgWithAdmin,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async ({ browser }) => {
  const { org } = await createOrgWithAdmin(browser);
  user = await addUserToOrg(browser, org, "crew");
});
```

Leave all test bodies unchanged.

- [ ] **Step 3: Typecheck, lint, run**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors in both files.

Run: `npx playwright test role-lead role-crew`

Expected: all pass. The lead/crew users now live in a fresh org, so nav/redirect assertions are unaffected by any other org's state.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/role-lead.spec.ts tests/e2e/role-crew.spec.ts
git commit -m "test(e2e): role specs create users in a fresh org"
```

---

## Task 6: Migrate `members.spec.ts`

**Files:**
- Modify: `tests/e2e/members.spec.ts`

`members.spec.ts` needs an admin **and** a target user **in the same org**. The fresh org's own admin serves as the admin; the target is added to that org.

- [ ] **Step 1: Update the import block and `beforeAll`**

Before:

```ts
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let admin: TestUser;
let target: TestUser;

test.beforeAll(async ({ browser }) => {
  admin = await createTestUser(browser, "admin");
  target = await createTestUser(browser, "crew");
});
```

After:

```ts
import { expect, test } from "@playwright/test";
import {
  addUserToOrg,
  createOrgWithAdmin,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let admin: TestUser;
let target: TestUser;

test.beforeAll(async ({ browser }) => {
  const { org, admin: orgAdmin } = await createOrgWithAdmin(browser);
  admin = orgAdmin;
  target = await addUserToOrg(browser, org, "crew");
});
```

Leave the `memberRow` helper and all four test bodies unchanged — they key off `admin.email` / `target.email` and `loginAsTestUser`, all still valid.

- [ ] **Step 2: Typecheck, lint, run**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors.

Run: `npx playwright test members`

Expected: all pass. Admin and target share one fresh org, so the role-change and invite flows behave exactly as before but in isolation.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/members.spec.ts
git commit -m "test(e2e): members spec uses a fresh org with admin + target"
```

---

## Task 7: Migrate `auth.spec.ts` and remove dead login helpers

**Files:**
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/fixtures/seed.ts`
- Delete: `tests/e2e/fixtures/auth.ts`

`auth.spec.ts` is the last consumer of the `DEMO_*` constants from `fixtures/auth.ts`. It needs *a* valid credential pair; a fresh org's admin works. Once it migrates, `fixtures/auth.ts` and the seed login helpers are dead.

- [ ] **Step 1: Update `auth.spec.ts`**

Replace the import and add a `beforeAll` that mints an org. Before:

```ts
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
  // … 1.1.2, 1.1.3 use DEMO_EMAIL / DEMO_PASSWORD …
});
```

After (top of file):

```ts
import { expect, test } from "@playwright/test";
import { createOrg, type OrgCreds } from "./fixtures/org";

let org: OrgCreds;

test.beforeAll(async ({ browser }) => {
  org = await createOrg(browser, "auth");
});
```

Then replace, throughout the file:
- `DEMO_EMAIL` → `org.adminEmail`
- `DEMO_PASSWORD` → `org.adminPassword`

Specifically:
- **1.1.1** uses both → `org.adminEmail` / `org.adminPassword`.
- **1.1.2** (wrong password): email `org.adminEmail`, password stays the literal `"wrongpassword"`.
- **1.1.3** (non-existent email): email stays the literal `"nobody@nowhere.example.com"`, password `org.adminPassword`.
- **1.1.4** and **1.2.x** use no credentials — leave unchanged.

- [ ] **Step 2: Remove the login helpers from `fixtures/seed.ts`**

Open `tests/e2e/fixtures/seed.ts`. Delete the `fixtures/auth` import (lines 7–12) and the entire `// ── login ──` section: the `loginAs`, `loginAsDemo`, and `loginAsOtherDemo` functions (lines 14–34). After the edit the file starts like this:

```ts
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
} from "@playwright/test";

// ── reload helper ────────────────────────────────────────────────────────────

/**
 * Drop persisted React Query cache before reloading so the page hydrates from
 * server data, not stale localStorage.
 */
export async function reloadFresh(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

// ── customer / estimate ──────────────────────────────────────────────────────
// (everything from createCustomer onward stays unchanged)
```

Keep `BrowserContext` in the import only if it is still referenced after removing `loginAs*`. After the deletion, `reloadFresh` uses `Page`, and the customer/estimate/quote helpers use `APIRequestContext`. `BrowserContext` is no longer used → remove it from the import to satisfy lint. The final import becomes:

```ts
import { type APIRequestContext, expect, type Page } from "@playwright/test";
```

- [ ] **Step 3: Delete the now-unused auth fixture**

Run: `git rm tests/e2e/fixtures/auth.ts`

(Nothing imports `DEMO_*`, `authDir`, or the `authedPage` worker fixture anymore. Confirm with `git grep -n "fixtures/auth"` — it must return nothing.)

- [ ] **Step 4: Typecheck, lint, run**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors across the whole repo now — every spec compiles against the new fixtures.

Run: `npx playwright test auth`

Expected: all `1.1.*` and `1.2.*` tests pass. The happy-path login uses the fresh org admin; the error-path tests behave identically.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/auth.spec.ts tests/e2e/fixtures/seed.ts
git commit -m "test(e2e): migrate auth spec; drop dead demo-login helpers"
```

---

## Task 8: New `admin-orgs.spec.ts` (deferred from Phase 2)

**Files:**
- Create: `tests/e2e/admin-orgs.spec.ts`

The Phase 2 super-admin UI had its Playwright spec deferred to Phase 3 because it needs the fresh-org fixtures. This spec drives the full operator flow: super-admin signs in, creates an org via the `/admin/orgs` UI, then the new admin signs in and sees zero cross-org data.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/admin-orgs.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createOrg,
  loginViaForm,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from "./fixtures/org";

test.describe("admin-orgs UI", () => {
  test("super-admin creates an org; new admin logs in isolated", async ({
    browser,
  }) => {
    // 1. Super-admin signs in and opens the admin page.
    const adminCtx = await browser.newContext();
    const adminPage = await loginViaForm(
      adminCtx,
      SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD
    );
    await adminPage.goto("/admin/orgs");
    await expect(
      adminPage.getByRole("heading", { name: /organizations/i })
    ).toBeVisible();

    // 2. Fill the create form with unique values.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const orgName = `UI Pilot ${suffix}`;
    const newAdminEmail = `ui-pilot+${suffix}@playwright.test`;
    const newAdminPassword = `pw-${suffix}-A1`;

    await adminPage.getByRole("button", { name: /new organization/i }).click();
    const form = adminPage.locator("form");
    await form.getByLabel(/organization name/i).fill(orgName);
    await form.getByLabel(/admin name/i).fill(`Pilot Admin ${suffix}`);
    await form.getByLabel(/admin email/i).fill(newAdminEmail);
    await form.getByLabel(/temporary password/i).fill(newAdminPassword);
    await form.getByRole("button", { name: /create org/i }).click();

    // 3. Success card shows the new admin email.
    await expect(adminPage.getByText(newAdminEmail)).toBeVisible();
    await adminCtx.close();

    // 4. New admin signs in to a fresh context and sees an empty tenant.
    const newCtx = await browser.newContext();
    const newPage = await loginViaForm(
      newCtx,
      newAdminEmail,
      newAdminPassword
    );
    await newPage.goto("/customers");
    // A brand-new org has zero customers — the seeded demo customers must not
    // be visible to this tenant.
    await expect(newPage.getByText("Acme Co")).toHaveCount(0);
    await expect(newPage.getByText("Johnson", { exact: false })).toHaveCount(0);
    await newCtx.close();
  });

  test("non-super-admin gets the 403 panel", async ({ browser }) => {
    // A fresh org's admin is a normal admin, not a super-admin.
    const org = await createOrg(browser, "non-super");
    const ctx = await browser.newContext();
    const page = await loginViaForm(ctx, org.adminEmail, org.adminPassword);
    await page.goto("/admin/orgs");
    await expect(page.getByText(/super-admin only/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Organizations$/ })
    ).toHaveCount(0);
    await ctx.close();
  });
});
```

Notes:
- The form-field labels (`Organization name`, `Admin name`, `Admin email`, `Temporary password`) and button text (`+ New organization`, `Create org`) come from Phase 2's `CreateOrgForm`. The `getByLabel` regexes are case-insensitive and tolerate the `+` prefix on the button. If a selector misses, open `components/admin/orgs/CreateOrgForm.tsx` and match the exact label/button text.
- The 403 panel text (`Super-admin only`) comes from `app/(admin)/layout.tsx`'s `ForbiddenPanel`.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors.

- [ ] **Step 3: Run the spec**

Run: `npx playwright test admin-orgs`

Expected: both tests pass. Requires `SUPER_ADMIN_EMAILS=admin@sqft.dev` in the target env.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin-orgs.spec.ts
git commit -m "test(e2e): admin-orgs UI spec (super-admin create + tenant isolation)"
```

---

## Task 9: Ensure `SUPER_ADMIN_EMAILS` is set for local e2e

**Files:**
- Modify: `.env` (local, gitignored — do NOT commit)
- Verify: `.env.example` already documents the var (added in Phase 2)

CI's Vercel Preview already carries `SUPER_ADMIN_EMAILS` (confirmed by the user). Local `npm run test:e2e` runs against a local dev server, which reads `.env`. The seeded `admin@sqft.dev` must be recognised as a super-admin there too, or `POST /api/admin/orgs` returns 403 and every fixture fails.

- [ ] **Step 1: Confirm the local `.env` value**

Run: `git grep -h "SUPER_ADMIN_EMAILS" .env.example` to see the documented form, then check your local `.env`:

Run: `grep -c "SUPER_ADMIN_EMAILS" .env` (PowerShell: `Select-String SUPER_ADMIN_EMAILS .env`).

If `.env` has no `SUPER_ADMIN_EMAILS` line, append one that includes the seeded super-admin:

```bash
SUPER_ADMIN_EMAILS="admin@sqft.dev"
```

If it already has the var, ensure `admin@sqft.dev` is in the comma-separated list (append `,admin@sqft.dev` if not).

- [ ] **Step 2: No commit**

`.env` is gitignored. Nothing to commit here. This step only guarantees local runs work; CI is already configured.

---

## Task 10: Full e2e sweep + lint

**Files:** none — verification only.

- [ ] **Step 1: Reseed the local DB**

Run: `npm run seed:dev`

Expected: the seed completes (creates `admin@sqft.dev` super-admin among the demo data). This guarantees the super-admin login the fixtures depend on exists locally.

- [ ] **Step 2: Run the full Playwright suite**

Run: `npm run test:e2e`

Expected: every spec passes. Watch specifically for:
- Any 403 from `/api/admin/orgs` → `SUPER_ADMIN_EMAILS` missing/incorrect (Task 9).
- Any cross-org assertion failure → the secondary org is not actually distinct (re-check Task 4's `loginAsSecondaryOrg` swaps).

If a spec fails, do NOT dismiss as a flake — read the failure and fix forward. The whole point of Phase 3 is determinism.

- [ ] **Step 3: Confirm no references to the old fixtures remain**

Run: `git grep -n "loginAsDemo\|loginAsOtherDemo\|createTestUser\|fixtures/auth\|DEMO_EMAIL\|DEMO_OTHER_EMAIL"`

Expected: **no matches**. Any hit is an unmigrated spec or a stale import — fix it.

- [ ] **Step 4: Lint**

Run: `npm run lint:ci`

Expected: zero errors.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add <files>
git commit -m "fix(e2e): <what you fixed>"
```

If everything was already green, no commit needed.

---

## Spec Coverage Check

| Spec section | Plan task |
| --- | --- |
| Reuse super-admin `POST /api/admin/orgs`; no test-only API / env gate | Task 1 (`createOrg`) |
| Worker-scoped shared org (`workerOrg` / `loginAsWorkerOrg`) | Task 1, applied in Tasks 3–4 |
| Per-test fresh orgs for mutators (`loginAsFreshOrg`) | Tasks 5, 6 (via `createOrgWithAdmin`) |
| Second org for cross-org tests (`loginAsSecondaryOrg`) | Task 4 |
| `createTestUser`/`loginAsTestUser` adapted to per-org users | Task 2 |
| Spec migration — all specs off shared demo orgs | Tasks 3–7 |
| Remove unused `loginAsDemo` / `loginAsOtherDemo` helpers | Task 7 |
| `admin-orgs.spec.ts` (deferred from Phase 2) | Task 8 |
| Unique org names + admin emails (rerun-safety, no teardown) | Task 1 (`uniqueSuffix`), Task 2 |
| Seed left intact | (no seed task — deliberately untouched) |
| `SUPER_ADMIN_EMAILS` config for the target env | Task 9 |
| Full suite green + `biome ci .` clean | Task 10 |

Out of scope (Phase 4): Stripe Checkout + webhook, `/signup`, paywall guard activation, `/settings/billing`. Also deferred: trimming the now-unreferenced demo users/orgs (`lead@`, `crew@`, `other-floors-demo`, `demo2@`) from the seed — a trivial follow-up once this lands.

---

## Acceptance Criteria

When this plan is fully executed:

1. `tests/e2e/fixtures/org.ts` mints isolated tenants via `POST /api/admin/orgs`, with worker-scoped and per-test scopes, using unique names + emails.
2. `fixtures/users.ts` creates role/members users inside a fresh org (no demo-org dependency).
3. Every spec runs against an org it created at runtime; `git grep` finds no `loginAsDemo` / `loginAsOtherDemo` / `createTestUser` / `fixtures/auth` references.
4. `fixtures/auth.ts` is deleted; the demo-login helpers are removed from `fixtures/seed.ts`.
5. `admin-orgs.spec.ts` exercises super-admin org creation + tenant isolation through the UI.
6. The seed is unchanged and `demo@sqft.dev` / `admin@sqft.dev` still work for manual exploration.
7. `npm run test:e2e` passes against the Vercel preview in CI and locally; `npm test` (Vitest) is unaffected.
8. `biome ci .` produces zero errors.

Phase 3 is then complete. Phase 4's plan (Stripe + signup + paywall) can be written on top.
