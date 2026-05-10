import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures/auth";

// ── 4.1 Quote Builder — Room Link Picker ─────────────────────────────────────
//
// Covers the interactive popover that lets a user link rooms to a line item.
// Seeded via the API: 1 estimate with 2 rooms (Kitchen 12×10 = 120 sqft,
// Dining 10×8 = 80 sqft), 1 draft quote with one manual line item. Each test
// drives the picker UI and asserts both the rendered state and the persisted
// shape via GET /api/quotes/{id}.

async function loginAsDemo(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", DEMO_EMAIL);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
  return page;
}

async function seedEstimateWithRooms(
  request: APIRequestContext
): Promise<{ estimateId: number; kitchenId: number; diningId: number }> {
  const custRes = await request.post("/api/customers", {
    data: { name: "Quote Customer", source: "phone" },
  });
  const customer = await custRes.json();

  const estRes = await request.post("/api/estimates", {
    data: { customerId: customer.id },
  });
  const estimate = await estRes.json();

  // Two rect rooms: 120 sqft + 80 sqft = 200 base sqft.
  await request.patch(`/api/estimates/${estimate.id}`, {
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
        {
          id: 2,
          type: "room",
          name: "Dining",
          shape: "rect",
          w: 8,
          l: 10,
          note: "",
          sortOrder: 1,
        },
      ],
    },
  });

  // The PATCH renumbers item ids server-side. Read them back so tests can
  // assert against the actual EstimateItem ids.
  const get = await request.get(`/api/estimates/${estimate.id}`);
  const fetched = await get.json();
  const rooms = (
    fetched.items as Array<{ id: number; name: string; type: string }>
  ).filter((i) => i.type === "room");
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const dining = rooms.find((r) => r.name === "Dining");
  if (!kitchen || !dining) {
    throw new Error("seed estimate missing expected rooms");
  }
  return {
    estimateId: estimate.id,
    kitchenId: kitchen.id,
    diningId: dining.id,
  };
}

async function seedQuoteWithLineItem(
  request: APIRequestContext,
  estimateId: number
): Promise<{ quoteId: number; lineItemId: number }> {
  const quoteRes = await request.post("/api/quotes", {
    data: { estimateId },
  });
  const quote = await quoteRes.json();

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

  // Read back the persisted line item id (server may renumber).
  const get = await request.get(`/api/quotes/${quote.id}`);
  const fetched = await get.json();
  const li = (fetched.lineItems as Array<{ id: number; name: string }>).find(
    (i) => i.name === "Engineered hardwood"
  );
  if (!li) throw new Error("seed quote missing expected line item");
  return { quoteId: quote.id, lineItemId: li.id };
}

