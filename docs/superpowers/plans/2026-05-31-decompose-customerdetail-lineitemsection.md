# Decompose CustomerDetail and LineItemSection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add E2E coverage for the currently-untested seams of `CustomerDetail` and `LineItemSection` (Phase 1), then decompose both god files into focused orchestrator + child components (Phase 2) with the new tests proving behaviour is unchanged.

**Architecture:** Two phases. Phase 1 writes Playwright specs that seed via API, drive the real UI, and assert rendered output + persisted shape — verified green against the **current** (un-refactored) code so they capture real behaviour. Phase 2 is a pure structural relocation: identical JSX/classNames/handlers move into child files behind explicit props; orchestrators keep all state, data hooks, and handlers. After each extraction we run `tsc` + `biome`, and at each component's end we re-run the Phase 1 specs.

**Tech Stack:** Next.js (App Router), React, TypeScript, Playwright (E2E), Biome (lint), Vitest (unit). Run E2E with `--workers=1` to match CI and avoid known parallel flakiness.

**Spec:** `docs/superpowers/specs/2026-05-31-decompose-customerdetail-lineitemsection-design.md`

---

## Key facts for the implementer

**Run commands:**
- Typecheck: `npm run typecheck` (→ `tsc --noEmit`)
- Lint: `biome ci .` (must pass clean per project rules)
- E2E (single spec): `npx playwright test tests/e2e/<file>.spec.ts --workers=1`
- Unit: `npm test` (→ `vitest run`)

**Test harness** (`tests/e2e/fixtures/`):
- Login: `loginAsWorkerOrg(browser, ctx)` returns a logged-in `Page` for a lead-role org (`org.ts`). The customer detail page requires `minRole: "lead"`.
- Seed helpers (`seed.ts`), all take `ctx.request` (an `APIRequestContext`):
  - `createCustomer(request, { name?, source? })` → `{ id }`
  - `createLocation(request, customerId, { address?, label? })` → `{ id }`
  - `createSiteMeasure(request, customerId)` → `{ id }` (creates a fresh location internally)
  - `createCustomerAndEstimate(request)` → `{ customerId, siteMeasureId }`
  - `createEstimate(request, siteMeasureId)` → `{ id }`
  - `seedEstimateWithLineItem(request, siteMeasureId)` → `{ estimateId, lineItemId }` (one manual line item: "Engineered hardwood", rate 8.5, unitLabel "ft²")
  - `seedEstimateWithRooms(request)` → `{ siteMeasureId, kitchenId, diningId }` (Kitchen 120 sqft, Dining 80 sqft)
  - `seedApprovedEstimate` / `seedDeclinedEstimate(request, siteMeasureId)`
  - `reloadFresh(page)` — clears localStorage then reloads (drops persisted React Query cache so the page hydrates from server)

**Behaviour notes that affect test-writing:**
- `CustomerInfoCard` inputs use native `defaultValue` + `onBlur` → `handleField` → `PATCH /api/customers/:id` with `{ [field]: value }`.
- `DecimalInput` commits on **blur** (only if the draft changed). To commit a typed value, fill then blur (e.g. focus another field or `page.keyboard.press("Tab")`).
- The estimate builder page heading matches `/^Estimate #/`. The seeded line item's scope button reads `Manual · ft²`.
- Line-item templates: `POST /api/line-item-templates` (minRole lead), body `{ name, description?, rate?, unitLabel? }` (`lib/lineItemTemplates/schema.ts`). There is no seed helper — create inline via `ctx.request.post`.
- Customer detail landmarks: stat labels `Site Measures`, `Open`, `Accepted`, `Last activity`; section headings `Locations`, `Pipeline`; buttons `+ Add location`, `+ Site measure`, `+ Start first site measure`; estimate rows show `E#<n>` and an `Open →` affordance.

---

# PHASE 1 — Add E2E coverage (verify GREEN against current code)

> In this phase the production code already exists. Each test is a **characterization** test: after writing it, run it and expect **PASS**. If it fails, the test is wrong (or your understanding of current behaviour is) — fix the test, do not touch production code.

---

### Task 1: Scaffold `customer-detail.spec.ts` + InfoCard edit test

**Files:**
- Create: `tests/e2e/customer-detail.spec.ts`

- [ ] **Step 1: Write the spec scaffold and the InfoCard test**

