import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import { createCustomerAndEstimate, reloadFresh } from "./fixtures/seed";

// ── 3.1 SiteMeasure Builder ──────────────────────────────────────────────────────
//
// Coverage for the heart of the app: editing rooms, title, and rooms on
// `/site-measures/[id]`. Two layers:
//   • Direct PATCH /api/site-measures/[id] tests pin down the wire contract — they
//     are the regression for the "every save returns 400" bug where the zod
//     schema rejected the nulls Prisma returns for nullable columns.
//   • UI tests exercise the same flows through the page so we catch the next
//     time the client and server drift apart.
//
// React Query is persisted to localStorage (Providers.tsx) with the default
// 1s throttle, so reloads inside that window can hydrate from a stale cache
// — and several `useState(siteMeasure.items ?? [])` call sites in the builder
// initialize once and never re-sync from updated props, which makes that
// stale cache visible. We clear localStorage before any reload assertion to
// keep these tests focused on the server round-trip.

// ── 3.1 PATCH /api/site-measures/[id] — wire contract ───────────────────────────

test.describe
  .serial("3.1 SiteMeasure PATCH wire contract", () => {
    let ctx: BrowserContext;
    let siteMeasureId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      siteMeasureId = ids.siteMeasureId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("3.1.1 PATCH accepts a brand-new room with null w/l", async () => {
      // This is exactly the payload `RoomSection.addRoom()` produces — the
      // shape that previously broke every save in the UI.
      const res = await ctx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: {
            items: [
              {
                id: Date.now(),
                type: "room",
                name: "New Room",
                shape: "rect",
                w: null,
                l: null,
                note: "",
              },
            ],
          },
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        type: "room",
        name: "New Room",
        shape: "rect",
        w: null,
        l: null,
      });
    });

    test("3.1.2 PATCH accepts items round-tripped from GET", async () => {
      // Seed two rect rooms.
      const seed = await ctx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: {
            items: [
              {
                id: 1,
                type: "room",
                name: "Living",
                shape: "rect",
                w: 12,
                l: 14,
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
                note: "",
                sortOrder: 1,
              },
            ],
          },
        }
      );
      expect(seed.status()).toBe(200);

      // GET → PATCH the response back unchanged. This is what the UI does on
      // every keystroke once an siteMeasure has been loaded.
      const get = await ctx.request.get(`/api/site-measures/${siteMeasureId}`);
      const fetched = await get.json();
      const patch = await ctx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: { items: fetched.items },
        }
      );
      expect(patch.status()).toBe(200);
    });

    test("3.1.4 PATCH persists title", async () => {
      const res = await ctx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: { title: "Henderson Living Room" },
        }
      );
      expect(res.status()).toBe(200);
      const get = await ctx.request.get(`/api/site-measures/${siteMeasureId}`);
      const body = await get.json();
      expect(body.title).toBe("Henderson Living Room");
    });

    test("3.1.5 PATCH rejects items with missing id (zod still enforces shape)", async () => {
      const res = await ctx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: { items: [{ type: "room", name: "no-id" }] },
        }
      );
      expect(res.status()).toBe(400);
    });

    test("3.1.6 PATCH on another org's siteMeasure returns 404", async ({
      browser,
    }) => {
      // Different user → different org. Their session can't see our siteMeasure.
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: { title: "Hacked" },
        }
      );
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });

    test("3.1.7 PATCH unauthenticated returns 401", async ({ browser }) => {
      const anonCtx = await browser.newContext();
      const res = await anonCtx.request.patch(
        `/api/site-measures/${siteMeasureId}`,
        {
          data: { title: "Anon" },
        }
      );
      expect(res.status()).toBe(401);
      await anonCtx.close();
    });
  });

// ── 3.2 SiteMeasure Builder UI — rooms ──────────────────────────────────────────

