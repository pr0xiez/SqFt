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

export async function createSiteMeasure(
  request: APIRequestContext,
  customerId: number
): Promise<{ id: number }> {
  const res = await request.post("/api/site-measures", {
    data: { customerId },
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

// Smallest valid 1×1 transparent PNG — accept route requires
// "data:image/png;base64,…" and ≤100KB decoded. This is ~70 bytes.
export const TEST_SIGNATURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Seed a estimate and drive it to accepted via the public accept endpoint.
 * Uses a tiny PNG signature to satisfy the accept route's schema.
 */
export async function seedAcceptedEstimate(
  request: APIRequestContext,
  siteMeasureId: number
): Promise<{ estimateId: number; approvalToken: string }> {
  const { estimateId } = await seedEstimateWithLineItem(request, siteMeasureId);
  const approvalToken = await getApprovalToken(request, estimateId);
  const res = await request.post(`/api/q/${approvalToken}/accept`, {
    data: {
      name: "Test Customer",
      email: "customer@example.com",
      signatureDataUrl: TEST_SIGNATURE_PNG,
      consentText: "I agree to the terms.",
    },
  });
  expect(res.status()).toBe(200);
  return { estimateId, approvalToken };
}

/** Seed a estimate and drive it to declined via the public decline endpoint. */
export async function seedDeclinedEstimate(
  request: APIRequestContext,
  siteMeasureId: number,
  reason = "Too expensive"
): Promise<{ estimateId: number; approvalToken: string }> {
  const { estimateId } = await seedEstimateWithLineItem(request, siteMeasureId);
  const approvalToken = await getApprovalToken(request, estimateId);
  const res = await request.post(`/api/q/${approvalToken}/decline`, {
    data: { reason },
  });
  expect(res.status()).toBe(200);
  return { estimateId, approvalToken };
}
