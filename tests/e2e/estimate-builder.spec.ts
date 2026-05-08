import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

// ── 3.1 Estimate Builder ──────────────────────────────────────────────────────
//
// Coverage for the heart of the app: editing rooms, line items, title, and
// quote settings on `/estimates/[id]`. Two layers:
//   • Direct PATCH /api/estimates/[id] tests pin down the wire contract — they
//     are the regression for the "every save returns 400" bug where the zod
//     schema rejected the nulls Prisma returns for nullable columns.
//   • UI tests exercise the same flows through the page so we catch the next
//     time the client and server drift apart.

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

async function signupAndLogin(
  ctx: BrowserContext,
  email: string,
  password: string
): Promise<Page> {
  await ctx.request.post("/api/auth/signup", {
    data: { name: "Estimate Test", email, password },
  });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
  await page.goto("/onboarding");
  await page.fill("#company", "Test Floors LLC");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
  return page;
}

async function createCustomerAndEstimate(
  request: APIRequestContext
): Promise<{ customerId: number; estimateId: number }> {
  const custRes = await request.post("/api/customers", {
    data: { name: "Test Customer", source: "phone" },
  });
  expect(custRes.ok()).toBeTruthy();
  const customer = await custRes.json();
  const estRes = await request.post("/api/estimates", {
    data: { customerId: customer.id },
  });
  expect(estRes.ok()).toBeTruthy();
  const estimate = await estRes.json();
  return { customerId: customer.id, estimateId: estimate.id };
}

// ── 3.1 PATCH /api/estimates/[id] — wire contract ───────────────────────────

