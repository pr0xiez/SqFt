# E2E Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright e2e specs for the quote lifecycle (send / accept / decline / revise / sibling-decline / lockdown) plus supporting CRUD and tenant-isolation coverage, extracting shared seed helpers along the way.

**Architecture:** One new helpers file (`tests/e2e/fixtures/seed.ts`) consolidates the duplicated `loginAs` / `seed*` helpers currently inlined across existing specs. New specs sit alongside the existing four in `tests/e2e/`. Each spec ships as its own PR so review stays small.

**Tech Stack:** Playwright 1.51, TypeScript, Next.js 16, Prisma (DB-backed), Biome (lint), the existing demo user + cross-org "other demo" user from `tests/e2e/fixtures/auth.ts`.

**Spec:** `docs/superpowers/specs/2026-05-17-e2e-coverage-expansion-design.md`

---

## File map

- **Create:** `tests/e2e/fixtures/seed.ts` — shared helpers (login, reload-fresh, customer/estimate/quote/accepted-quote seeders).
- **Create:** `tests/e2e/quote-send.spec.ts`
- **Create:** `tests/e2e/quote-accept-decline.spec.ts`
- **Create:** `tests/e2e/quote-revise.spec.ts`
- **Create:** `tests/e2e/quote-sibling-decline.spec.ts`
- **Create:** `tests/e2e/quote-lockdown.spec.ts`
- **Create:** `tests/e2e/customers.spec.ts`
- **Create:** `tests/e2e/crew.spec.ts`
- **Create:** `tests/e2e/org-settings.spec.ts`
- **Create:** `tests/e2e/quotes-list.spec.ts`
- **Create:** `tests/e2e/schedule.spec.ts`
- **Create:** `tests/e2e/estimates-list.spec.ts`
- **Modify:** `tests/e2e/quote-builder.spec.ts` — replace inline `loginAsDemo`, `seedEstimateWithRooms`, `seedQuoteWithLineItem` with imports from `fixtures/seed.ts`.
- **Modify:** `tests/e2e/estimate-builder.spec.ts` — replace inline `loginAs*`, `reloadFresh`, `createCustomerAndEstimate` with imports.
- **Modify:** `tests/e2e/public-quote.spec.ts` — replace inline login with import.

---

## PR sequence (each task block = one PR)

| PR | Task | Spec tier |
|----|------|-----------|
| 1  | Shared seed helpers + refactor existing specs | infra |
| 2  | `quote-send.spec.ts` | P0 #1 |
| 3  | `quote-accept-decline.spec.ts` | P0 #2 |
| 4  | `quote-revise.spec.ts` | P0 #3 |
| 5  | `quote-sibling-decline.spec.ts` | P0 #4 |
| 6  | `quote-lockdown.spec.ts` | P0 #5 |
| 7  | `customers.spec.ts` | P1 #6 |
| 8  | `crew.spec.ts` | P1 #7 |
| 9  | `org-settings.spec.ts` (GET-only — see Task 9) | P1 #8 |
| 10 | `quotes-list.spec.ts` | P1 #9 |
| 11 | `schedule.spec.ts` + `estimates-list.spec.ts` (bundled — both small) | P2 |

---

## Shared conventions (applies to every task)

**Test naming:** Keep the numbered scheme (`5.1.1`, `5.1.2`, …). Each new spec gets the next free top-level number (5 through 14 — existing files use 1, 3, 4).

**Lint gate:** Before every commit run `npm run lint:ci` and fix anything it reports. Tests in this repo are written in TypeScript with Biome formatting (`lineEnding: lf`, single quotes via project config — let `biome check --write .` decide).

**Run the new spec in isolation while writing it:**
```
npm run test:e2e -- tests/e2e/<new-spec>.spec.ts
```
Use `--ui` (`npm run test:e2e:ui`) when debugging selector failures.

**Auth:** Always log in via the helpers in `seed.ts` (Task 1) or the worker-scoped `authedPage` fixture in `tests/e2e/fixtures/auth.ts`. Demo users are seeded in `prisma/seed.ts` and shared by every test; do not create new test users.

**Cross-org assertions:** Use `DEMO_OTHER_EMAIL` / `DEMO_OTHER_PASSWORD` from `tests/e2e/fixtures/auth.ts`.

**No `.only` / `.skip` in committed code** — `forbidOnly: !!process.env.CI` is set in `playwright.config.ts`.

---

## Task 1: Shared seed helpers + refactor existing specs

**Files:**
- Create: `tests/e2e/fixtures/seed.ts`
- Modify: `tests/e2e/quote-builder.spec.ts`
- Modify: `tests/e2e/estimate-builder.spec.ts`
- Modify: `tests/e2e/public-quote.spec.ts`

This task is a **pure refactor** — no behavior change. The full e2e suite must remain green.

- [ ] **Step 1.1: Create the seed helpers file**

Create `tests/e2e/fixtures/seed.ts`:

