## What & why

<!-- A sentence or two. Name the issue or spec item this closes, if there is one. -->

## What it looks like

<!--
REQUIRED for any user-visible change: a screenshot or short video of it, staged
so the reader can see the feature doing its job — not an empty list and not the
login form. A PR with no UI change says so here in one line instead.

Playwright already knows how to sign in and seed an org, so the app can shoot
itself. Drop a scratch spec at tests/e2e/shot.spec.ts (don't commit the spec):

    import { test } from "@playwright/test";
    import { loginAsFreshOrg } from "./fixtures/org";
    import { createCustomer } from "./fixtures/seed";

    test("shot", async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const { page } = await loginAsFreshOrg(browser, ctx);
      // Seed whatever state the feature needs to look real:
      await createCustomer(ctx.request, { name: "Ada Lovelace" });
      await page.goto("/customers");
      await page.screenshot({ path: "docs/media/customers-list.png" });
      await ctx.close();
    });

then:

    npx playwright test tests/e2e/shot.spec.ts --workers=1

That runs against local `next dev` and your dev DB, so `.env` needs
SUPER_ADMIN_EMAILS to include admin@sqft.dev. To shoot the Vercel preview
instead, point it at the deployment:

    BASE_URL=<preview url> VERCEL_AUTOMATION_BYPASS_SECRET=<secret> \
      npx playwright test tests/e2e/shot.spec.ts --workers=1

Commit the image under docs/media/ on this branch and embed it with a
raw.githubusercontent.com URL pinned to the commit SHA, so it outlives the
branch. For a video, drag the file straight into this box — GitHub hosts it.
-->

## Verification

<!-- Paste the tails, or name the CI job that covers the change. -->

- [ ] `npm run lint:ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:e2e -- --workers=1` — or: the PR Checks E2E job covers it