test.describe
  .serial("3.1 Estimate PATCH wire contract", () => {
    let ctx: BrowserContext;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await signupAndLogin(ctx, uniqueEmail(), "password123");
      const ids = await createCustomerAndEstimate(ctx.request);
      estimateId = ids.estimateId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("3.1.1 PATCH accepts a brand-new room with null w/l/lshapeData", async () => {
      // This is exactly the payload `RoomSection.addRoom()` produces — the
      // shape that previously broke every save in the UI.
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: {
          items: [
            {
              id: Date.now(),
              type: "room",
              name: "New Room",
              shape: "rect",
              w: null,
              l: null,
              lshapeData: null,
              note: "",
            },
          ],
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        type: "room",
        name: "New Room",
        shape: "rect",
        w: null,
        l: null,
        lshapeData: null,
      });
    });

    test("3.1.2 PATCH accepts items round-tripped from GET (rect rooms have lshapeData=null)", async () => {
      // Seed two rect rooms.
      const seed = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: {
          items: [
            {
              id: 1,
              type: "room",
              name: "Living",
              shape: "rect",
              w: 12,
              l: 14,
              lshapeData: null,
              note: "",
              sortOrder: 0,
            },
            {
              id: 2,
              type: "room",
              name: "Bedroom",
              shape: "rect",
              w: 10,
              l: 11,
              lshapeData: null,
              note: "",
              sortOrder: 1,
            },
          ],
        },
      });
      expect(seed.status()).toBe(200);

      // GET → PATCH the response back unchanged. This is what the UI does on
      // every keystroke once an estimate has been loaded.
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const fetched = await get.json();
      const patch = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { items: fetched.items },
      });
      expect(patch.status()).toBe(200);
    });

    test("3.1.3 PATCH accepts a linked-mode line item with qty=null", async () => {
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: {
          lineItems: [
            {
              id: 1,
              name: "LVP",
              rate: 4.5,
              qtyMode: "linked",
              qty: null,
              wastePct: 10,
              unitLabel: "sqft",
              linkedRoomIds: [],
              sortOrder: 0,
            },
          ],
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.lineItems).toHaveLength(1);
      expect(body.lineItems[0]).toMatchObject({
        name: "LVP",
        qtyMode: "linked",
        qty: null,
      });
    });

    test("3.1.4 PATCH persists L-shape JSON correctly", async () => {
      const lshapeData = {
        sections: [
          { w: 10, l: 8 },
          { w: 4, l: 6 },
        ],
        deductions: [{ w: 2, l: 2, label: "closet" }],
      };
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: {
          items: [
            {
              id: 1,
              type: "room",
              name: "L Room",
              shape: "lshape",
              w: 10,
              l: 8,
              lshapeData,
              note: "",
              sortOrder: 0,
            },
          ],
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.items[0].lshapeData).toEqual(lshapeData);

      // Round-trip the fetched JSON and assert it still matches.
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const fetched = await get.json();
      expect(fetched.items[0].lshapeData).toEqual(lshapeData);
    });

    test("3.1.5 PATCH persists title", async () => {
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { title: "Henderson Living Room" },
      });
      expect(res.status()).toBe(200);
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const body = await get.json();
      expect(body.title).toBe("Henderson Living Room");
    });

    test("3.1.6 PATCH persists tax / markup / deposit", async () => {
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { taxRate: 0.075, markupPct: 32, depositPct: 0.4 },
      });
      expect(res.status()).toBe(200);
      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const body = await get.json();
      expect(body.taxRate).toBeCloseTo(0.075, 5);
      expect(body.markupPct).toBeCloseTo(32, 5);
      expect(body.depositPct).toBeCloseTo(0.4, 5);
    });

    test("3.1.7 PATCH rejects truly invalid input (taxRate > 1)", async () => {
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { taxRate: 5 },
      });
      expect(res.status()).toBe(400);
    });

    test("3.1.8 PATCH rejects items with missing id (zod still enforces shape)", async () => {
      const res = await ctx.request.patch(`/api/estimates/${estimateId}`, {
        data: { items: [{ type: "room", name: "no-id" }] },
      });
      expect(res.status()).toBe(400);
    });

    test("3.1.9 PATCH on another org's estimate returns 404", async ({
      browser,
    }) => {
      // Different user → different org. Their session can't see our estimate.
      const otherCtx = await browser.newContext();
      await signupAndLogin(otherCtx, uniqueEmail(), "password123");
      const res = await otherCtx.request.patch(`/api/estimates/${estimateId}`, {
        data: { title: "Hacked" },
      });
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("3.1.10 PATCH unauthenticated returns 401", async ({ browser }) => {
      const anonCtx = await browser.newContext();
      const res = await anonCtx.request.patch(`/api/estimates/${estimateId}`, {
        data: { title: "Anon" },
      });
      expect(res.status()).toBe(401);
      await anonCtx.close();
    });
  });

// ── 3.2 Estimate Builder UI — rooms ──────────────────────────────────────────