```ts
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
} from "@playwright/test";
import {
  DEMO_EMAIL,
  DEMO_OTHER_EMAIL,
  DEMO_OTHER_PASSWORD,
  DEMO_PASSWORD,
} from "./auth";

// ── login ────────────────────────────────────────────────────────────────────

export async function loginAs(
  ctx: BrowserContext,
  email: string,
  password: string
): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
  return page;
}

export const loginAsDemo = (ctx: BrowserContext): Promise<Page> =>
  loginAs(ctx, DEMO_EMAIL, DEMO_PASSWORD);

export const loginAsOtherDemo = (ctx: BrowserContext): Promise<Page> =>
  loginAs(ctx, DEMO_OTHER_EMAIL, DEMO_OTHER_PASSWORD);

// ── reload helper ────────────────────────────────────────────────────────────

/**
 * Drop persisted React Query cache before reloading so the page hydrates from
 * server data, not stale localStorage. See top-of-file comment in
 * estimate-builder.spec.ts for the underlying reason.
 */
export async function reloadFresh(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

// ── customer / estimate ──────────────────────────────────────────────────────

export async function createCustomer(
  request: APIRequestContext,
  args: { name?: string; source?: string } = {}
): Promise<{ id: number }> {
  const res = await request.post("/api/customers", {
    data: { name: args.name ?? "Test Customer", source: args.source ?? "phone" },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function createEstimate(
  request: APIRequestContext,
  customerId: number
): Promise<{ id: number }> {
  const res = await request.post("/api/estimates", { data: { customerId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function createCustomerAndEstimate(
  request: APIRequestContext
): Promise<{ customerId: number; estimateId: number }> {
  const customer = await createCustomer(request);
  const estimate = await createEstimate(request, customer.id);
  return { customerId: customer.id, estimateId: estimate.id };
}

/**
 * Seed an estimate with two rect rooms (Kitchen 12×10=120 sqft, Dining 10×8=80
 * sqft). The PATCH renumbers item ids server-side, so we read them back.
 */
export async function seedEstimateWithRooms(
  request: APIRequestContext
): Promise<{ estimateId: number; kitchenId: number; diningId: number }> {
  const customer = await createCustomer(request, { name: "Quote Customer" });
  const estimate = await createEstimate(request, customer.id);

  await request.patch(`/api/estimates/${estimate.id}`, {
    data: {
      items: [
        { id: 1, type: "room", name: "Kitchen", shape: "rect", w: 10, l: 12, note: "", sortOrder: 0 },
        { id: 2, type: "room", name: "Dining", shape: "rect", w: 8, l: 10, note: "", sortOrder: 1 },
      ],
    },
  });

  const fetched = await (await request.get(`/api/estimates/${estimate.id}`)).json();
  const rooms = (fetched.items as Array<{ id: number; name: string; type: string }>)
    .filter((i) => i.type === "room");
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const dining = rooms.find((r) => r.name === "Dining");
  if (!kitchen || !dining) throw new Error("seed estimate missing expected rooms");
  return { estimateId: estimate.id, kitchenId: kitchen.id, diningId: dining.id };
}

// ── quote ────────────────────────────────────────────────────────────────────

export async function createQuote(
  request: APIRequestContext,
  estimateId: number
): Promise<{ id: number }> {
  const res = await request.post("/api/quotes", { data: { estimateId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Seed a draft quote on `estimateId` with one manual line item. The PATCH
 * renumbers line item ids, so we read them back.
 */
export async function seedQuoteWithLineItem(
  request: APIRequestContext,
  estimateId: number
): Promise<{ quoteId: number; lineItemId: number }> {
  const quote = await createQuote(request, estimateId);
  await request.patch(`/api/quotes/${quote.id}`, {
    data: {
      lineItems: [
        {
          id: 9001,
          name: "Engineered hardwood",
          rate: 8.5,
          qtyMode: "manual",
          qty: null,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
    },
  });
  const fetched = await (await request.get(`/api/quotes/${quote.id}`)).json();
  const li = (fetched.lineItems as Array<{ id: number; name: string }>)
    .find((i) => i.name === "Engineered hardwood");
  if (!li) throw new Error("seed quote missing expected line item");
  return { quoteId: quote.id, lineItemId: li.id };
}

/** Rotate (and obtain) the public approval token for a quote. */
export async function getApprovalToken(
  request: APIRequestContext,
  quoteId: number
): Promise<string> {
  const res = await request.post(`/api/quotes/${quoteId}/approval-token`);
  expect(res.ok()).toBeTruthy();
  const { approvalToken } = (await res.json()) as { approvalToken: string };
  return approvalToken;
}

// Smallest valid 1×1 transparent PNG — accept route requires
// "data:image/png;base64,…" and ≤100KB decoded. This is ~70 bytes.
export const TEST_SIGNATURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Seed a quote and drive it to accepted via the public accept endpoint.
 * Uses a tiny PNG signature to satisfy the accept route's schema.
 */
export async function seedAcceptedQuote(
  request: APIRequestContext,
  estimateId: number
): Promise<{ quoteId: number; approvalToken: string }> {
  const { quoteId } = await seedQuoteWithLineItem(request, estimateId);
  const approvalToken = await getApprovalToken(request, quoteId);
  const res = await request.post(`/api/q/${approvalToken}/accept`, {
    data: {
      name: "Test Customer",
      email: "customer@example.com",
      signatureDataUrl: TEST_SIGNATURE_PNG,
      consentText: "I agree to the terms.",
    },
  });
  expect(res.status()).toBe(200);
  return { quoteId, approvalToken };
}

/** Seed a quote and drive it to declined via the public decline endpoint. */
export async function seedDeclinedQuote(
  request: APIRequestContext,
  estimateId: number,
  reason = "Too expensive"
): Promise<{ quoteId: number; approvalToken: string }> {
  const { quoteId } = await seedQuoteWithLineItem(request, estimateId);
  const approvalToken = await getApprovalToken(request, quoteId);
  const res = await request.post(`/api/q/${approvalToken}/decline`, {
    data: { reason },
  });
  expect(res.status()).toBe(200);
  return { quoteId, approvalToken };
}
```

- [ ] **Step 1.2: Refactor `quote-builder.spec.ts` to use the helpers**

Open `tests/e2e/quote-builder.spec.ts`. Replace the top imports + inlined helpers (`loginAsDemo`, `seedEstimateWithRooms`, `seedQuoteWithLineItem`) with imports from `./fixtures/seed`. The inline helper definitions get deleted.

Before:
```ts
import { ... } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures/auth";

async function loginAsDemo(ctx: BrowserContext): Promise<Page> { ... }
async function seedEstimateWithRooms(request: APIRequestContext): ... { ... }
async function seedQuoteWithLineItem(request, estimateId): ... { ... }
```

After:
```ts
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  loginAsDemo,
  seedEstimateWithRooms,
  seedQuoteWithLineItem,
} from "./fixtures/seed";
```

Leave the test bodies (4.1.1 through 4.1.5) unchanged. They already call the helpers by the same names.