test.describe
  .serial("4.1 Quote Builder — room link picker", () => {
    let ctx: BrowserContext;
    let page: Page;
    let quoteId: number;
    let kitchenId: number;
    let diningId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      page = await loginAsDemo(ctx);
      const seed = await seedEstimateWithRooms(ctx.request);
      kitchenId = seed.kitchenId;
      diningId = seed.diningId;
      const q = await seedQuoteWithLineItem(ctx.request, seed.estimateId);
      quoteId = q.quoteId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("4.1.1 picker opens when scope button is clicked on a manual line item", async () => {
      await page.goto(`/quotes/${quoteId}`);
      await expect(page.getByText("Line Items & Pricing")).toBeVisible();

      // Manual line item shows the "Manual · ft²" scope button.
      const scopeBtn = page.getByRole("button", { name: /Manual · ft²/i });
      await expect(scopeBtn).toBeVisible();
      await scopeBtn.click();

      // Picker dialog appears with rooms listed.
      const dialog = page.getByRole("dialog", { name: "Link rooms" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Kitchen")).toBeVisible();
      await expect(dialog.getByText("Dining")).toBeVisible();
      await expect(dialog.getByText("120 sqft")).toBeVisible();
      await expect(dialog.getByText("80 sqft")).toBeVisible();
      await expect(dialog.getByText("No rooms selected")).toBeVisible();

      // Apply is disabled with zero rooms selected.
      const apply = dialog.getByRole("button", { name: "Apply" });
      await expect(apply).toBeDisabled();
    });

    test("4.1.2 selecting rooms + waste, clicking Apply, persists and renders linked state", async () => {
      // Picker is already open from 4.1.1; click two rooms and set waste.
      const dialog = page.getByRole("dialog", { name: "Link rooms" });
      await dialog.getByText("Kitchen").click();
      await dialog.getByText("Dining").click();
      await dialog.locator("#rp-waste").selectOption("10");

      // Preview reflects 200 base × 1.10 = 220.0.
      await expect(dialog.getByText(/2 rooms/)).toBeVisible();
      await expect(dialog.getByText(/220\.0 sqft/)).toBeVisible();

      // Apply commits via PATCH; wait for it.
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/quotes/${quoteId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        dialog.getByRole("button", { name: "Apply" }).click(),
      ]);
      expect(response.status()).toBe(200);

      // Picker closes, scope button now shows "🔗 2 rooms".
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: /🔗 2 rooms/ })
      ).toBeVisible();

      // Linked qty cell shows 220.0 sqft (sage).
      await expect(page.getByText("220.0").first()).toBeVisible();

      // Room tags + waste tag appear under the row.
      await expect(page.getByText(/Kitchen/).first()).toBeVisible();
      await expect(page.getByText(/Dining/).first()).toBeVisible();
      await expect(page.getByText("+10% waste")).toBeVisible();

      // Server confirms the persisted shape.
      const get = await ctx.request.get(`/api/quotes/${quoteId}`);
      const body = await get.json();
      const li = (
        body.lineItems as Array<{
          qtyMode: string;
          linkedRoomIds: number[];
          wastePct: number;
        }>
      )[0];
      expect(li.qtyMode).toBe("linked");
      expect(li.wastePct).toBe(10);
      expect([...li.linkedRoomIds].sort()).toEqual(
        [kitchenId, diningId].sort()
      );
    });

    test("4.1.3 reopening the picker shows the saved selection pre-checked", async () => {
      await page.getByRole("button", { name: /🔗 2 rooms/ }).click();
      const dialog = page.getByRole("dialog", { name: "Link rooms" });
      await expect(dialog).toBeVisible();

      // Both checkboxes start checked.
      const checkboxes = dialog.locator('input[type="checkbox"]');
      await expect(checkboxes).toHaveCount(2);
      await expect(checkboxes.nth(0)).toBeChecked();
      await expect(checkboxes.nth(1)).toBeChecked();
      await expect(dialog.locator("#rp-waste")).toHaveValue("10");
    });

    test("4.1.4 Escape closes the picker without persisting draft changes", async () => {
      const dialog = page.getByRole("dialog", { name: "Link rooms" });
      await expect(dialog).toBeVisible();

      // Uncheck Kitchen and change waste in the draft, then Esc.
      await dialog.getByText("Kitchen").click();
      await dialog.locator("#rp-waste").selectOption("20");
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();

      // Server unchanged from 4.1.2.
      const get = await ctx.request.get(`/api/quotes/${quoteId}`);
      const body = await get.json();
      const li = (
        body.lineItems as Array<{ wastePct: number; linkedRoomIds: number[] }>
      )[0];
      expect(li.wastePct).toBe(10);
      expect(li.linkedRoomIds).toHaveLength(2);
    });

    test("4.1.5 Clear reverts the line item to manual mode and persists", async () => {
      await page.getByRole("button", { name: /🔗 2 rooms/ }).click();
      const dialog = page.getByRole("dialog", { name: "Link rooms" });
      await expect(dialog).toBeVisible();

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/quotes/${quoteId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        dialog.getByRole("button", { name: "Clear" }).click(),
      ]);
      expect(response.status()).toBe(200);

      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: /Manual · ft²/i })
      ).toBeVisible();

      const get = await ctx.request.get(`/api/quotes/${quoteId}`);
      const body = await get.json();
      const li = (
        body.lineItems as Array<{
          qtyMode: string;
          linkedRoomIds: number[];
          wastePct: number;
        }>
      )[0];
      expect(li.qtyMode).toBe("manual");
      expect(li.linkedRoomIds).toEqual([]);
      expect(li.wastePct).toBe(0);
    });
  });
