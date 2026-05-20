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
      const res = await otherCtx.request.patch(
        `/api/crew-members/${memberId}`,
        {
          data: { name: "Stolen" },
        }
      );
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
      expect(res.status()).toBe(204);
    });
  });
