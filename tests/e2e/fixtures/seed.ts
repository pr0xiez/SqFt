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

// ── customer / estimate ──────────────────────────────────────────────────────

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

export async function createEstimate(
  request: APIRequestContext,
  customerId: number
): Promise<{ id: number }> {
  const res = await request.post("/api/estimates", { data: { customerId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function createCustomerAndEstimate(
  request: APIRequestContext
): Promise<{ customerId: number; estimateId: number }> {
  const customer = await createCustomer(request);
  const estimate = await createEstimate(request, customer.id);
  return { customerId: customer.id, estimateId: estimate.id };
}

/**
 * Seed an estimate with two rect rooms (Kitchen 12×10=120 sqft, Dining 10×8=80
 * sqft). The PATCH renumbers item ids server-side, so we read them back.
 */
export async function seedEstimateWithRooms(
  request: APIRequestContext
): Promise<{ estimateId: number; kitchenId: number; diningId: number }> {
  const customer = await createCustomer(request, { name: "Quote Customer" });
  const estimate = await createEstimate(request, customer.id);

  await request.patch(`/api/estimates/${estimate.id}`, {
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

  const res = await request.get(`/api/estimates/${estimate.id}`);
  const fetched = await res.json();
  const rooms = (
    fetched.items as Array<{ id: number; name: string; type: string }>
  ).filter((i) => i.type === "room");
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const dining = rooms.find((r) => r.name === "Dining");
  if (!kitchen || !dining)
    throw new Error("seed estimate missing expected rooms");
  return {
    estimateId: estimate.id,
    kitchenId: kitchen.id,
    diningId: dining.id,
  };
}

// ── quote ────────────────────────────────────────────────────────────────────

export async function createQuote(
  request: APIRequestContext,
  estimateId: number
): Promise<{ id: number }> {
  const res = await request.post("/api/quotes", { data: { estimateId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Seed a draft quote on `estimateId` with one manual line item. The PATCH
 * renumbers line item ids, so we read them back.
 */
export async function seedQuoteWithLineItem(
  request: APIRequestContext,
  estimateId: number
): Promise<{ quoteId: number; lineItemId: number }> {
  const quote = await createQuote(request, estimateId);
  await request.patch(`/api/quotes/${quote.id}`, {
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
  const res = await request.get(`/api/quotes/${quote.id}`);
  const fetched = await res.json();
  const li = (fetched.lineItems as Array<{ id: number; name: string }>).find(
    (i) => i.name === "Engineered hardwood"
  );
  if (!li) throw new Error("seed quote missing expected line item");
  return { quoteId: quote.id, lineItemId: li.id };
}

/** Rotate (and obtain) the public approval token for a quote. */
export async function getApprovalToken(
  request: APIRequestContext,
  quoteId: number
): Promise<string> {
  const res = await request.post(`/api/quotes/${quoteId}/approval-token`);
  expect(res.ok()).toBeTruthy();
  const { approvalToken } = (await res.json()) as { approvalToken: string };
  return approvalToken;
}

// Smallest valid 1×1 transparent PNG — accept route requires
// "data:image/png;base64,…" and ≤100KB decoded. This is ~70 bytes.
export const TEST_SIGNATURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Seed a quote and drive it to accepted via the public accept endpoint.
 * Uses a tiny PNG signature to satisfy the accept route's schema.
 */
export async function seedAcceptedQuote(
  request: APIRequestContext,
  estimateId: number
): Promise<{ quoteId: number; approvalToken: string }> {
  const { quoteId } = await seedQuoteWithLineItem(request, estimateId);
  const approvalToken = await getApprovalToken(request, quoteId);
  const res = await request.post(`/api/q/${approvalToken}/accept`, {
    data: {
      name: "Test Customer",
      email: "customer@example.com",
      signatureDataUrl: TEST_SIGNATURE_PNG,
      consentText: "I agree to the terms.",
    },
  });
  expect(res.status()).toBe(200);
  return { quoteId, approvalToken };
}

/** Seed a quote and drive it to declined via the public decline endpoint. */
export async function seedDeclinedQuote(
  request: APIRequestContext,
  estimateId: number,
  reason = "Too expensive"
): Promise<{ quoteId: number; approvalToken: string }> {
  const { quoteId } = await seedQuoteWithLineItem(request, estimateId);
  const approvalToken = await getApprovalToken(request, quoteId);
  const res = await request.post(`/api/q/${approvalToken}/decline`, {
    data: { reason },
  });
  expect(res.status()).toBe(200);
  return { quoteId, approvalToken };
}