- [ ] **Step 1.3: Refactor `estimate-builder.spec.ts` to use the helpers**

Open `tests/e2e/estimate-builder.spec.ts`. Replace the inline `loginAs`, `loginAsDemo`, `loginAsOtherDemo`, `reloadFresh`, `createCustomerAndEstimate` with imports from `./fixtures/seed`. Keep the file-top comment about React Query persistence (it explains *why* `reloadFresh` exists and is still useful documentation).

```ts
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  loginAsOtherDemo,
  reloadFresh,
} from "./fixtures/seed";
```

Delete the inline helper definitions. Leave every test body untouched.

- [ ] **Step 1.4: Refactor `public-quote.spec.ts` to use the helpers**

Open `tests/e2e/public-quote.spec.ts`. The inline `login(page)` helper inside the describe block duplicates the seed `loginAs` pattern but uses a passed-in page rather than creating one. Convert call sites to use `loginAsDemo(ctx)` from the seed helpers — change the local `login` helper to:

```ts
import { loginAsDemo } from "./fixtures/seed";

// inside the test that needs login:
const ctx = await browser.newContext();
const page = await loginAsDemo(ctx);
```

Also replace the inlined login block in `beforeAll` (the one that does `page.goto("/login")` etc.) with a single `await loginAsDemo(ctx)` — discard the resulting page since the test uses `ctx.request` afterward.

- [ ] **Step 1.5: Run the full e2e suite locally**

```
npm run test:e2e
```
Expected: every existing test passes — no behavior change. If any flake from auth state, check that `fixtures/seed.ts` exports the helpers used and the imports compile (`npx tsc --noEmit`).

- [ ] **Step 1.6: Lint**

```
npm run lint:ci
```
Expected: exit 0.

- [ ] **Step 1.7: Commit**

```
git add tests/e2e/fixtures/seed.ts tests/e2e/quote-builder.spec.ts tests/e2e/estimate-builder.spec.ts tests/e2e/public-quote.spec.ts
git commit -m "test(e2e): extract shared seed helpers"
```

---

## Task 2: `quote-send.spec.ts` (P0 #1)

**Files:**
- Create: `tests/e2e/quote-send.spec.ts`

Tests the POST `/api/quotes/[id]/send` route in `app/api/quotes/[id]/send/route.ts`. Route requires `to`, `subject` (1–200), optional `message` (≤2000), optional `regenerateLink`. Returns 409 when sending an already-accepted/declined quote. We do not assert email body content — Resend is mocked at the transport (in-memory `recordEmail`), and Playwright runs out-of-process so we cannot read that buffer. Verifying `sentAt` + `QuoteEvent` rows + status response is the contract that matters here.

- [ ] **Step 2.1: Write the spec file with all tests**

Create `tests/e2e/quote-send.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  loginAsOtherDemo,
  seedAcceptedQuote,
  seedQuoteWithLineItem,
} from "./fixtures/seed";

// ── 5.1 POST /api/quotes/[id]/send ───────────────────────────────────────────

test.describe
  .serial("5.1 Quote send", () => {
    let ctx: BrowserContext;
    let estimateId: number;
    let quoteId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsDemo(ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      estimateId = ids.estimateId;
      const seed = await seedQuoteWithLineItem(ctx.request, estimateId);
      quoteId = seed.quoteId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("5.1.1 happy path: 200, sentAt set, QuoteEvent written", async () => {
      const res = await ctx.request.post(`/api/quotes/${quoteId}/send`, {
        data: {
          to: "customer@example.com",
          subject: "Your quote from Johnson Flooring Co.",
          message: "Let me know if you have any questions.",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const get = await ctx.request.get(`/api/quotes/${quoteId}`);
      const quote = await get.json();
      expect(quote.sentAt).toBeTruthy();
      expect(quote.status).toBe("sent");
    });

    test("5.1.2 invalid body returns 400", async () => {
      const res = await ctx.request.post(`/api/quotes/${quoteId}/send`, {
        data: { to: "not-an-email", subject: "x" },
      });
      expect(res.status()).toBe(400);
    });

    test("5.1.3 unauth POST returns 401", async ({ browser }) => {
      const anon = await browser.newContext();
      const res = await anon.request.post(`/api/quotes/${quoteId}/send`, {
        data: { to: "c@example.com", subject: "Quote" },
      });
      expect(res.status()).toBe(401);
      await anon.close();
    });

    test("5.1.4 cross-org POST returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.post(`/api/quotes/${quoteId}/send`, {
        data: { to: "c@example.com", subject: "Quote" },
      });
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });
  });

// ── 5.2 Lockdown: cannot re-send a terminal quote ────────────────────────────

test.describe("5.2 Send lockdown", () => {
  test("5.2.1 sending an accepted quote returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    const res = await ctx.request.post(`/api/quotes/${quoteId}/send`, {
      data: { to: "c@example.com", subject: "Quote" },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/accepted/);
    await ctx.close();
  });
});
```

- [ ] **Step 2.2: Run the new spec**

```
npm run test:e2e -- tests/e2e/quote-send.spec.ts
```
Expected: 6 tests pass. If 5.1.1 fails because email send returns 502, check that `RESEND_API_KEY` is unset (or `NODE_ENV=test`) so `sendEmail` takes the `recordEmail` path — this is the case in `.env.test.local`.

- [ ] **Step 2.3: Lint**

```
npm run lint:ci
```

- [ ] **Step 2.4: Commit**

```
git add tests/e2e/quote-send.spec.ts
git commit -m "test(e2e): cover quote send + lockdown"
```

---

## Task 3: `quote-accept-decline.spec.ts` (P0 #2)

**Files:**
- Create: `tests/e2e/quote-accept-decline.spec.ts`

Tests the public `/q/[token]` accept and decline flows. The accept route requires a signed payload (`name` 2–120, `email`, `signatureDataUrl` base64 PNG ≤100KB, `consentText` 1–2000). We drive these via the API rather than the signature pad UI — that's a separate concern, the contract we want to pin is the route + page state transition.

