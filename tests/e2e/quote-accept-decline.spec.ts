import { expect, test } from "@playwright/test";
import {
  createCustomerAndEstimate,
  getApprovalToken,
  loginAsDemo,
  seedQuoteWithLineItem,
  TEST_SIGNATURE_PNG,
} from "./fixtures/seed";

// ── 6.1 Public accept ────────────────────────────────────────────────────────

test.describe("6.1 Public accept", () => {
  test("6.1.1 happy path: 200, status=accepted, acceptedAt set", async ({
    browser,
  }) => {
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
    const first = await anon.request.post(`/api/q/${token}/accept`, {
      data: body,
    });
    expect(first.status()).toBe(200);
    const second = await anon.request.post(`/api/q/${token}/accept`, {
      data: body,
    });
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

  test("6.1.4 short/garbage token returns 404 without DB lookup", async ({
    browser,
  }) => {
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
  test("6.2.1 happy path: 200, status=declined, declineReason persisted", async ({
    browser,
  }) => {
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

  test("6.2.2 declined public page shows builder contact block", async ({
    browser,
  }) => {
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
    await expect(
      page.getByText(/Johnson Flooring Co\./i).first()
    ).toBeVisible();
    await expect(page.getByText(/declined/i).first()).toBeVisible();
    await anon.close();
    await ctx.close();

    void quoteId;
  });

  test("6.2.3 second decline returns 409", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemo(ctx);
    const { estimateId } = await createCustomerAndEstimate(ctx.request);
    const { quoteId } = await seedQuoteWithLineItem(ctx.request, estimateId);
    const token = await getApprovalToken(ctx.request, quoteId);

    const anon = await browser.newContext();
    const first = await anon.request.post(`/api/q/${token}/decline`, {
      data: { reason: "first" },
    });
    expect(first.status()).toBe(200);
    const second = await anon.request.post(`/api/q/${token}/decline`, {
      data: { reason: "second" },
    });
    expect(second.status()).toBe(409);
    await anon.close();
    await ctx.close();

    void quoteId;
  });
});