```ts
import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomer,
  createLocation,
  createSiteMeasure,
  reloadFresh,
  seedApprovedEstimate,
  seedDeclinedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 17.1 Customer detail page ───────────────────────────────────────────────
// Characterization coverage for the CustomerDetail seams (info card, stat strip,
// pipeline rows, locations add-form, start-site-measure branching) ahead of the
// component decomposition. Seeds via API, drives the UI, asserts rendered output
// and persisted shape.

test.describe("17.1 Customer detail — info card", () => {
  test("17.1.1 editing a field via blur PATCHes and persists on reload", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Edit Me ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // The phone field is empty; type a value and blur to commit.
    const phone = page.getByRole("textbox", { name: "" }).nth(1); // see Step 2 note
    void phone; // replaced below by label-free locators

    const phoneInput = page.locator('input[type="tel"]');
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/customers/${customer.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      (async () => {
        await phoneInput.fill("555-0100");
        await phoneInput.blur();
      })(),
    ]);
    expect(patch.status()).toBe(200);

    await reloadFresh(page);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.locator('input[type="tel"]')).toHaveValue("555-0100");

    await ctx.close();
  });
});
```

- [ ] **Step 2: Clean up the locator scaffold**

Remove the `phone`/`void phone` placeholder lines added in Step 1 (they were only a reminder). Keep the `phoneInput = page.locator('input[type="tel"]')` approach — the info-card inputs have no accessible labels, so target them by `type`:

