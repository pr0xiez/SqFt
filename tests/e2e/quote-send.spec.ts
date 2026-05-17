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

    test("5.1.1 happy path: 200, status=sent, sentAt set", async () => {
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
