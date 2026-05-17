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