```ts
// after page.goto + Loading check:
const phoneInput = page.locator('input[type="tel"]');
const [patch] = await Promise.all([
  page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/customers/${customer.id}`) &&
      r.request().method() === "PATCH" &&
      r.status() === 200
  ),
  (async () => {
    await phoneInput.fill("555-0100");
    await phoneInput.blur();
  })(),
]);
expect(patch.status()).toBe(200);
```

- [ ] **Step 3: Run the test, expect PASS**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts --workers=1 -g "17.1.1"`
Expected: 1 passed. (If it fails because the PATCH does not fire, confirm `onBlur` fired — `fill` then `blur` — before changing anything.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/customer-detail.spec.ts
git commit -m "test(e2e): cover CustomerDetail info-card field edit"
```

---

### Task 2: Stat strip + pipeline/SiteMeasureRow tests

**Files:**
- Modify: `tests/e2e/customer-detail.spec.ts`

- [ ] **Step 1: Append the stat-strip + pipeline describe block**

```ts
test.describe("17.2 Customer detail — stats & pipeline", () => {
  test("17.2.1 stat strip reflects seeded estimate statuses", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Stats ${Date.now()}`,
    });
    const sm = await createSiteMeasure(ctx.request, customer.id);
    // 1 open (draft/sent), 1 approved, 1 declined on this site measure.
    await seedEstimateWithLineItem(ctx.request, sm.id);
    await seedApprovedEstimate(ctx.request, sm.id);
    await seedDeclinedEstimate(ctx.request, sm.id);

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    // "Accepted" stat shows 1; the declined hint reads "1 declined".
    await expect(page.getByText("Accepted")).toBeVisible();
    await expect(page.getByText("1 declined")).toBeVisible();
    // Site Measures count is 1.
    await expect(page.getByText("Site Measures")).toBeVisible();

    await ctx.close();
  });

  test("17.2.2 pipeline rows render and navigate to estimate + site measure", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `Pipeline ${Date.now()}`,
    });
    const sm = await createSiteMeasure(ctx.request, customer.id);
    const { estimateId } = await seedEstimateWithLineItem(ctx.request, sm.id);

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText("Pipeline")).toBeVisible();

    // The estimate row shows its E# and links to the estimate.
    await page.getByText(/E#\d+/).first().click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}$`));

    // Back on the detail page, the site-measure header links to the site measure.
    await page.goBack();
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await page.getByText(/Site Measure #\d+/i).first().click();
    await expect(page).toHaveURL(new RegExp(`/site-measures/${sm.id}$`));

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the new tests, expect PASS**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts --workers=1 -g "17.2"`
Expected: 2 passed. (If a `getByText` matches multiple nodes, tighten with `.first()` as already used — do not change production markup.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/customer-detail.spec.ts
git commit -m "test(e2e): cover CustomerDetail stat strip and pipeline rows"
```

---

### Task 3: Locations add-form + startSiteMeasure branching tests

**Files:**
- Modify: `tests/e2e/customer-detail.spec.ts`

- [ ] **Step 1: Append the locations describe block**

```ts
test.describe("17.3 Customer detail — locations & start site measure", () => {
  test("17.3.1 add-location form creates and persists a location", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `AddLoc ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    await page.getByRole("button", { name: "+ Add location" }).click();
    await page.getByPlaceholder("Street, City").fill("742 Evergreen Terrace");
    await page.getByPlaceholder("e.g. Rental, Main house").fill("Main");

    const [post] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/locations") &&
          r.request().method() === "POST" &&
          r.status() === 201
      ),
      page.getByRole("button", { name: "Save location" }).click(),
    ]);
    expect(post.status()).toBe(201);

    await expect(page.getByText("742 Evergreen Terrace")).toBeVisible();

    // Persisted: GET lists the location for this customer.
    const list = await ctx.request.get(
      `/api/locations?customerId=${customer.id}`
    );
    const locs = (await list.json()) as Array<{ address: string }>;
    expect(locs.map((l) => l.address)).toContain("742 Evergreen Terrace");

    await ctx.close();
  });

  test("17.3.2 single-location customer: Start first site measure navigates", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `OneLoc ${Date.now()}`,
    });
    await createLocation(ctx.request, customer.id, { address: "1 Only St" });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    await page
      .getByRole("button", { name: "+ Start first site measure" })
      .click();
    await expect(page).toHaveURL(/\/site-measures\/\d+$/);

    await ctx.close();
  });

  test("17.3.3 zero-location customer: Start first site measure shows a toast", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: `NoLoc ${Date.now()}`,
    });

    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("Loading…")).toHaveCount(0);

    await page
      .getByRole("button", { name: "+ Start first site measure" })
      .click();
    await expect(page.getByText("Add a location first")).toBeVisible();
    // Stays on the customer page (no navigation).
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the new tests, expect PASS**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts --workers=1 -g "17.3"`
Expected: 3 passed.

- [ ] **Step 3: Run the whole customer-detail spec to confirm no cross-test interference**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts --workers=1`
Expected: all passed (6 tests: 17.1.1, 17.2.1, 17.2.2, 17.3.1, 17.3.2, 17.3.3).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/customer-detail.spec.ts
git commit -m "test(e2e): cover CustomerDetail locations form and start-site-measure branching"
```

---

### Task 4: Scaffold `line-item-section.spec.ts` — add / edit / remove rows

**Files:**
- Create: `tests/e2e/line-item-section.spec.ts`

- [ ] **Step 1: Write the spec scaffold + add/edit/remove test**

```ts
import { expect, test } from "@playwright/test";
import { loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  createEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 18.1 Line item section ──────────────────────────────────────────────────
// Characterization coverage for the LineItemSection seams the room-link-picker
// specs (4.1.x) miss: plain row edits, subtotal back-calc, template apply, and
// the totals section. Seeds via API, drives the UI, asserts persisted shape via
// GET /api/estimates/{id}.

test.describe("18.1 Line item section — rows", () => {
  test("18.1.1 add, edit qty/rate, then remove a line item persists each step", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Add a line item.
    const [addPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page.getByRole("button", { name: "+ Add Line Item" }).click(),
    ]);
    expect(addPatch.status()).toBe(200);
    await expect(page.locator('input[value="New line item"]')).toBeVisible();

    // Edit qty (manual) to 5 and rate to 10, committing on blur each time.
    const qty = page.locator('input[inputmode="decimal"]').first();
    await qty.fill("5");
    await qty.blur();
    const rate = page.locator('input[inputmode="decimal"]').nth(1);
    await rate.fill("10");
    const [editPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      rate.blur(),
    ]);
    expect(editPatch.status()).toBe(200);

    // Server reflects qty=5, rate=10.
    const get1 = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const body1 = await get1.json();
    expect(body1.lineItems).toHaveLength(1);
    expect(body1.lineItems[0].qty).toBe(5);
    expect(body1.lineItems[0].rate).toBe(10);

    // Remove the line item (✕ button).
    const [delPatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page.getByRole("button", { name: "✕" }).click(),
    ]);
    expect(delPatch.status()).toBe(200);
    const get2 = await ctx.request.get(`/api/estimates/${estimate.id}`);
    expect((await get2.json()).lineItems).toHaveLength(0);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the test, expect PASS**

Run: `npx playwright test tests/e2e/line-item-section.spec.ts --workers=1 -g "18.1.1"`
Expected: 1 passed. (DecimalInput commits on blur; if no PATCH fires after `fill`, ensure `.blur()` runs — the input only commits when the draft changed.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/line-item-section.spec.ts
git commit -m "test(e2e): cover LineItemSection add/edit/remove row"
```

---

### Task 5: Subtotal back-calc + apply-template tests

**Files:**
- Modify: `tests/e2e/line-item-section.spec.ts`

- [ ] **Step 1: Append the back-calc + template describe block**

```ts
test.describe("18.2 Line item section — subtotal & templates", () => {
  test("18.2.1 editing the subtotal back-calculates the rate from qty", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);
    // Seed a manual line item with qty=4, rate=10 directly.
    await ctx.request.patch(`/api/estimates/${estimate.id}`, {
      data: {
        lineItems: [
          {
            id: 7001,
            name: "Backcalc item",
            rate: 10,
            qtyMode: "manual",
            qty: 4,
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    });

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Subtotal column is the 3rd decimal input in the row (qty, rate, subtotal).
    const subtotal = page.locator('input[inputmode="decimal"]').nth(2);
    await subtotal.fill("100"); // 100 / qty(4) = rate 25
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      subtotal.blur(),
    ]);
    expect(patch.status()).toBe(200);

    const get = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const li = (await get.json()).lineItems[0];
    expect(li.qty).toBe(4);
    expect(li.rate).toBe(25);

    await ctx.close();
  });

  test("18.2.2 applying a template populates name, rate and unit", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    // Seed a line-item template for this org (no fixture helper — POST directly).
    const tplRes = await ctx.request.post("/api/line-item-templates", {
      data: { name: "Laminate Install", rate: 4.25, unitLabel: "sqft" },
    });
    expect(tplRes.status()).toBe(201);

    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedEstimateWithLineItem(
      ctx.request,
      siteMeasureId
    );

    await page.goto(`/estimates/${estimateId}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // The per-row "Use template…" select applies the template on change.
    const [patch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimateId}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      page
        .getByRole("combobox", { name: "Apply template" })
        .first()
        .selectOption({ label: "Laminate Install" }),
    ]);
    expect(patch.status()).toBe(200);

    const get = await ctx.request.get(`/api/estimates/${estimateId}`);
    const li = (await get.json()).lineItems[0];
    expect(li.name).toBe("Laminate Install");
    expect(li.rate).toBe(4.25);
    expect(li.unitLabel).toBe("sqft");

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the new tests, expect PASS**

Run: `npx playwright test tests/e2e/line-item-section.spec.ts --workers=1 -g "18.2"`
Expected: 2 passed. (The template `<select>` has `aria-label="Apply template"` → `getByRole("combobox", { name: "Apply template" })`.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/line-item-section.spec.ts
git commit -m "test(e2e): cover LineItemSection subtotal back-calc and template apply"
```

---

### Task 6: EstimateTotals (fee / markup / deposit) test

**Files:**
- Modify: `tests/e2e/line-item-section.spec.ts`

- [ ] **Step 1: Append the totals describe block**

```ts
test.describe("18.3 Line item section — totals", () => {
  test("18.3.1 fee, markup and deposit percentages persist", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const estimate = await createEstimate(ctx.request, siteMeasureId);
    // One line item with a known subtotal: qty=10, rate=10 → subtotal 100.
    await ctx.request.patch(`/api/estimates/${estimate.id}`, {
      data: {
        lineItems: [
          {
            id: 6001,
            name: "Totals item",
            rate: 10,
            qtyMode: "manual",
            qty: 10,
            wastePct: 0,
            unitLabel: "sqft",
            linkedRoomIds: [],
            sortOrder: 0,
          },
        ],
      },
    });

    await page.goto(`/estimates/${estimate.id}`);
    await expect(
      page.getByRole("heading", { name: /^Estimate #/ })
    ).toBeVisible();

    // Totals % inputs are the decimal inputs after qty/rate/subtotal:
    // index 3 = convenience fee %, 4 = markup %, 5 = deposit %.
    const decimals = page.locator('input[inputmode="decimal"]');
    const fee = decimals.nth(3);
    await fee.fill("10");
    const [feePatch] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/estimates/${estimate.id}`) &&
          r.request().method() === "PATCH" &&
          r.status() === 200
      ),
      fee.blur(),
    ]);
    expect(feePatch.status()).toBe(200);

    const markup = decimals.nth(4);
    await markup.fill("20");
    await markup.blur();
    const deposit = decimals.nth(5);
    await deposit.fill("25");
    await deposit.blur();

    // Give the last save a beat, then read the server state.
    await page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/estimates/${estimate.id}`) &&
        r.request().method() === "PATCH" &&
        r.status() === 200
    );
    const get = await ctx.request.get(`/api/estimates/${estimate.id}`);
    const body = await get.json();
    // Fee/deposit persist as rates (0–1); markup persists as a percent.
    expect(body.convenienceFeeRate).toBeCloseTo(0.1, 5);
    expect(body.markupPct).toBe(20);
    expect(body.depositPct).toBeCloseTo(0.25, 5);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the test, expect PASS**

Run: `npx playwright test tests/e2e/line-item-section.spec.ts --workers=1 -g "18.3.1"`
Expected: 1 passed. (If the final `waitForResponse` races the deposit blur, reorder so each `.fill().blur()` is wrapped in its own `Promise.all([waitForResponse, blur])` as done for the fee — apply that pattern to markup and deposit too.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/line-item-section.spec.ts
git commit -m "test(e2e): cover LineItemSection totals (fee/markup/deposit)"
```

---

### Task 7: Phase 1 gate — full green run

**Files:** none (verification only)

- [ ] **Step 1: Run both new specs together**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts tests/e2e/line-item-section.spec.ts --workers=1`
Expected: all passed (10 tests total).

- [ ] **Step 2: Lint the new test files**

Run: `biome ci .`
Expected: no errors. (Fix any formatting/lint issues, e.g. import order, then re-run.)

- [ ] **Step 3: Commit any lint fixes (if needed)**

```bash
git add -A
git commit -m "chore: lint new e2e specs" || echo "nothing to commit"
```

> **GATE:** Do not start Phase 2 until Step 1 is fully green. These passing tests are the contract Phase 2 must preserve.

---

# PHASE 2 — Decompose the components (keep tests GREEN)

> Pure relocation. Move the exact JSX/classNames/handlers shown by the current line ranges into the new child file; the orchestrator imports the child and passes the listed props. No behaviour, markup, or className changes. After each extraction run `tsc` + `biome`; at each component's end re-run the Phase 1 specs.

---

### Task 8: Promote `formatShortDate` to `lib/utils`

**Files:**
- Modify: `lib/utils.ts`
- Modify: `components/customers/CustomerDetail.tsx:29-36`

- [ ] **Step 1: Add the shared helper to `lib/utils.ts`**

Add near the other formatters (e.g. after `fmtDayHead`, ~line 165):

```ts
/** "Mar 3, 2026" — short, human date. Returns "—" for null/undefined. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
```

- [ ] **Step 2: Use it in `CustomerDetail.tsx`**

Delete the local `formatShortDate` function (lines 29-36) and add `formatShortDate` to the existing `@/lib/utils` import:

```ts
import { formatShortDate, sourceName } from "@/lib/utils";
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts components/customers/CustomerDetail.tsx
git commit -m "refactor: promote formatShortDate to lib/utils"
```

---

### Task 9: Extract `CustomerHeader`

**Files:**
- Create: `components/customers/CustomerHeader.tsx`
- Modify: `components/customers/CustomerDetail.tsx` (header block, current lines 216-237)

- [ ] **Step 1: Create the child component**

Move the header JSX (the `{/* Header */}` block) verbatim into a new file. Props contract:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";
import { formatShortDate, sourceName } from "@/lib/utils";

interface Props {
  customer: { name: string; source: string; createdAt: string };
  locations: CustomerLocationSummary[];
  onBack: () => void;
}

export function CustomerHeader({ customer, locations, onBack }: Props) {
  // ← paste the exact JSX from the {/* Header */} block here, replacing
  //   router.push("/customers") with onBack().
}
```