test.describe
  .serial("3.2 Estimate Builder UI — rooms", () => {
    let ctx: BrowserContext;
    let page: Page;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      page = await signupAndLogin(ctx, uniqueEmail(), "password123");
      const ids = await createCustomerAndEstimate(ctx.request);
      estimateId = ids.estimateId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("3.2.1 Add Room triggers a successful PATCH (regression for 400-on-add)", async () => {
      await page.goto(`/estimates/${estimateId}`);
      await expect(
        page.getByRole("button", { name: /add room/i })
      ).toBeVisible();

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        page.getByRole("button", { name: /add room/i }).click(),
      ]);
      expect(response.status()).toBe(200);
      await expect(page.getByPlaceholder("Room name")).toHaveValue("New Room");
    });

    test("3.2.2 the new room persists across reload", async () => {
      await page.reload();
      await expect(page.getByPlaceholder("Room name")).toHaveValue("New Room");
    });

    test("3.2.3 editing the room name and blurring saves successfully", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const input = page.getByPlaceholder("Room name");
      await input.fill("Living Room");

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        input.blur(),
      ]);
      expect(response.status()).toBe(200);

      await page.reload();
      await expect(page.getByPlaceholder("Room name")).toHaveValue(
        "Living Room"
      );
    });

    test("3.2.4 editing dimensions saves and updates sqft display", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const lInput = page.getByPlaceholder("L");
      const wInput = page.getByPlaceholder("W");
      await lInput.fill("12");
      await wInput.fill("10");

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        wInput.blur(),
      ]);
      expect(response.status()).toBe(200);
      await expect(page.getByText(/120 sqft/).first()).toBeVisible();

      await page.reload();
      await expect(page.getByPlaceholder("L")).toHaveValue("12");
      await expect(page.getByPlaceholder("W")).toHaveValue("10");
    });

    test("3.2.5 switching shape to L-shape saves successfully", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        page.getByRole("button", { name: "L-shape" }).click(),
      ]);
      expect(response.status()).toBe(200);
    });

    test("3.2.6 Add Note creates a note that persists", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        page.getByRole("button", { name: /add note/i }).click(),
      ]);
      expect(response.status()).toBe(200);

      const note = page.getByPlaceholder("Field note…");
      await note.fill("Tile in entryway only");
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        note.blur(),
      ]);
      await page.reload();
      await expect(page.getByPlaceholder("Field note…")).toHaveValue(
        "Tile in entryway only"
      );
    });

    test("3.2.7 removing a room saves and the room disappears after reload", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const removeBtn = page.getByRole("button", { name: "Remove" }).first();
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        removeBtn.click(),
      ]);

      await page.reload();
      // After removing the only room, no room-name input remains.
      await expect(page.getByPlaceholder("Room name")).toHaveCount(0);
    });
  });

// ── 3.3 Estimate Builder UI — line items, title, quote settings ─────────────

test.describe
  .serial("3.3 Estimate Builder UI — line items, title, quote settings", () => {
    let ctx: BrowserContext;
    let page: Page;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      page = await signupAndLogin(ctx, uniqueEmail(), "password123");
      const ids = await createCustomerAndEstimate(ctx.request);
      estimateId = ids.estimateId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("3.3.1 Add Line Item triggers a successful PATCH and persists", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH"
        ),
        page.getByRole("button", { name: /add line item/i }).click(),
      ]);
      expect(response.status()).toBe(200);

      await page.reload();
      await expect(page.locator('input[value="New line item"]')).toBeVisible();
    });

    test("3.3.2 editing line item name saves and persists", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const nameInput = page.locator('input[value="New line item"]');
      await nameInput.fill("LVP — Mohawk RevWood");

      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        nameInput.blur(),
      ]);

      await page.reload();
      await expect(
        page.locator('input[value="LVP — Mohawk RevWood"]')
      ).toBeVisible();
    });

    test("3.3.3 editing the title saves and persists", async () => {
      await page.goto(`/estimates/${estimateId}`);
      // Title is rendered as a button until clicked; clicking opens an input.
      await page.getByRole("button", { name: /untitled estimate/i }).click();
      const titleInput = page.getByPlaceholder("Untitled estimate");
      await titleInput.fill("Henderson — Whole house");

      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        titleInput.blur(),
      ]);

      await page.reload();
      await expect(page.getByText("Henderson — Whole house")).toBeVisible();
    });

    test("3.3.4 saving quote settings persists tax, markup, deposit", async () => {
      await page.goto(`/estimates/${estimateId}`);
      const fields = page.locator('input[type="number"][step="0.1"]');
      // Tax / Markup / Deposit, in render order.
      await fields.nth(0).fill("7.5");
      await fields.nth(1).fill("32");
      await fields.nth(2).fill("40");

      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/estimates/${estimateId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        page.getByRole("button", { name: /save quote settings/i }).click(),
      ]);

      await page.reload();
      const fieldsAfter = page.locator('input[type="number"][step="0.1"]');
      await expect(fieldsAfter.nth(0)).toHaveValue("7.5");
      await expect(fieldsAfter.nth(1)).toHaveValue("32");
      await expect(fieldsAfter.nth(2)).toHaveValue("40");
    });
  });
