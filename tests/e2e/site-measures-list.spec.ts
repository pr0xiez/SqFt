import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  clearStorageOnNextLoad,
  createCustomer,
  createCustomerAndEstimate,
  createEstimate,
  createSiteMeasure,
  reloadFresh,
} from "./fixtures/seed";

/**
 * True only for the list endpoint with a query string
 * (`/api/site-measures?…`), never the detail call
 * (`/api/site-measures/{id}`).
 */
function isListRequest(url: string): boolean {
  return url.includes("/api/site-measures?");
}

/**
 * Add a single rect room to a site measure so it falls in the "measured"
 * bucket (rooms, no estimate). The PATCH renumbers item ids server-side, but
 * we don't need the ids back here.
 */
async function addRoom(
  request: APIRequestContext,
  siteMeasureId: number
): Promise<void> {
  const res = await request.patch(`/api/site-measures/${siteMeasureId}`, {
    data: {
      items: [
        {
          id: 1,
          type: "room",
          name: "Kitchen",
          shape: "rect",
          w: 10,
          l: 12,
          note: "",
          sortOrder: 0,
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
}

/**
 * Seed a site measure in the "estimated" bucket for `customerName`: it has at
 * least one room AND an estimate. Returns the new site measure id.
 */
async function seedEstimatedSiteMeasure(
  request: APIRequestContext,
  customerName: string
): Promise<number> {
  const customer = await createCustomer(request, { name: customerName });
  const sm = await createSiteMeasure(request, customer.id);
  await addRoom(request, sm.id);
  await createEstimate(request, sm.id);
  return sm.id;
}

test.describe("15.1 SiteMeasures list page", () => {
  test("15.1.1 seeded siteMeasure appears in the list", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);

    // SiteMeasureList renders <button onClick={router.push}> not <a href> links.
    // Row buttons show customer name; the siteMeasure # is in a hidden-md:block
    // span. Wait for loading to finish then match the row button by its #{id}.
    //
    // Two robustness steps before the visibility check:
    //   1. Poll /api/site-measures until the just-created row is observable. The
    //      preview deploy sometimes races: POST commits, but the next GET on a
    //      different pooled connection still returns the prior snapshot.
    //   2. Clear localStorage so the persisted React Query cache (Dashboard at
    //      "/" hydrated useSiteMeasures with a 60s staleTime) doesn't replay a
    //      stale list on /site-measures.
    await expect
      .poll(
        async () => {
          const res = await ctx.request.get("/api/site-measures");
          // The list endpoint now returns a paginated envelope
          // ({ items, total, facets }) rather than a bare array.
          const body = (await res.json()) as { items: Array<{ id: number }> };
          return body.items.some((e) => e.id === siteMeasureId);
        },
        { timeout: 10000 }
      )
      .toBe(true);
    await page.evaluate(() => localStorage.clear());
    await page.goto("/site-measures");
    // Wait for loading indicator to disappear.
    await expect(page.getByText("Loading…")).toHaveCount(0);
    // When this spec runs after others on the shared worker org, the page can
    // hydrate from a stale React Query cache (the Dashboard primed
    // useSiteMeasures during login) and render the empty branch before
    // refetching. The API poll above already proved the row exists, so force a
    // cache-clearing reload before asserting on the row.
    const row = page
      .locator("button")
      .filter({ hasText: `#${siteMeasureId}` })
      .first();
    await expect(async () => {
      await reloadFresh(page);
      await expect(page.getByText("Loading…")).toHaveCount(0);
      await expect(row).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000 });
    await ctx.close();
  });

  test("15.1.2 other-org siteMeasure does not appear", async ({ browser }) => {
    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const { siteMeasureId } = await createCustomerAndEstimate(ctxB.request);
    await ctxB.close();

    const ctxA = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctxA);
    await page.goto("/site-measures");
    await expect(
      page.locator("button").filter({ hasText: `#${siteMeasureId}` })
    ).toHaveCount(0);
    await ctxA.close();
  });
});

test.describe("15.2 SiteMeasures list — server-driven pagination", () => {
  test("15.2.1 list request carries page & perPage params", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const [listResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.request().method() === "GET" &&
          r.status() === 200
      ),
      page.goto("/site-measures"),
    ]);

    const listUrl = listResp.url();
    expect(listUrl).toMatch(/[?&]page=\d+/);
    expect(listUrl).toMatch(/[?&]perPage=\d+/);
    await ctx.close();
  });

  test("15.2.2 status pill filters server-side with status=estimated", async ({
    browser,
  }) => {
    // This test seeds two records, then waits on two list fetches (each
    // allowing a 30s cold Vercel-preview/Neon start). The default 30s per-test
    // timeout is too tight for that worst case, so give it explicit headroom.
    test.setTimeout(90_000);
    // Avoid the literal pill labels in customer names so a text lookup can't
    // confuse a seeded row with a status pill.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const estimatedName = `Greenfield ${suffix}`;
    const emptyName = `Birchwood ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    // One site measure in the "estimated" bucket (rooms + estimate) and one in
    // the "empty" bucket (no rooms), with distinctive customer names.
    await seedEstimatedSiteMeasure(ctx.request, estimatedName);
    const emptyCust = await createCustomer(ctx.request, { name: emptyName });
    await createSiteMeasure(ctx.request, emptyCust.id);

    // The clear must take effect on the NEXT document, not the dashboard we
    // are still on: the dashboard primes the exact query key this list mounts
    // with (page 1, perPage 25, date desc, status all), and its persister can
    // re-write that cache entry after an in-page localStorage.clear(). A
    // replayed entry is fresh within the 60s staleTime, so the list page
    // would never issue the fetch the waitForResponse below needs (the
    // 2026-06-11 CI failure mode — all retries timed out identically).
    await clearStorageOnNextLoad(ctx);
    // Wait for the initial list fetch so the seeded rows are in the response
    // before asserting visibility (avoids a render race on slower CI). The
    // generous timeout absorbs a cold Vercel-preview serverless start plus
    // Neon connection latency, which can exceed the 10s action default.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.request().method() === "GET" &&
          r.status() === 200,
        { timeout: 30_000 }
      ),
      page.goto("/site-measures"),
    ]);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    // Both rows are present under the default "All" filter. Generous timeouts
    // absorb slower CI hydration after navigation.
    await expect(page.getByText(estimatedName)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(emptyName)).toBeVisible({ timeout: 15000 });

    // Clicking "Estimated" issues a request carrying status=estimated.
    const [filterResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes("status=estimated") &&
          r.status() === 200,
        { timeout: 30_000 }
      ),
      page
        .getByRole("button", { name: /^Estimated/ })
        .first()
        .click(),
    ]);
    expect(filterResp.url()).toContain("status=estimated");

    // The estimated row remains; the empty (no-rooms) row drops out.
    await expect(page.getByText(estimatedName)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(emptyName)).toHaveCount(0);
    await ctx.close();
  });

  test("15.2.3 search issues a debounced request carrying q=", async ({
    browser,
  }) => {
    // Use a single-token search term (no spaces) so the encoded `q=` value is
    // stable: URLSearchParams would encode a space as `+`, not `%20`.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const term = `Zephyr${suffix.replace(/-/g, "")}`;
    const targetName = `${term} Flooring`;
    const otherName = `Other ${suffix}`;

    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const targetCust = await createCustomer(ctx.request, { name: targetName });
    await createSiteMeasure(ctx.request, targetCust.id);
    const otherCust = await createCustomer(ctx.request, { name: otherName });
    await createSiteMeasure(ctx.request, otherCust.id);

    // Same persisted-cache hazard as 15.2.2: clear storage at next document
    // load so the list page cannot hydrate the dashboard's fresh cache entry
    // and skip the fetch this waitForResponse depends on.
    await clearStorageOnNextLoad(ctx);
    await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.request().method() === "GET" &&
          r.status() === 200,
        { timeout: 30_000 }
      ),
      page.goto("/site-measures"),
    ]);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText(targetName)).toBeVisible({ timeout: 15000 });

    const searchInput = page.locator('input[placeholder^="Search by"]');

    // Typing fires a debounced (~300ms) request carrying q=<term>.
    const [searchResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isListRequest(r.url()) &&
          r.url().includes(`q=${term}`) &&
          r.status() === 200
      ),
      searchInput.fill(term),
    ]);
    expect(searchResp.url()).toContain(`q=${term}`);

    // The list narrows to the matching customer; the other drops out.
    await expect(page.getByText(targetName)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(otherName)).toHaveCount(0);
    await ctx.close();
  });
});