- [ ] **Step 2: Render it from the orchestrator**

In `CustomerDetail.tsx`, replace the header block with:

```tsx
<CustomerHeader
  customer={customer}
  locations={locations}
  onBack={() => router.push("/customers")}
/>
```

Add the import: `import { CustomerHeader } from "@/components/customers/CustomerHeader";`

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/customers/CustomerHeader.tsx components/customers/CustomerDetail.tsx
git commit -m "refactor: extract CustomerHeader from CustomerDetail"
```

---

### Task 10: Extract `CustomerStatStrip` (incl. `Stat`)

**Files:**
- Create: `components/customers/CustomerStatStrip.tsx`
- Modify: `components/customers/CustomerDetail.tsx` (move `Stat` 55-91; replace stat strip 239-265)

- [ ] **Step 1: Create the child component**

Move the `Stat` helper component (lines 55-91) and the `{/* Stat strip */}` block into the new file. Props contract — the `stats` object the orchestrator already computes:

```tsx
"use client";

import { relativeTime } from "@/lib/estimateStatus";
import { formatShortDate } from "@/lib/utils";

interface Stats {
  siteMeasureCount: number;
  estimateCount: number;
  open: number;
  accepted: number;
  declined: number;
  lastActivity: string | null;
}

// ← paste the `Stat` component here (unchanged).