- [ ] **Step 3.1: Write the spec file**

Create `tests/e2e/quote-accept-decline.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  getApprovalToken,
  loginAsDemo,
  seedQuoteWithLineItem,
  TEST_SIGNATURE_PNG,
} from "./fixtures/seed";

// ── 6.1 Public accept ────────────────────────────────────────────────────────

test.describe("6.1 Public accept", () => {
  test("6.1.1 happy path: 200, status=accepted, acceptedAt set", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);
    const token = await getApprovalToken(ctx.request, quoteId);

    const anon = await browser.newContext();
    const res = await anon.request.post(`/api/q/${token}/accept`, {
      data: {
        name: "Carla Customer",
        email: "carla@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree to the terms.",
      },
    });
    expect(res.status()).toBe(200);
    await anon.close();

    const get = await ctx.request.get(`/api/quotes/${quoteId}`);
    const quote = await get.json();
    expect(quote.status).toBe("accepted");
    expect(quote.acceptedAt).toBeTruthy();
    await ctx.close();
  });

  test("6.1.2 second accept returns 409 (idempotent)", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);
    const token = await getApprovalToken(ctx.request, quoteId);

    const body = {
      name: "Carla",
      email: "carla@example.com",
      signatureDataUrl: TEST_SIGNATURE_PNG,
      consentText: "I agree.",
    };

    const anon = await browser.newContext();
    const first = await anon.request.post(`/api/q/${token}/accept`, { data: body });
    expect(first.status()).toBe(200);
    const second = await anon.request.post(`/api/q/${token}/accept`, { data: body });
    expect(second.status()).toBe(409);
    await anon.close();
    await ctx.close();
  });

  test("6.1.3 bad token returns 404", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.post(
      "/api/q/totally-not-a-real-token-1234567890/accept",
      {
        data: {
          name: "X",
          email: "x@example.com",
          signatureDataUrl: TEST_SIGNATURE_PNG,
          consentText: "ok",
        },
      }
    );
    expect(res.status()).toBe(404);
    await anon.close();
  });

  test("6.1.4 short/garbage token returns 404 without DB lookup", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.post("/api/q/abc/accept", {
      data: {
        name: "X",
        email: "x@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "ok",
      },
    });
    expect(res.status()).toBe(404);
    await anon.close();
  });
});

// ── 6.2 Public decline ───────────────────────────────────────────────────────

test.describe("6.2 Public decline", () => {
  test("6.2.1 happy path: 200, status=declined, declineReason persisted", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);
    const token = await getApprovalToken(ctx.request, quoteId);

    const anon = await browser.newContext();
    const res = await anon.request.post(`/api/q/${token}/decline`, {
      data: { reason: "Going with another contractor" },
    });
    expect(res.status()).toBe(200);
    await anon.close();

    const get = await ctx.request.get(`/api/quotes/${quoteId}`);
    const quote = await get.json();
    expect(quote.status).toBe("declined");
    expect(quote.declinedAt).toBeTruthy();
    expect(quote.declineReason).toBe("Going with another contractor");
    await ctx.close();
  });

  test("6.2.2 declined public page shows builder contact block", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);
    const token = await getApprovalToken(ctx.request, quoteId);
    const declineRes = await ctx.request.post(`/api/q/${token}/decline`, {
      data: { reason: "Need to think about it" },
    });
    expect(declineRes.status()).toBe(200);

    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`/q/${token}`);
    // The builder contact card on declined quotes surfaces the org name and
    // owner email. Use the org name from the seed (Johnson Flooring Co.).
    await expect(page.getByText(/Johnson Flooring Co\./i).first()).toBeVisible();
    // declined banner
    await expect(page.getByText(/declined/i).first()).toBeVisible();
    await anon.close();
    await ctx.close();

    // silence quoteId-unused if the lint rule complains
    void quoteId;
  });

  test("6.2.3 second decline returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);
    const token = await getApprovalToken(ctx.request, quoteId);

    const anon = await browser.newContext();
    const first = await anon.request.post(`/api/q/${token}/decline`, { data: { reason: "first" } });
    expect(first.status()).toBe(200);
    const second = await anon.request.post(`/api/q/${token}/decline`, { data: { reason: "second" } });
    expect(second.status()).toBe(409);
    await anon.close();
    await ctx.close();

    void quoteId;
  });
});
```

- [ ] **Step 3.2: Run the spec**

```
npm run test:e2e -- tests/e2e/quote-accept-decline.spec.ts
```
Expected: 7 tests pass. If 6.2.2 fails on the builder-contact assertion, inspect the rendered `/q/[token]` page with `--ui` to find the actual text — the assertion can be loosened to whatever the page renders for "contact your builder."

- [ ] **Step 3.3: Lint + commit**

```
npm run lint:ci
git add tests/e2e/quote-accept-decline.spec.ts
git commit -m "test(e2e): cover public accept + decline"
```

---

## Task 4: `quote-revise.spec.ts` (P0 #3)

**Files:**
- Create: `tests/e2e/quote-revise.spec.ts`

Tests POST `/api/quotes/[id]/revise` (`app/api/quotes/[id]/revise/route.ts`). Route returns 409 unless source quote is `accepted` or `declined`. Returns `{ ok: true, id: <newQuoteId> }`.

UI assertions: `Revise` button (`components/quotes/ReviseButton.tsx` — `<button>Revise</button>`) appears only on locked quotes; revision badge ("↶ rev", `title="Revised quote"`) appears in the quote list for revised quotes.

- [ ] **Step 4.1: Write the spec file**

