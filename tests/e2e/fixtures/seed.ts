import { type APIRequestContext, expect, type Page } from "@playwright/test";

// ── reload helper ────────────────────────────────────────────────────────────

/**
 * Drop persisted React Query cache before reloading so the page hydrates from
 * server data, not stale localStorage.
 */
export async function reloadFresh(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

// ── customer / siteMeasure ──────────────────────────────────────────────────────

export async function createCustomer(
  request: APIRequestContext,
  args: { name?: string; source?: string } = {}
): Promise<{ id: number }> {
  const res = await request.post("/api/customers", {
    data: {
      name: args.name ?? "Test Customer",
      source: args.source ?? "phone",
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function createLocation(
  request: APIRequestContext,
  customerId: number,
  args: {
    address?: string;
    street?: string;
    unit?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    label?: string;
  } = {}
): Promise<{ id: number }> {
  const res = await request.post("/api/locations", {
    data: {
      customerId,
      street: args.street ?? args.address ?? "100 Test Ave",
      city: args.city ?? "Columbus",
      state: args.state ?? "OH",
      postalCode: args.postalCode ?? "43215",
      ...(args.unit ? { unit: args.unit } : {}),
      ...(args.label ? { label: args.label } : {}),
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Create a site measure for a customer. Site measures now hang off a Location,
 * so this creates a Location for the customer first (keeping the `customerId`
 * signature so existing callers keep working) and sends `locationId`.
 */
export async function createSiteMeasure(
  request: APIRequestContext,
  customerId: number
): Promise<{ id: number }> {
  const location = await createLocation(request, customerId);
  const res = await request.post("/api/site-measures", {
    data: { locationId: location.id },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function createCustomerAndEstimate(
  request: APIRequestContext
): Promise<{ customerId: number; siteMeasureId: number }> {
  const customer = await createCustomer(request);
  const siteMeasure = await createSiteMeasure(request, customer.id);
  return { customerId: customer.id, siteMeasureId: siteMeasure.id };
}

/**
 * Seed an siteMeasure with two rect rooms (Kitchen 12×10=120 sqft, Dining 10×8=80
 * sqft). The PATCH renumbers item ids server-side, so we read them back.
 */
export async function seedEstimateWithRooms(
  request: APIRequestContext
): Promise<{ siteMeasureId: number; kitchenId: number; diningId: number }> {
  const customer = await createCustomer(request, { name: "Estimate Customer" });
  const siteMeasure = await createSiteMeasure(request, customer.id);

  await request.patch(`/api/site-measures/${siteMeasure.id}`, {
    data: {
      items: [
        {
          id: 1,
          type: "room",
          name: "Kitchen",
          shape: "rect",
          w: 10,
          l: 12,
          note: "",
          sortOrder: 0,
        },
        {
          id: 2,
          type: "room",
          name: "Dining",
          shape: "rect",
          w: 8,
          l: 10,
          note: "",
          sortOrder: 1,
        },
      ],
    },
  });

  const res = await request.get(`/api/site-measures/${siteMeasure.id}`);
  const fetched = await res.json();
  const rooms = (
    fetched.items as Array<{ id: number; name: string; type: string }>
  ).filter((i) => i.type === "room");
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const dining = rooms.find((r) => r.name === "Dining");
  if (!kitchen || !dining)
    throw new Error("seed siteMeasure missing expected rooms");
  return {
    siteMeasureId: siteMeasure.id,
    kitchenId: kitchen.id,
    diningId: dining.id,
  };
}

// ── estimate ────────────────────────────────────────────────────────────────────

export async function createEstimate(
  request: APIRequestContext,
  siteMeasureId: number
): Promise<{ id: number }> {
  const res = await request.post("/api/estimates", { data: { siteMeasureId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Seed a draft estimate on `siteMeasureId` with one manual line item. The PATCH
 * renumbers line item ids, so we read them back.
 */
export async function seedEstimateWithLineItem(
  request: APIRequestContext,
  siteMeasureId: number
): Promise<{ estimateId: number; lineItemId: number }> {
  const estimate = await createEstimate(request, siteMeasureId);
  await request.patch(`/api/estimates/${estimate.id}`, {
    data: {
      lineItems: [
        {
          id: 9001,
          name: "Engineered hardwood",
          rate: 8.5,
          qtyMode: "manual",
          qty: null,
          wastePct: 0,
          unitLabel: "ft²",
          linkedRoomIds: [],
          sortOrder: 0,
        },
      ],
    },
  });
  const res = await request.get(`/api/estimates/${estimate.id}`);
  const fetched = await res.json();
  const li = (fetched.lineItems as Array<{ id: number; name: string }>).find(
    (i) => i.name === "Engineered hardwood"
  );
  if (!li) throw new Error("seed estimate missing expected line item");
  return { estimateId: estimate.id, lineItemId: li.id };
}

/** Rotate (and obtain) the public approval token for a estimate. */
export async function getApprovalToken(
  request: APIRequestContext,
  estimateId: number
): Promise<string> {
  const res = await request.post(`/api/estimates/${estimateId}/approval-token`);
  expect(res.ok()).toBeTruthy();
  const { approvalToken } = (await res.json()) as { approvalToken: string };
  return approvalToken;
}

/**
 * Seed an estimate and drive it to approved via the public one-click approve
 * endpoint (no body — approval requires no signature).
 */
export async function seedApprovedEstimate(
  request: APIRequestContext,
  siteMeasureId: number
): Promise<{ estimateId: number; approvalToken: string }> {
  const { estimateId } = await seedEstimateWithLineItem(request, siteMeasureId);
  const approvalToken = await getApprovalToken(request, estimateId);
  const res = await request.post(
    `/api/estimate-review/${approvalToken}/approve`
  );
  expect(res.status()).toBe(200);
  return { estimateId, approvalToken };
}

// ── invoices ─────────────────────────────────────────────────────────────────

/** Create an invoice for an estimate via the API (flat amount). */
export async function seedInvoice(
  request: APIRequestContext,
  estimateId: number,
  args: { amount?: number; pct?: number } = {}
): Promise<{ invoiceId: number }> {
  const data =
    args.amount !== undefined
      ? { amount: args.amount }
      : { pct: args.pct ?? 0.5 };
  const res = await request.post(`/api/estimates/${estimateId}/invoices`, {
    data,
  });
  expect(res.status()).toBe(201);
  const invoice = await res.json();
  return { invoiceId: invoice.id };
}

/** Seed an estimate and drive it to declined via the public decline endpoint. */
export async function seedDeclinedEstimate(
  request: APIRequestContext,
  siteMeasureId: number,
  reason = "Too expensive"
): Promise<{ estimateId: number; approvalToken: string }> {
  const { estimateId } = await seedEstimateWithLineItem(request, siteMeasureId);
  const approvalToken = await getApprovalToken(request, estimateId);
  const res = await request.post(
    `/api/estimate-review/${approvalToken}/decline`,
    {
      data: { reason },
    }
  );
  expect(res.status()).toBe(200);
  return { estimateId, approvalToken };
}