export function CustomerStatStrip({ stats }: { stats: Stats }) {
  // ← paste the exact JSX from the {/* Stat strip */} block here.
}
```

- [ ] **Step 2: Render it from the orchestrator**

Replace the stat strip block with `<CustomerStatStrip stats={stats} />` and add the import. Delete the now-moved `Stat` component from `CustomerDetail.tsx`.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/customers/CustomerStatStrip.tsx components/customers/CustomerDetail.tsx
git commit -m "refactor: extract CustomerStatStrip from CustomerDetail"
```

---

### Task 11: Extract `CustomerInfoCard`

**Files:**
- Create: `components/customers/CustomerInfoCard.tsx`
- Modify: `components/customers/CustomerDetail.tsx` (customer card, current lines 267-329)

- [ ] **Step 1: Create the child component**

Move the `{/* Customer card */}` block. Props contract:

```tsx
"use client";

import { SourceBadge } from "@/components/ui/SourceBadge";

interface Props {
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    source: string;
    notes: string | null;
  };
  onField: (field: string, value: string) => void;
}

export function CustomerInfoCard({ customer, onField }: Props) {
  // ← paste the exact JSX. The inputs already call handleField via onBlur/onChange;
  //   replace handleField(...) calls with onField(...).
}
```

- [ ] **Step 2: Render it from the orchestrator**

Replace the customer card block with:

```tsx
<CustomerInfoCard customer={customer} onField={handleField} />
```