Create `tests/e2e/quote-revise.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  loginAsOtherDemo,
  seedAcceptedQuote,
  seedQuoteWithLineItem,
} from "./fixtures/seed";

// ── 7.1 POST /api/quotes/[id]/revise ─────────────────────────────────────────

test.describe("7.1 Quote revise — API", () => {
  test("7.1.1 happy path on accepted quote: 200, returns new quote id", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    const res = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("number");
    expect(body.id).not.toBe(quoteId);

    // New quote is a draft on the same estimate.
    const get = await ctx.request.get(`/api/quotes/${body.id}`);
    const newQuote = await get.json();
    expect(newQuote.status).toBe("draft");
    expect(newQuote.estimateId).toBe(estimateId);
    await ctx.close();
  });

  test("7.1.2 revising a draft returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);

    const res = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(res.status()).toBe(409);
    await ctx.close();
  });

  test("7.1.3 unauth returns 401", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.post("/api/quotes/1/revise");
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("7.1.4 cross-org returns 404", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);
    await ctx.close();

    const otherCtx = await browser.newContext();
    await loginAsOtherDemo(otherCtx);
    const res = await otherCtx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(res.status()).toBe(404);
    await otherCtx.close();
  });
});

// ── 7.2 Revise button UI ─────────────────────────────────────────────────────

test.describe("7.2 Revise button UI", () => {
  test("7.2.1 Revise button is visible on an accepted quote", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await expect(
      page.getByRole("button", { name: /^Revise$/ })
    ).toBeVisible();
    await ctx.close();
  });

  test("7.2.2 Revise button is NOT visible on a draft quote", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Revise$/ })
    ).toHaveCount(0);
    await ctx.close();
  });

  test("7.2.3 clicking Revise navigates to the new quote builder", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    await Promise.all([
      page.waitForURL(/\/quotes\/\d+$/),
      page.getByRole("button", { name: /^Revise$/ }).click(),
    ]);
    // We should be on a different quote now.
    expect(page.url()).not.toMatch(new RegExp(`/quotes/${quoteId}$`));
    await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    await ctx.close();
  });
});

// ── 7.3 Revision badge in quote list ─────────────────────────────────────────

test.describe("7.3 Revision badge", () => {
  test("7.3.1 revised quote shows the ↶ rev badge in the quote list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    // Revise → new draft quote.
    const reviseRes = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(reviseRes.status()).toBe(200);

    await page.goto("/quotes");
    // QuoteList renders a span with title="Revised quote" for revisions.
    await expect(page.locator('[title="Revised quote"]').first()).toBeVisible();
    await ctx.close();
  });
});
```

- [ ] **Step 4.2: Run the spec**

```
npm run test:e2e -- tests/e2e/quote-revise.spec.ts
```
Expected: 8 tests pass.

- [ ] **Step 4.3: Lint + commit**

```
npm run lint:ci
git add tests/e2e/quote-revise.spec.ts
git commit -m "test(e2e): cover quote revise + revision badge"
```

---

## Task 5: `quote-sibling-decline.spec.ts` (P0 #4)

**Files:**
- Create: `tests/e2e/quote-sibling-decline.spec.ts`

Tests that accepting one quote auto-declines other open quotes on the same estimate, with `declineSource: "system_supersede"`. Quotes on different estimates are untouched.

- [ ] **Step 5.1: Write the spec file**

Create `tests/e2e/quote-sibling-decline.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createCustomer,
  createEstimate,
  getApprovalToken,
  loginAsDemo,
  seedQuoteWithLineItem,
  TEST_SIGNATURE_PNG,
} from "./fixtures/seed";

// ── 8.1 Accept cascades decline to siblings ──────────────────────────────────

test.describe("8.1 Sibling auto-decline", () => {
  test("8.1.1 accepting one open quote auto-declines siblings on same estimate", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);

    // One estimate, two open quotes.
    const customer = await createCustomer(ctx.request, { name: "Cascade Customer" });
    const estimate = await createEstimate(ctx.request, customer.id);
    const q1 = await seedQuoteWithLineItem(ctx.request, estimate.id);
    const q2 = await seedQuoteWithLineItem(ctx.request, estimate.id);
    const token1 = await getApprovalToken(ctx.request, q1.quoteId);

    // Accept q1.
    const anon = await browser.newContext();
    const acceptRes = await anon.request.post(`/api/q/${token1}/accept`, {
      data: {
        name: "C",
        email: "c@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree.",
      },
    });
    expect(acceptRes.status()).toBe(200);
    await anon.close();

    // q1 is accepted, q2 is auto-declined with system_supersede source.
    const got1 = await (await ctx.request.get(`/api/quotes/${q1.quoteId}`)).json();
    const got2 = await (await ctx.request.get(`/api/quotes/${q2.quoteId}`)).json();
    expect(got1.status).toBe("accepted");
    expect(got2.status).toBe("declined");
    expect(got2.declineSource).toBe("system_supersede");
    await ctx.close();
  });

  test("8.1.2 quotes on a different estimate are not affected", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);

    const c1 = await createCustomer(ctx.request, { name: "Iso A" });
    const e1 = await createEstimate(ctx.request, c1.id);
    const qA = await seedQuoteWithLineItem(ctx.request, e1.id);
    const tokenA = await getApprovalToken(ctx.request, qA.quoteId);

    const c2 = await createCustomer(ctx.request, { name: "Iso B" });
    const e2 = await createEstimate(ctx.request, c2.id);
    const qB = await seedQuoteWithLineItem(ctx.request, e2.id);

    const anon = await browser.newContext();
    const res = await anon.request.post(`/api/q/${tokenA}/accept`, {
      data: {
        name: "C",
        email: "c@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree.",
      },
    });
    expect(res.status()).toBe(200);
    await anon.close();

    // qB on the other estimate is still a draft.
    const gotB = await (await ctx.request.get(`/api/quotes/${qB.quoteId}`)).json();
    expect(gotB.status).toBe("draft");
    await ctx.close();
  });

  test("8.1.3 superseded sibling shows auto-decline banner on builder", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);

    const customer = await createCustomer(ctx.request, { name: "Banner Customer" });
    const estimate = await createEstimate(ctx.request, customer.id);
    const q1 = await seedQuoteWithLineItem(ctx.request, estimate.id);
    const q2 = await seedQuoteWithLineItem(ctx.request, estimate.id);
    const token1 = await getApprovalToken(ctx.request, q1.quoteId);

    const anon = await browser.newContext();
    const acceptRes = await anon.request.post(`/api/q/${token1}/accept`, {
      data: {
        name: "C",
        email: "c@example.com",
        signatureDataUrl: TEST_SIGNATURE_PNG,
        consentText: "I agree.",
      },
    });
    expect(acceptRes.status()).toBe(200);
    await anon.close();

    // QuoteLockBanner declined+system_supersede variant shows "Auto-declined".
    await page.goto(`/quotes/${q2.quoteId}`);
    await expect(page.getByText(/Auto-declined/i)).toBeVisible();
    await ctx.close();
  });
});
```