test.describe
  .serial("3.2 SiteMeasure Builder UI — rooms", () => {
    let ctx: BrowserContext;
    let page: Page;
    let siteMeasureId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      page = await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      siteMeasureId = ids.siteMeasureId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("3.2.1 Add Room triggers a successful PATCH (regression for 400-on-add)", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      await expect(
        page.getByRole("button", { name: /add room/i })
      ).toBeVisible();

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/site-measures/${siteMeasureId}`) &&
            r.request().method() === "PATCH"
        ),
        page.getByRole("button", { name: /add room/i }).click(),
      ]);
      expect(response.status()).toBe(200);
      await expect(page.getByPlaceholder("Room name")).toHaveValue("New Room");
    });

    test("3.2.2 the new room persists across reload", async () => {
      // Confirm the add-room PATCH from 3.2.1 has actually landed before
      // reloading — under CI load the React Query refetch can race the test.
      await expect
        .poll(async () => {
          const r = await ctx.request.get(
            `/api/site-measures/${siteMeasureId}`
          );
          const body = await r.json();
          return (body.items as Array<{ type: string }>).filter(
            (i) => i.type === "room"
          ).length;
        })
        .toBeGreaterThan(0);

      await reloadFresh(page);
      await expect(page.getByPlaceholder("Room name")).toHaveValue("New Room");
    });

    test("3.2.3 editing the room name and blurring saves successfully", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      const input = page.getByPlaceholder("Room name");
      // RoomSection saves on every onChange AND onBlur, so fill+blur fires
      // overlapping PATCHes. expect.poll retries until the server converges.
      await input.fill("Living Room");
      await input.blur();

      await expect
        .poll(async () => {
          const r = await ctx.request.get(
            `/api/site-measures/${siteMeasureId}`
          );
          const body = await r.json();
          const room = (
            body.items as Array<{ type: string; name: string }>
          ).find((i) => i.type === "room");
          return room?.name;
        })
        .toBe("Living Room");

      await reloadFresh(page);
      await expect(page.getByPlaceholder("Room name")).toHaveValue(
        "Living Room"
      );
    });

    test("3.2.4 editing dimensions saves and updates sqft display", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      // RoomSection saves on every onChange AND onBlur, so filling L then W
      // fires several overlapping PATCHes. The sqft display updates from local
      // React state; expect.poll below retries until the server converges.
      await page.getByPlaceholder("L").fill("12");
      await page.getByPlaceholder("W").fill("10");
      await page.getByPlaceholder("W").blur();

      await expect(page.getByText(/120 sqft/).first()).toBeVisible();

      // Confirm the server has both fields by hitting the API directly —
      // immune to React render order.
      await expect
        .poll(async () => {
          const r = await ctx.request.get(
            `/api/site-measures/${siteMeasureId}`
          );
          const body = await r.json();
          const room = (body.items as Array<{ w: number; l: number }>).find(
            (i) => i.w != null && i.l != null
          );
          return room ? `${room.l}x${room.w}` : null;
        })
        .toBe("12x10");

      await reloadFresh(page);
      await expect(page.getByPlaceholder("L")).toHaveValue("12");
      await expect(page.getByPlaceholder("W")).toHaveValue("10");
    });

    test("3.2.6 Add Note creates a note that persists", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/site-measures/${siteMeasureId}`) &&
            r.request().method() === "PATCH"
        ),
        page.getByRole("button", { name: /add note/i }).click(),
      ]);
      expect(response.status()).toBe(200);

      const note = page.getByPlaceholder("Field note…");
      await note.fill("Tile in entryway only");
      await note.blur();

      await expect
        .poll(async () => {
          const r = await ctx.request.get(
            `/api/site-measures/${siteMeasureId}`
          );
          const body = await r.json();
          const noteItem = (
            body.items as Array<{ type: string; text: string | null }>
          ).find((i) => i.type === "note");
          return noteItem?.text;
        })
        .toBe("Tile in entryway only");

      await reloadFresh(page);
      await expect(page.getByPlaceholder("Field note…")).toHaveValue(
        "Tile in entryway only"
      );
    });

    test("3.2.7 removing a room saves and the room disappears after reload", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      const removeBtn = page.getByRole("button", { name: "Remove" }).first();
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/site-measures/${siteMeasureId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        removeBtn.click(),
      ]);

      await reloadFresh(page);
      // After removing the only room, no room-name input remains.
      await expect(page.getByPlaceholder("Room name")).toHaveCount(0);
    });

    test("3.2.8 creates a estimate from the siteMeasure page and lands on the estimate builder", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      await expect(
        page.getByText("Estimates for this siteMeasure")
      ).toBeVisible();

      // Click "+ Create Estimate" in the SiteMeasureEstimatesCard header
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/api/estimates") &&
            r.request().method() === "POST" &&
            r.status() === 201
        ),
        page
          .getByRole("button", { name: /\+ Create Estimate/ })
          .first()
          .click(),
      ]);
      expect(response.status()).toBe(201);

      // Should navigate to the estimate builder
      await expect(page).toHaveURL(/\/estimates\/\d+/);
      await expect(page.getByText("Line Items & Pricing")).toBeVisible();
    });
  });

// ── 3.3 SiteMeasure Builder UI — title ──────────────────────────────────────────

test.describe
  .serial("3.3 SiteMeasure Builder UI — title", () => {
    let ctx: BrowserContext;
    let page: Page;
    let siteMeasureId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      page = await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      siteMeasureId = ids.siteMeasureId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("3.3.1 editing the title saves and persists", async () => {
      await page.goto(`/site-measures/${siteMeasureId}`);
      // Title is rendered as a button until clicked; clicking opens an input.
      await page
        .getByRole("button", { name: /untitled site measure/i })
        .click();
      const titleInput = page.getByPlaceholder("Untitled site measure");
      await titleInput.fill("Henderson — Whole house");

      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/site-measures/${siteMeasureId}`) &&
            r.request().method() === "PATCH" &&
            r.status() === 200
        ),
        titleInput.blur(),
      ]);

      await reloadFresh(page);
      await expect(page.getByText("Henderson — Whole house")).toBeVisible();
    });
  });