Add the import.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/customers/CustomerInfoCard.tsx components/customers/CustomerDetail.tsx
git commit -m "refactor: extract CustomerInfoCard from CustomerDetail"
```

---

### Task 12: Extract `LocationsCard`

**Files:**
- Create: `components/customers/LocationsCard.tsx`
- Modify: `components/customers/CustomerDetail.tsx` (locations block, current lines 331-442; relocate `addingLocation`/`locAddress`/`locLabel` state + `handleAddLocation`)

- [ ] **Step 1: Create the child component**

Move the `{/* Locations */}` block **and** its local state (`addingLocation`, `locAddress`, `locLabel`) and the `handleAddLocation` body into the child. The child owns the form; the orchestrator passes the create callback + the start-site-measure callback. Keep `id="locations-card"` on the root div. Props contract:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";

interface Props {
  locations: CustomerLocationSummary[];
  onAddLocation: (address: string, label: string) => Promise<void>;
  onStartSiteMeasure: (locationId: number) => void;
  isAdding: boolean; // createLocation.isPending
  isStarting: boolean; // createSiteMeasure.isPending
}

export function LocationsCard({
  locations,
  onAddLocation,
  onStartSiteMeasure,
  isAdding,
  isStarting,
}: Props) {
  const [addingLocation, setAddingLocation] = useState(false);
  const [locAddress, setLocAddress] = useState("");
  const [locLabel, setLocLabel] = useState("");
  // ← paste the {/* Locations */} JSX. Wire:
  //   - "+ Site measure" button → onStartSiteMeasure(loc.id), disabled={isStarting}
  //   - Save → await onAddLocation(locAddress.trim(), locLabel.trim()); on success
  //     clear inputs + setAddingLocation(false). (Keep the existing empty-address
  //     guard + showToast? No — toast lives in the orchestrator callback. The
  //     child just calls onAddLocation and resets on resolve.)
  //   - disabled={isAdding || !locAddress.trim()}
}
```

> Note: the orchestrator's `handleAddLocation` keeps the empty-address `showToast("Address required")` guard and the try/catch `showToast("Failed to add location")`. The child calls `await onAddLocation(...)` and only resets its inputs after it resolves. To preserve "don't clear on failure", have `onAddLocation` reject on error (the orchestrator's mutateAsync already throws); wrap the child's call in try/catch that resets only on success.

- [ ] **Step 2: Add the orchestrator callback + render**

In `CustomerDetail.tsx`, keep `createLocation`/`createSiteMeasure` hooks. Replace `handleAddLocation` with a thin callback that the child drives:

```tsx
async function handleAddLocation(address: string, label: string) {
  if (!address) {
    showToast("Address required");
    throw new Error("address required");
  }
  try {
    await createLocation.mutateAsync({
      customerId,
      address,
      label: label || undefined,
    });
  } catch {
    showToast("Failed to add location");
    throw new Error("create failed");
  }
}
```

Remove the now-unused `addingLocation`/`locAddress`/`locLabel` state from the orchestrator. Render:

```tsx
<LocationsCard
  locations={locations}
  onAddLocation={handleAddLocation}
  onStartSiteMeasure={handleNewSiteMeasure}
  isAdding={createLocation.isPending}
  isStarting={createSiteMeasure.isPending}
/>
```

> `startSiteMeasure` (the zero/one/many branching + scroll) stays in the orchestrator and is still wired to the Pipeline's "Start first site measure" button. The scroll target `#locations-card` now lives in the child — unchanged id keeps `document.getElementById("locations-card")` working.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/customers/LocationsCard.tsx components/customers/CustomerDetail.tsx
git commit -m "refactor: extract LocationsCard from CustomerDetail"
```

---

### Task 13: Extract `CustomerPipeline` (incl. `SiteMeasureRow` + `StatusPill`)

**Files:**
- Create: `components/customers/CustomerPipeline.tsx`
- Modify: `components/customers/CustomerDetail.tsx` (pipeline block 444-490; move `StatusPill` 38-53 and `SiteMeasureRow` 495-602)

- [ ] **Step 1: Create the child component**

Move `StatusPill` (38-53), `SiteMeasureRow` (495-602), and the `{/* Pipeline */}` block into the new file. Props contract:

```tsx
"use client";

import {
  estimateStatusTone,
  isOpenEstimate,
  lastTouchAt,
  relativeTime,
} from "@/lib/estimateStatus";
import type { CustomerSiteMeasureSummary } from "@/lib/hooks/useCustomers";
import { Button } from "@/components/ui/Button";
import { formatShortDate } from "@/lib/utils";

type PipelineSiteMeasure = CustomerSiteMeasureSummary & {
  locationId: number;
  locationAddress: string;
};

interface Props {
  siteMeasures: PipelineSiteMeasure[];
  openCount: number;
  onStartSiteMeasure: () => void;
  onOpenSiteMeasure: (id: number) => void;
  onOpenEstimate: (id: number) => void;
  isStarting: boolean; // createSiteMeasure.isPending
}

// ← paste StatusPill and SiteMeasureRow (unchanged) here.

