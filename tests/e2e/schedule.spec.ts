import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import { createCustomer } from "./fixtures/seed";

test.describe("14.1 Events / schedule API", () => {
  test("14.1.1 POST creates an event (201)", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsWorkerOrg(browser, ctx);
    const customer = await createCustomer(ctx.request, {
      name: "Sched Customer",
    });

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
    await loginAsWorkerOrg(browser, ctx);
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

  test("14.1.4 cross-org list excludes other org's events", async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    await loginAsWorkerOrg(browser, ctxA);
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

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const list = await (await ctxB.request.get("/api/events")).json();
    expect(list.some((e: { id: number }) => e.id === eventId)).toBe(false);
    await ctxB.close();
  });
});
