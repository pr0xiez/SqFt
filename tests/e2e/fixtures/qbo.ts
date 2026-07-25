/**
 * QBO E2E helpers. These specs run only when the target deployment serves
 * the mock realm (QBO_ENVIRONMENT=mock + QBO_* creds set) — `mockRealmEnabled`
 * probes it and the specs skip cleanly otherwise, so CI stays green on
 * deployments where the mock env isn't configured yet.
 */
import { type BrowserContext, expect, type Page } from "@playwright/test";

export async function mockRealmEnabled(ctx: BrowserContext): Promise<boolean> {
  const res = await ctx.request.get(
    "/api/qbo-mock/authorize?redirect_uri=https%3A%2F%2Fexample.test&state=probe"
  );
  return res.status() === 200;
}

/** Drive the full connect flow through the mock authorize page. Returns the
 *  realm id the org landed on (for /api/qbo-mock/state assertions). */
export async function connectQboViaMock(
  ctx: BrowserContext,
  page: Page
): Promise<string> {
  await page.goto("/settings/integrations");
  await page.getByRole("button", { name: "Connect to QuickBooks" }).click();
  await page.locator("#qbo-mock-authorize").click();
  await page.waitForURL(/\/settings\/integrations/);
  await expect(page.getByText("Mock Flooring Co")).toBeVisible();

  const status = await (await ctx.request.get("/api/qbo/status")).json();
  const realmId: string | undefined = status?.connection?.realmId;
  expect(realmId).toBeTruthy();
  return realmId as string;
}

export interface MockRealmState {
  customers: Array<{ Id: string; DisplayName?: string }>;
  invoices: Array<{
    Id: string;
    DocNumber?: string;
    TotalAmt?: number;
    voided?: boolean;
  }>;
  payments: Array<{
    Id: string;
    TotalAmt?: number;
    PaymentRefNum?: string;
    Line?: Array<{ LinkedTxn?: Array<{ TxnId: string }> }>;
  }>;
}

export async function readMockRealm(
  ctx: BrowserContext,
  realmId: string
): Promise<MockRealmState> {
  const res = await ctx.request.get(
    `/api/qbo-mock/state?realmId=${encodeURIComponent(realmId)}`
  );
  return (await res.json()) as MockRealmState;
}

/** Poll the invoice detail payload until its QBO badge reaches `state`.
 *  Each poll of /api/qbo/status also kicks the org's due tasks (the
 *  status route sweeps opportunistically), so retries drain the queue. */
export async function waitForQboState(
  ctx: BrowserContext,
  invoiceId: number,
  state: "synced" | "failed",
  timeoutMs = 30_000
): Promise<void> {
  await expect
    .poll(
      async () => {
        await ctx.request.get("/api/qbo/status");
        const res = await ctx.request.get(`/api/invoices/${invoiceId}`);
        const body = await res.json();
        const state = body?.qboSync?.state ?? "none";
        if (process.env.QBO_E2E_DEBUG) {
          console.log(`qboSync poll: ${JSON.stringify(body?.qboSync)}`);
        }
        return state;
      },
      { timeout: timeoutMs, intervals: [500, 1000, 2000] }
    )
    .toBe(state);
}
