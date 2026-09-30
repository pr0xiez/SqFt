import { type BrowserContext, expect, test } from "@playwright/test";
import { loginAsFreshOrg } from "./fixtures/org";
import { connectQboViaMock, mockRealmEnabled } from "./fixtures/qbo";

/**
 * Full OAuth loop against the in-app mock realm: connect from Settings →
 * Integrations, land back connected, then disconnect. Skips when the target
 * deployment doesn't serve the mock (QBO_ENVIRONMENT!=mock).
 */
test.describe
  .serial("QBO connect", () => {
    let ctx: BrowserContext;
    let enabled = false;

    test.beforeAll(async ({ browser }) => {
      ctx = await browser.newContext();
      await loginAsFreshOrg(browser, ctx);
      enabled = await mockRealmEnabled(ctx);
    });
    test.afterAll(async () => {
      await ctx.close();
    });

    test("connect via the mock authorize page, then disconnect", async () => {
      test.skip(!enabled, "mock QBO realm not enabled on this deployment");
      const page = await ctx.newPage();

      await connectQboViaMock(ctx, page);
      await expect(
        page.getByRole("button", { name: "Disconnect" })
      ).toBeVisible();

      await page.getByRole("button", { name: "Disconnect" }).click();
      await expect(
        page.getByRole("button", { name: "Connect to QuickBooks" })
      ).toBeVisible();
      await expect(
        page.getByText("QuickBooks needs to be reconnected")
      ).toHaveCount(0);
    });
  });