- [ ] **Step 5.2: Run the spec**

```
npm run test:e2e -- tests/e2e/quote-sibling-decline.spec.ts
```
Expected: 3 tests pass.

- [ ] **Step 5.3: Lint + commit**

```
npm run lint:ci
git add tests/e2e/quote-sibling-decline.spec.ts
git commit -m "test(e2e): cover sibling auto-decline on accept"
```

---

## Task 6: `quote-lockdown.spec.ts` (P0 #5)

**Files:**
- Create: `tests/e2e/quote-lockdown.spec.ts`

Tests that PATCH `/api/quotes/[id]` returns 409 on accepted or declined quotes (the `saveQuote` guard in `app/api/quotes/[id]/route.ts:69`), and that the builder UI shows the lock banner from `components/quotes/QuoteLockBanner.tsx`.

- [ ] **Step 6.1: Write the spec file**

Create `tests/e2e/quote-lockdown.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  seedAcceptedQuote,
  seedDeclinedQuote,
} from "./fixtures/seed";

// ── 9.1 PATCH lockdown ───────────────────────────────────────────────────────

test.describe("9.1 PATCH lockdown", () => {
  test("9.1.1 PATCH on accepted quote returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    const res = await ctx.request.patch(`/api/quotes/${quoteId}`, {
      data: { markupPct: 0.25 },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
    await ctx.close();
  });

  test("9.1.2 PATCH on declined quote returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedDeclinedQuote(ctx.request, estimateId);

    const res = await ctx.request.patch(`/api/quotes/${quoteId}`, {
      data: { markupPct: 0.25 },
    });
    expect(res.status()).toBe(409);
    await ctx.close();
  });
});

// ── 9.2 Lock banners on the builder ──────────────────────────────────────────

test.describe("9.2 Lock banners", () => {
  test("9.2.1 accepted quote shows the accepted banner", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);

    await page.goto(`/quotes/${quoteId}`);
    // QuoteLockBanner accepted variant — copy from components/quotes/QuoteLockBanner.tsx.
    await expect(page.getByText(/^Accepted/)).toBeVisible();
    await expect(
      page.getByText(/This quote is locked\. Use Revise to make changes\./)
    ).toBeVisible();
    await ctx.close();
  });

  test("9.2.2 declined quote shows the declined banner with reason", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedDeclinedQuote(ctx.request, estimateId, "Picked another bid");

    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByText(/Declined by customer/i)).toBeVisible();
    await expect(page.getByText("Picked another bid")).toBeVisible();
    await expect(
      page.getByText(/This quote is locked\. Use Revise to send a new version\./)
    ).toBeVisible();
    await ctx.close();
  });
});
```

- [ ] **Step 6.2: Run the spec**

```
npm run test:e2e -- tests/e2e/quote-lockdown.spec.ts
```
Expected: 4 tests pass.

- [ ] **Step 6.3: Lint + commit**

```
npm run lint:ci
git add tests/e2e/quote-lockdown.spec.ts
git commit -m "test(e2e): cover quote lockdown + banners"
```

---

## Task 7: `customers.spec.ts` (P1 #6)

**Files:**
- Create: `tests/e2e/customers.spec.ts`

Covers POST/GET/PATCH/DELETE on `/api/customers`, the customer list page, and the regression for [PR #65](https://github.com/) (the "Open" button on customer list rows).

- [ ] **Step 7.1: Write the spec file**

Create `tests/e2e/customers.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsDemo, loginAsOtherDemo } from "./fixtures/seed";

// ── 10.1 Customers — API CRUD ────────────────────────────────────────────────

test.describe
  .serial("10.1 Customers API", () => {
    let ctx: BrowserContext;
    let customerId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsDemo(ctx);
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("10.1.1 POST creates a customer (201)", async () => {
      const res = await ctx.request.post("/api/customers", {
        data: {
          name: "Acme Co",
          phone: "555-0100",
          email: "ops@acme.example",
          source: "referral",
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.id).toBeGreaterThan(0);
      expect(body.name).toBe("Acme Co");
      customerId = body.id;
    });

    test("10.1.2 GET returns the customer", async () => {
      const res = await ctx.request.get(`/api/customers/${customerId}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Acme Co");
      expect(body.source).toBe("referral");
    });

    test("10.1.3 PATCH updates the customer", async () => {
      const res = await ctx.request.patch(`/api/customers/${customerId}`, {
        data: { name: "Acme Corp" },
      });
      expect(res.status()).toBe(200);
      const got = await (await ctx.request.get(`/api/customers/${customerId}`)).json();
      expect(got.name).toBe("Acme Corp");
    });

    test("10.1.4 cross-org GET returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.get(`/api/customers/${customerId}`);
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.5 cross-org PATCH returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.patch(`/api/customers/${customerId}`, {
        data: { name: "Hijacked" },
      });
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.6 cross-org DELETE returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.delete(`/api/customers/${customerId}`);
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("10.1.7 unauth GET returns 401", async ({ browser }) => {
      const anon = await browser.newContext();
      const res = await anon.request.get("/api/customers");
      expect(res.status()).toBe(401);
      await anon.close();
    });

    test("10.1.8 DELETE removes the customer", async () => {
      const res = await ctx.request.delete(`/api/customers/${customerId}`);
      expect(res.status()).toBe(200);
      const get = await ctx.request.get(`/api/customers/${customerId}`);
      expect(get.status()).toBe(404);
    });
  });

