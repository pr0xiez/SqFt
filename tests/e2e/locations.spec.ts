import { expect, test } from "@playwright/test";
import { loginAsSecondaryOrg, loginAsWorkerOrg } from "./fixtures/org";
import { createCustomer, createLocation } from "./fixtures/seed";

test.describe("16.1 Locations", () => {
  test("16.1.1 a customer can have two locations and a site measure under a chosen one", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await loginAsWorkerOrg(browser, ctx);

    const customer = await createCustomer(ctx.request, {
      name: `Loc Customer ${Date.now()}`,
    });

    const rental = await createLocation(ctx.request, customer.id, {
      address: "12 Oak St",
      label: "Rental",
    });
    const home = await createLocation(ctx.request, customer.id, {
      address: "9 Elm Ave",
      label: "Main house",
    });

    // GET lists both locations for the customer.
    const listRes = await ctx.request.get(
      `/api/locations?customerId=${customer.id}`
    );
    expect(listRes.ok()).toBeTruthy();
    const locs = (await listRes.json()) as Array<{
      id: number;
      address: string;
    }>;
    expect(locs.map((l) => l.address).sort()).toEqual([
      "12 Oak St, Columbus, OH 43215",
      "9 Elm Ave, Columbus, OH 43215",
    ]);

    // Create a site measure under the chosen location (the rental).
    const smRes = await ctx.request.post("/api/site-measures", {
      data: { locationId: rental.id },
    });
    expect(smRes.status()).toBe(201);
    const siteMeasure = (await smRes.json()) as { id: number };

    // The site measure reaches the customer via its location, and carries the
    // chosen location's address — not the other location's.
    const smGet = await ctx.request.get(`/api/site-measures/${siteMeasure.id}`);
    const fetched = (await smGet.json()) as {
      locationId: number;
      location: { id: number; address: string; customer: { id: number } };
    };
    expect(fetched.locationId).toBe(rental.id);
    expect(fetched.location.address).toBe("12 Oak St, Columbus, OH 43215");
    expect(fetched.location.customer.id).toBe(customer.id);
    expect(fetched.location.id).not.toBe(home.id);

    // Customer detail page shows both location addresses.
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByText("12 Oak St").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("9 Elm Ave").first()).toBeVisible();

    await ctx.close();
  });

  test("16.1.2 locations are org-scoped: another org cannot read them", async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    await loginAsWorkerOrg(browser, ctxA);
    const customer = await createCustomer(ctxA.request, {
      name: `Scoped ${Date.now()}`,
    });
    await createLocation(ctxA.request, customer.id, {
      address: "77 Private Rd",
    });

    const ctxB = await browser.newContext();
    await loginAsSecondaryOrg(browser, ctxB);
    const res = await ctxB.request.get(
      `/api/locations?customerId=${customer.id}`
    );
    // Org B is scoped to its own org, so it sees none of org A's locations.
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual([]);

    await ctxA.close();
    await ctxB.close();
  });
});