export function CustomerPipeline({ ... }: Props) {
  // ← paste the {/* Pipeline */} JSX. Wire:
  //   - "+ Start first site measure" → onStartSiteMeasure(), disabled={isStarting}
  //   - <SiteMeasureRow onOpenSiteMeasure={() => onOpenSiteMeasure(est.id)}
  //                     onOpenEstimate={onOpenEstimate} />
  //   - the "{openCount} awaiting" indicator uses openCount (was stats.open).
}
```

- [ ] **Step 2: Render it from the orchestrator**

Replace the pipeline block with:

```tsx
<CustomerPipeline
  siteMeasures={siteMeasures}
  openCount={stats.open}
  onStartSiteMeasure={startSiteMeasure}
  onOpenSiteMeasure={(id) => router.push(`/site-measures/${id}`)}
  onOpenEstimate={(qid) => router.push(`/estimates/${qid}`)}
  isStarting={createSiteMeasure.isPending}
/>
```

Add the import. Delete the now-moved `StatusPill` and `SiteMeasureRow` from `CustomerDetail.tsx`. `CustomerDetail.tsx` should now be a ~150-line orchestrator: hooks, the three `useMemo`s, the four handlers, the loading/not-found guards, and the five child components in a fragment.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/customers/CustomerPipeline.tsx components/customers/CustomerDetail.tsx
git commit -m "refactor: extract CustomerPipeline from CustomerDetail"
```

---

### Task 14: Verify CustomerDetail decomposition end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the customer specs**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts tests/e2e/customers.spec.ts tests/e2e/locations.spec.ts --workers=1`
Expected: all passed.

- [ ] **Step 2: Full unit + lint sanity**

Run: `npm test && biome ci .`
Expected: all passed, no lint errors.

- [ ] **Step 3: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "test: verify CustomerDetail decomposition green" || echo "nothing to commit"
```

---

### Task 15: Extract `LineItemRow` (incl. `normalizeUnit`)

**Files:**
- Create: `components/estimates/LineItemRow.tsx`
- Modify: `components/estimates/LineItemSection.tsx` (per-row block 204-405; move `normalizeUnit` 35-40)

- [ ] **Step 1: Create the child component**

Move `normalizeUnit` (35-40) and the per-row block (the `items.map((li) => { ... })` body, lines ~189-406, i.e. everything rendered per line item) into a new `LineItemRow`. The orchestrator keeps the `.map`, computes `lineView` per item, and renders `<LineItemRow>`. Props contract:

```tsx
"use client";

import { RoomLinkPicker } from "@/components/estimates/RoomLinkPicker"; // only if needed — picker stays in parent
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/cn";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { isLinkedQtyMode, QtyMode, roomSqft } from "@/lib/utils";

interface Props {
  li: LineItemCalc;
  effectiveQty: number | null;
  subtotal: number | null;
  rooms: RoomItem[];
  templates: LineItemTemplate[];
  readOnly: boolean;
  onUpdate: (patch: Partial<LineItemCalc>) => void;
  onRemove: () => void;
  onCommitSubtotal: (next: number | null) => void;
  onSaveBlur: () => void; // save({ lineItems: items })
  onOpenPicker: (rect: DOMRect) => void;
  onApplyTemplate: (templateId: number) => void;
}

// ← paste normalizeUnit here.

export function LineItemRow({ ... }: Props) {
  // ← paste the per-row JSX. Replace the closures with the props:
  //   updateItem(li.id, patch)        → onUpdate(patch)
  //   removeItem(li.id)               → onRemove()
  //   commitSubtotal(li, next)        → onCommitSubtotal(next)
  //   save({ lineItems: items }) blur → onSaveBlur()
  //   setPicker({lineId: li.id, rect})→ onOpenPicker(rect)
  //   applyTemplate(li.id, n)         → onApplyTemplate(n)
  //   lineById.get(li.id)?.effectiveQty / subtotal → effectiveQty / subtotal props
}
```

- [ ] **Step 2: Render it from the orchestrator**

In `LineItemSection.tsx`, the rows `.map` becomes:

```tsx
items.map((li) => {
  const lineView = lineById.get(li.id);
  return (
    <LineItemRow
      key={li.id}
      li={li}
      effectiveQty={lineView?.effectiveQty ?? null}
      subtotal={lineView?.subtotal ?? null}
      rooms={rooms}
      templates={templates}
      readOnly={readOnly}
      onUpdate={(patch) => updateItem(li.id, patch)}
      onRemove={() => removeItem(li.id)}
      onCommitSubtotal={(next) => commitSubtotal(li, next)}
      onSaveBlur={() => save({ lineItems: items })}
      onOpenPicker={(rect) => setPicker({ lineId: li.id, rect })}
      onApplyTemplate={(templateId) => applyTemplate(li.id, templateId)}
    />
  );
});
```

Keep the empty-state (`items.length === 0`) branch and the header in the parent. Add the import. Delete the moved `normalizeUnit` from the parent.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/estimates/LineItemRow.tsx components/estimates/LineItemSection.tsx
git commit -m "refactor: extract LineItemRow from LineItemSection"
```