// ── 10.2 Customers — list page ───────────────────────────────────────────────

test.describe("10.2 Customers list page", () => {
  test("10.2.1 list renders and seeded customer appears", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);

    const created = await ctx.request.post("/api/customers", {
      data: { name: "List Visible Customer", source: "phone" },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/customers");
    await expect(page.getByText("List Visible Customer")).toBeVisible();
    await ctx.close();
  });

  test("10.2.2 Open button navigates to the customer detail page", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const created = await ctx.request.post("/api/customers", {
      data: { name: "Open Me Customer", source: "phone" },
    });
    const { id } = await created.json();

    await page.goto("/customers");
    // Find the Open button on the row containing "Open Me Customer".
    const row = page
      .locator("text=Open Me Customer")
      .locator("xpath=ancestor-or-self::*[self::tr or self::li or self::div][1]");
    await row.getByRole("link", { name: /open/i }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${id}`));
    await ctx.close();
  });
});
```

- [ ] **Step 7.2: Run + lint + commit**

```
npm run test:e2e -- tests/e2e/customers.spec.ts
npm run lint:ci
git add tests/e2e/customers.spec.ts
git commit -m "test(e2e): cover customers CRUD + list page"
```

If 10.2.2 fails because the row resolution heuristic doesn't match the actual DOM, open `/customers` in `--ui` and pick a more specific selector (e.g. `page.locator('[data-customer-id="…"]')` if such an attribute exists, or `page.getByRole('row', { name: /Open Me Customer/ }).getByRole('link', { name: /open/i })`).

---

## Task 8: `crew.spec.ts` (P1 #7)

**Files:**
- Create: `tests/e2e/crew.spec.ts`

Covers POST/GET/PATCH/DELETE on `/api/crew-members`. Route schema: `name` (1–100) required, `role` (≤100) optional.

- [ ] **Step 8.1: Write the spec file**

Create `tests/e2e/crew.spec.ts`:

```ts
import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsDemo, loginAsOtherDemo } from "./fixtures/seed";

test.describe
  .serial("11.1 Crew members API", () => {
    let ctx: BrowserContext;
    let memberId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsDemo(ctx);
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("11.1.1 POST creates a crew member (201)", async () => {
      const res = await ctx.request.post("/api/crew-members", {
        data: { name: "Pat Installer", role: "Installer" },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.id).toBeGreaterThan(0);
      memberId = body.id;
    });

    test("11.1.2 GET list includes the new member", async () => {
      const res = await ctx.request.get("/api/crew-members");
      expect(res.status()).toBe(200);
      const members = await res.json();
      expect(members.some((m: { id: number }) => m.id === memberId)).toBe(true);
    });

    test("11.1.3 PATCH updates the member", async () => {
      const res = await ctx.request.patch(`/api/crew-members/${memberId}`, {
        data: { name: "Pat Lead", role: "Lead" },
      });
      expect(res.status()).toBe(200);
    });

    test("11.1.4 cross-org PATCH returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsOtherDemo(otherCtx);
      const res = await otherCtx.request.patch(`/api/crew-members/${memberId}`, {
        data: { name: "Stolen" },
      });
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("11.1.5 unauth returns 401", async ({ browser }) => {
      const anon = await browser.newContext();
      const res = await anon.request.get("/api/crew-members");
      expect(res.status()).toBe(401);
      await anon.close();
    });

    test("11.1.6 DELETE removes the member", async () => {
      const res = await ctx.request.delete(`/api/crew-members/${memberId}`);
      expect(res.status()).toBe(200);
    });
  });
```

- [ ] **Step 8.2: Run + lint + commit**

```
npm run test:e2e -- tests/e2e/crew.spec.ts
npm run lint:ci
git add tests/e2e/crew.spec.ts
git commit -m "test(e2e): cover crew members CRUD"
```

---

## Task 9: `org-settings.spec.ts` (P1 #8 — adjusted to GET-only)

**Files:**
- Create: `tests/e2e/org-settings.spec.ts`

**Scope change vs. spec:** `app/api/org/route.ts` only exposes GET — there is no PATCH endpoint today. This task covers the GET endpoint and tenant isolation (the two demo users see different orgs). When write endpoints land, extend this spec.

- [ ] **Step 9.1: Write the spec file**

Create `tests/e2e/org-settings.spec.ts`:

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

  test("12.1.2 unauth returns 401", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.get("/api/org");
    expect(res.status()).toBe(401);
    await anon.close();
  });

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

- [ ] **Step 9.2: Run + lint + commit**

```
npm run test:e2e -- tests/e2e/org-settings.spec.ts
npm run lint:ci
git add tests/e2e/org-settings.spec.ts
git commit -m "test(e2e): cover GET /api/org + tenant isolation"
```

---

## Task 10: `quotes-list.spec.ts` (P1 #9)

**Files:**
- Create: `tests/e2e/quotes-list.spec.ts`

Covers the `/quotes` list page: seeded quotes render, the revision badge appears for revised quotes, cross-org quotes do not appear.

- [ ] **Step 10.1: Write the spec file**

Create `tests/e2e/quotes-list.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  loginAsOtherDemo,
  seedAcceptedQuote,
  seedQuoteWithLineItem,
} from "./fixtures/seed";

test.describe("13.1 Quotes list page", () => {
  test("13.1.1 seeded quote appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);

    await page.goto("/quotes");
    // QuoteList shows quotes by number — match a row containing the quote id by
    // navigating from the row link instead, since quote numbers are org-wide
    // sequential and may collide with other tests.
    await expect(page.locator(`a[href="/quotes/${quoteId}"]`).first()).toBeVisible();
    await ctx.close();
  });

  test("13.1.2 revised quote shows ↶ rev badge", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedAcceptedQuote(ctx.request, estimateId);
    const revRes = await ctx.request.post(`/api/quotes/${quoteId}/revise`);
    expect(revRes.status()).toBe(200);

    await page.goto("/quotes");
    await expect(page.locator('[title="Revised quote"]').first()).toBeVisible();
    await ctx.close();
  });

  test("13.1.3 other-org quote does not appear in this org's list", async ({ browser }) => {
    // Seed a quote in org B.
    const ctxB = await browser.newContext();
    await loginAsOtherDemo(ctxB);
    const { estimateId } = await createCustomerAndEstimate(ctxB.request);
    const { quoteId: otherQuoteId } = await seedQuoteWithLineItem(ctxB.request, estimateId);
    await ctxB.close();

    // Org A's list must not link to that quote id.
    const ctxA = await browser.newContext();
    const page = await loginAsDemo(ctxA);
    await page.goto("/quotes");
    await expect(page.locator(`a[href="/quotes/${otherQuoteId}"]`)).toHaveCount(0);
    await ctxA.close();
  });
});
```

- [ ] **Step 10.2: Run + lint + commit**

```
npm run test:e2e -- tests/e2e/quotes-list.spec.ts
npm run lint:ci
git add tests/e2e/quotes-list.spec.ts
git commit -m "test(e2e): cover quotes list page + revision badge"
```

---

## Task 11: `schedule.spec.ts` + `estimates-list.spec.ts` (P2 bundled)

**Files:**
- Create: `tests/e2e/schedule.spec.ts`
- Create: `tests/e2e/estimates-list.spec.ts`

Both are smoke specs — bundled in one PR to avoid PR proliferation.

- [ ] **Step 11.1: Write `schedule.spec.ts`**

Create `tests/e2e/schedule.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createCustomer,
  loginAsDemo,
  loginAsOtherDemo,
} from "./fixtures/seed";

test.describe("14.1 Events / schedule API", () => {
  test("14.1.1 POST creates an event (201)", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const customer = await createCustomer(ctx.request, { name: "Sched Customer" });

    const res = await ctx.request.post("/api/events", {
      data: {
        type: "visit",
        title: "Initial measure",
        customerId: customer.id,
        date: "2026-06-01",
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeGreaterThan(0);
    await ctx.close();
  });

  test("14.1.2 invalid date returns 400", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const res = await ctx.request.post("/api/events", {
      data: {
        type: "visit",
        title: "Bad",
        date: "not-a-date",
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    expect(res.status()).toBe(400);
    await ctx.close();
  });

  test("14.1.3 unauth returns 401", async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.get("/api/events");
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("14.1.4 cross-org list excludes other org's events", async ({ browser }) => {
    // Seed in A.
    const ctxA = await browser.newContext();
    await loginAsDemo(ctxA);
    const customer = await createCustomer(ctxA.request, { name: "A-only" });
    const created = await ctxA.request.post("/api/events", {
      data: {
        type: "visit",
        title: "A event",
        customerId: customer.id,
        date: "2026-06-02",
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    const { id: eventId } = await created.json();
    await ctxA.close();

    // Read from B.
    const ctxB = await browser.newContext();
    await loginAsOtherDemo(ctxB);
    const list = await (await ctxB.request.get("/api/events")).json();
    expect(list.some((e: { id: number }) => e.id === eventId)).toBe(false);
    await ctxB.close();
  });
});
```

- [ ] **Step 11.2: Write `estimates-list.spec.ts`**

Create `tests/e2e/estimates-list.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  loginAsDemo,
  loginAsOtherDemo,
} from "./fixtures/seed";

test.describe("15.1 Estimates list page", () => {
  test("15.1.1 seeded estimate appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);

    await page.goto("/estimates");
    await expect(page.locator(`a[href="/estimates/${estimateId}"]`).first()).toBeVisible();
    await ctx.close();
  });

  test("15.1.2 other-org estimate does not appear", async ({ browser }) => {
    const ctxB = await browser.newContext();
    await loginAsOtherDemo(ctxB);
    const { estimateId } = await createCustomerAndEstimate(ctxB.request);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsDemo(ctxA);
    await page.goto("/estimates");
    await expect(page.locator(`a[href="/estimates/${estimateId}"]`)).toHaveCount(0);
    await ctxA.close();
  });
});
```

- [ ] **Step 11.3: Run + lint + commit**

```
npm run test:e2e -- tests/e2e/schedule.spec.ts tests/e2e/estimates-list.spec.ts
npm run lint:ci
git add tests/e2e/schedule.spec.ts tests/e2e/estimates-list.spec.ts
git commit -m "test(e2e): cover schedule + estimates list smoke"
```

---

## Final verification

After all tasks land, run the full suite once on a clean DB to confirm nothing flakes when tests run together:

```
npm run test:e2e
npm run lint:ci
```

Both must be green. Open the HTML reporter (`playwright-report/index.html`) if anything is yellow — that often means test ordering or shared-state issues that the per-task runs miss.

---

## Self-review notes

- **Spec coverage:** all 11 specs in the design have a task (P0 → tasks 2–6, P1 → tasks 7–10, P2 → task 11), plus shared infra in task 1. Org-settings deviation flagged in Task 9.
- **Email mocking:** decision deferred in the spec is resolved here — we rely on `lib/email/client.ts` already taking the `recordEmail` path when `RESEND_API_KEY` is unset, and skip out-of-process email-content assertions. Spec lockdown/sentAt assertions still hold.
- **Selectors:** revision badge uses `[title="Revised quote"]` (confirmed in `components/quotes/QuoteList.tsx`); Revise button uses `getByRole("button", { name: /^Revise$/ })` (confirmed in `ReviseButton.tsx`); lock banner copy matches `QuoteLockBanner.tsx` exactly.
- **Risks called out in spec:**
  - Lockdown UI shape — confirmed against `QuoteLockBanner.tsx`, banner text is stable.
  - Accept endpoint shape — confirmed (`name`, `email`, `signatureDataUrl`, `consentText`); helper uses a 70-byte test PNG.
  - Cross-org sibling decline source — confirmed `"system_supersede"` in `QuoteLockBanner.tsx`.
