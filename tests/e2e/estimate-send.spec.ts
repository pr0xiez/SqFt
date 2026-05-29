import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import {
  createCustomerAndEstimate,
  seedApprovedEstimate,
  seedEstimateWithLineItem,
} from "./fixtures/seed";

// ── 5.1 POST /api/estimates/[id]/send ───────────────────────────────────────────

test.describe
  .serial("5.1 Estimate send", () => {
    let ctx: BrowserContext;
    let siteMeasureId: number;
    let estimateId: number;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsWorkerOrg(browser, ctx);
      const ids = await createCustomerAndEstimate(ctx.request);
      siteMeasureId = ids.siteMeasureId;
      const seed = await seedEstimateWithLineItem(ctx.request, siteMeasureId);
      estimateId = seed.estimateId;
    });

    test.afterAll(async () => {
      await ctx.close();
    });

    test("5.1.1 happy path: 200, status=sent, sentAt set", async () => {
      const res = await ctx.request.post(`/api/estimates/${estimateId}/send`, {
        data: {
          to: "customer@example.com",
          subject: "Your estimate from Johnson Flooring Co.",
          message: "Let me know if you have any questions.",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const get = await ctx.request.get(`/api/estimates/${estimateId}`);
      const estimate = await get.json();
      expect(estimate.sentAt).toBeTruthy();
      expect(estimate.status).toBe("sent");
    });

    test("5.1.2 invalid body returns 400", async () => {
      const res = await ctx.request.post(`/api/estimates/${estimateId}/send`, {
        data: { to: "not-an-email", subject: "x" },
      });
      expect(res.status()).toBe(400);
    });

    test("5.1.3 unauth POST returns 401", async ({ browser }) => {
      const anon = await browser.newContext();
      const res = await anon.request.post(`/api/estimates/${estimateId}/send`, {
        data: { to: "c@example.com", subject: "Estimate" },
      });
      expect(res.status()).toBe(401);
      await anon.close();
    });

    test("5.1.4 cross-org POST returns 404", async ({ browser }) => {
      const otherCtx = await browser.newContext();
      await loginAsSecondaryOrg(browser, otherCtx);
      const res = await otherCtx.request.post(
        `/api/estimates/${estimateId}/send`,
        {
          data: { to: "c@example.com", subject: "Estimate" },
        }
      );
      expect(res.status()).toBe(404);
      await otherCtx.close();
    });
  });

// ── 5.2 Lockdown: cannot re-send a terminal estimate ────────────────────────────

test.describe("5.2 Send lockdown", () => {
  test("5.2.1 sending an approved estimate returns 409", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const { siteMeasureId } = await createCustomerAndEstimate(ctx.request);
    const { estimateId } = await seedApprovedEstimate(
      ctx.request,
      siteMeasureId
    );

    const res = await ctx.request.post(`/api/estimates/${estimateId}/send`, {
      data: { to: "c@example.com", subject: "Estimate" },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/approved/);
    await ctx.close();
  });
});