---

### Task 16: Extract `EstimateTotals` (incl. `PctRow` + `PctInline`)

**Files:**
- Create: `components/estimates/EstimateTotals.tsx`
- Modify: `components/estimates/LineItemSection.tsx` (calc section 409-478; move `PctRow` 528-549 and `PctInline` 551-576)

- [ ] **Step 1: Create the child component**

Move `PctRow`, `PctInline`, and the `{/* Calc section */}` block (only rendered when `items.length > 0`) into a new file. Props contract:

```tsx
"use client";

import { DecimalInput } from "@/components/ui/DecimalInput";
import { fmtDollar } from "@/lib/utils";

interface Props {
  subtotal: number;
  feePct: number;
  markupPct: number;
  depositPct: number; // depositPctState
  feeAmt: number;
  markupAmt: number;
  total: number;
  deposit: number;
  margin: number;
  readOnly: boolean;
  onCommitFee: (nextPct: number) => void;
  onCommitMarkup: (nextPct: number) => void;
  onCommitDeposit: (nextPct: number) => void;
}

// ← paste PctRow and PctInline here (unchanged).

export function EstimateTotals({ ... }: Props) {
  // ← paste the calc section JSX, wiring the three PctRow/PctInline onCommit
  //   handlers to onCommitFee / onCommitMarkup / onCommitDeposit.
}
```

- [ ] **Step 2: Render it from the orchestrator**

Replace the calc section with:

```tsx
{items.length > 0 && (
  <EstimateTotals
    subtotal={subtotal}
    feePct={feePct}
    markupPct={markupPct}
    depositPct={depositPctState}
    feeAmt={feeAmt}
    markupAmt={markupAmt}
    total={total}
    deposit={deposit}
    margin={margin}
    readOnly={readOnly}
    onCommitFee={(next) => {
      setFeePct(next);
      save({ convenienceFeeRate: next / 100 });
    }}
    onCommitMarkup={(next) => {
      setMarkupPct(next);
      save({ markupPct: next });
    }}
    onCommitDeposit={(next) => {
      setDepositPctState(next);
      save({ depositPct: next / 100 });
    }}
  />
)}
```

Add the import. Delete the moved `PctRow`/`PctInline` from the parent. `LineItemSection.tsx` is now a ~230-line orchestrator: state, `computeEstimateView` memo, `lineById`, the mutators, the room summary, the rows `.map` → `LineItemRow`, `EstimateTotals`, the add-button, and the `RoomLinkPicker` invocation.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && biome ci .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/estimates/EstimateTotals.tsx components/estimates/LineItemSection.tsx
git commit -m "refactor: extract EstimateTotals from LineItemSection"
```

---

### Task 17: Final verification — full suite green

**Files:** none (verification only)

- [ ] **Step 1: Run the estimate + line-item specs**

Run: `npx playwright test tests/e2e/line-item-section.spec.ts tests/e2e/estimate-builder.spec.ts tests/e2e/estimate-lockdown.spec.ts --workers=1`
Expected: all passed.

- [ ] **Step 2: Run the new Phase 1 specs once more (regression)**

Run: `npx playwright test tests/e2e/customer-detail.spec.ts tests/e2e/line-item-section.spec.ts --workers=1`
Expected: all 10 passed.

- [ ] **Step 3: Full unit suite + lint**

Run: `npm test && biome ci .`
Expected: all tests pass, no lint errors.

- [ ] **Step 4: Confirm file sizes dropped**

Run: `npx wc -l components/customers/CustomerDetail.tsx components/estimates/LineItemSection.tsx`
Expected: each well under 300 lines (orchestrators only).

- [ ] **Step 5: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test: verify LineItemSection decomposition green" || echo "nothing to commit"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Phase 1 Tasks 1-6 cover every uncovered seam the spec lists (InfoCard, StatStrip, Pipeline/SiteMeasureRow, LocationsCard add-form, startSiteMeasure branching, LineItemRow edits, subtotal back-calc, template apply, EstimateTotals). Phase 2 Tasks 8-16 create exactly the files the spec's two tables list; Tasks 14 & 17 are the spec's verification steps.
- **Behaviour preservation:** every Phase 2 task is JSX relocation behind props — no className or logic edits. The only non-mechanical change is Task 8 (`formatShortDate` → util, identical output) and Task 12's add-location reset-on-success contract (preserves "don't clear inputs on failure").
- **If a Phase 1 test fails against current code:** the test encodes a wrong assumption — fix the test, never the production code, in Phase 1.
- **Line numbers** are from the pre-refactor files and will drift as you extract; use the `{/* comment */}` markers in the JSX to locate blocks.
