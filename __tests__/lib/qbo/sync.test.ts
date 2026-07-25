/**
 * Tier B: the sync engine against the in-memory FakeQbo realm. Each test in
 * the "invariants" blocks pins a numbered reliability invariant from the
 * QuickBooks Sync section of CONTEXT.md — if one of these regresses, the
 * duplicate-entry / lost-intent failure modes competitors are hated for
 * come back.
 */

import { describe, expect, it } from "vitest";
import {
  backoffMinutes,
  ensureInvoiceSynced,
  ensureInvoiceVoided,
  ensurePaymentSynced,
  invoiceMatches,
  MAX_TASK_ATTEMPTS,
  runDueTasksForOrg,
  type SyncDeps,
} from "@/lib/qbo/sync";
import { FakeQbo, FakeStores } from "./fakeQbo";
import { makeSnapshot } from "./fixtures";

const ORG = "org_1";

function setup() {
  const qbo = new FakeQbo();
  const stores = new FakeStores();
  const deps: SyncDeps = { orgId: ORG, qbo, store: stores };

  stores.customers.set(7, {
    name: "Sam Waters",
    email: "sam@example.com",
    phone: null,
    address: "1 Main St",
  });
  stores.invoices.set(42, {
    customerId: 7,
    invoiceNumber: 42,
    status: "sent",
    amount: 450,
    snapshot: makeSnapshot(),
  });
  stores.payments.set(9, {
    invoiceId: 42,
    source: {
      paymentId: 9,
      amount: 200,
      paidAt: "2026-07-02T00:00:00.000Z",
      method: "check",
      reference: "1042",
    },
  });
  return { qbo, stores, deps };
}

describe("invariant 1 — ensure-ops converge in any order", () => {
  it("a payment task run before any invoice/customer task syncs the whole chain", async () => {
    const { qbo, stores, deps } = setup();
    const ref = await ensurePaymentSynced(deps, 9);

    expect(ref).not.toBeNull();
    expect(qbo.customers).toHaveLength(1);
    expect(qbo.invoices).toHaveLength(1);
    expect(qbo.payments).toHaveLength(1);
    expect(qbo.payments[0].body.Line[0].LinkedTxn[0].TxnId).toBe(
      qbo.invoices[0].Id
    );
    for (const key of ["customer:7", "invoice:42", "payment:9"]) {
      expect(stores.links.has(`${ORG}:${key}`)).toBe(true);
    }
  });

  it("re-running an already-synced task creates nothing new", async () => {
    const { qbo, deps } = setup();
    await ensurePaymentSynced(deps, 9);
    const creates = qbo.calls.filter((c) => c.startsWith("create")).length;
    await ensurePaymentSynced(deps, 9);
    await ensureInvoiceSynced(deps, 42);
    expect(qbo.calls.filter((c) => c.startsWith("create")).length).toBe(
      creates
    );
  });
});

describe("invariant 2 — query-before-create, never a duplicate", () => {
  it("timeout after the create POST → the retry adopts, realm has exactly one invoice", async () => {
    const { qbo, stores, deps } = setup();
    // Sync the customer + item first so the armed timeout lands on the
    // invoice create, not an upstream dependency create.
    const { ensureCustomerSynced, ensureItem } = await import("@/lib/qbo/sync");
    await ensureCustomerSynced(deps, 7);
    await ensureItem(deps);

    qbo.failNext("timeout", "createInvoice"); // mutation applies, response lost
    await expect(ensureInvoiceSynced(deps, 42)).rejects.toThrow("timeout");
    expect(stores.links.has(`${ORG}:invoice:42`)).toBe(false);

    // The retry queries by DocNumber, finds the orphaned create, adopts it.
    const ref = await ensureInvoiceSynced(deps, 42);
    expect(ref).not.toBeNull();
    expect(qbo.invoices).toHaveLength(1);
    expect(stores.links.get(`${ORG}:invoice:42`)?.qboId).toBe(
      qbo.invoices[0].Id
    );
  });

  it("adopts an existing QBO customer by exact DisplayName instead of creating", async () => {
    const { qbo, deps } = setup();
    await qbo.createCustomer({ DisplayName: "Sam Waters" });
    qbo.calls.length = 0;
    await ensureInvoiceSynced(deps, 42);
    expect(qbo.customers).toHaveLength(1);
    expect(qbo.calls).not.toContain("createCustomer");
  });

  it("duplicate DisplayName owned by a vendor → creates under a suffixed name", async () => {
    const { qbo, deps } = setup();
    // No customer named Sam Waters exists, but create rejects (vendor owns it).
    qbo.failNext("duplicate_name", "createCustomer");
    const { ensureCustomerSynced } = await import("@/lib/qbo/sync");
    const ref = await ensureCustomerSynced(deps, 7);
    expect(ref).not.toBeNull();
    expect(qbo.customers.map((c) => c.DisplayName)).toEqual([
      "Sam Waters (SqFt)",
    ]);
  });

  it("a foreign invoice occupying our DocNumber is skipped, not adopted", async () => {
    const { qbo, stores, deps } = setup();
    // Another company's invoice #42: different customer, different total.
    await qbo.createCustomer({ DisplayName: "Somebody Else" });
    await qbo.createInvoice({
      DocNumber: "42",
      TxnDate: "2026-01-01",
      CustomerRef: { value: qbo.customers[0].Id },
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: 9999,
          SalesItemLineDetail: { ItemRef: { value: "1" } },
        },
      ],
    });
    const ref = await ensureInvoiceSynced(deps, 42);
    expect(ref).not.toBeNull();
    const ours = qbo.invoices.find(
      (i) => i.Id === stores.links.get(`${ORG}:invoice:42`)?.qboId
    );
    expect(ours?.DocNumber).toBe("SQFT-42");
    expect(ours?.TotalAmt).toBe(450);
  });

  it("re-running a payment after a timeout adopts by PaymentRefNum", async () => {
    const { qbo, stores, deps } = setup();
    await ensureInvoiceSynced(deps, 42);
    qbo.failNext("timeout", "createPayment");
    await expect(ensurePaymentSynced(deps, 9)).rejects.toThrow("timeout");
    const ref = await ensurePaymentSynced(deps, 9);
    expect(ref).not.toBeNull();
    expect(qbo.payments).toHaveLength(1);
    expect(stores.links.get(`${ORG}:payment:9`)?.qboId).toBe(
      qbo.payments[0].Id
    );
  });
});

describe("invariant 5 — the sweeper converges with backoff", () => {
  it("failing tasks back off, then succeed once the realm heals", async () => {
    const { qbo, stores, deps } = setup();
    stores.enqueue(ORG, "sync_invoice", 42);
    stores.enqueue(ORG, "sync_payment", 9);

    qbo.down = true;
    const first = await runDueTasksForOrg(deps, stores, {
      now: new Date("2026-07-10T00:00:00Z"),
    });
    expect(first).toMatchObject({ done: 0, failed: 2, paused: false });
    for (const t of stores.tasks) {
      expect(t.status).toBe("pending");
      expect(t.attempts).toBe(1);
      expect(t.lastError).toContain("down");
    }

    // Not yet due → nothing runs.
    qbo.down = false;
    const early = await runDueTasksForOrg(deps, stores, {
      now: new Date("2026-07-10T00:01:00Z"),
    });
    expect(early).toMatchObject({ done: 0, failed: 0 });

    // Past the 2-minute backoff → both sync.
    const later = await runDueTasksForOrg(deps, stores, {
      now: new Date("2026-07-10T00:05:00Z"),
    });
    expect(later).toMatchObject({ done: 2, failed: 0 });
    expect(stores.tasks.every((t) => t.status === "done")).toBe(true);
    expect(stores.lastSyncedAt).not.toBeNull();
  });

  it("a task goes terminal-failed after MAX_TASK_ATTEMPTS", async () => {
    const { qbo, stores, deps } = setup();
    const row = stores.enqueue(ORG, "sync_invoice", 42);
    row.attempts = MAX_TASK_ATTEMPTS - 1;
    qbo.down = true;
    await runDueTasksForOrg(deps, stores, { now: new Date() });
    expect(row.status).toBe("failed");
  });

  it("backoff doubles and caps at 6 hours", () => {
    expect(backoffMinutes(1)).toBe(2);
    expect(backoffMinutes(3)).toBe(8);
    expect(backoffMinutes(20)).toBe(360);
  });
});

describe("invariant 6 — auth death pauses, never drops", () => {
  it("an auth error pauses the org's tasks and stops the loop; reconnect re-arms", async () => {
    const { qbo, stores, deps } = setup();
    stores.enqueue(ORG, "sync_invoice", 42);
    stores.enqueue(ORG, "sync_payment", 9);

    qbo.failNext("auth");
    const result = await runDueTasksForOrg(deps, stores, { now: new Date() });
    expect(result.paused).toBe(true);
    expect(stores.connectionStatus).toBe("disconnected");
    expect(stores.tasks.every((t) => t.status === "paused_auth")).toBe(true);

    stores.rearm(ORG);
    const after = await runDueTasksForOrg(deps, stores, { now: new Date() });
    expect(after).toMatchObject({ done: 2, failed: 0, paused: false });
  });
});

describe("invariant 7 — stale SyncToken re-reads once and retries", () => {
  it("customer sparse update survives a QBO-side edit", async () => {
    const { qbo, stores, deps } = setup();
    const { ensureCustomerSynced, syncCustomerTask } = await import(
      "@/lib/qbo/sync"
    );
    const ref = await ensureCustomerSynced(deps, 7);
    expect(ref).not.toBeNull();
    if (!ref) throw new Error("unreachable");

    // Someone edits the customer inside QBO → our stored SyncToken is stale.
    qbo.bumpCustomerSyncToken(ref.id);
    stores.customers.set(7, {
      name: "Sam W. Waters",
      email: "sam@example.com",
      phone: null,
      address: "1 Main St",
    });
    await syncCustomerTask(deps, 7);

    const updated = qbo.customers.find((c) => c.Id === ref.id);
    expect(updated?.DisplayName).toBe("Sam W. Waters");
    expect(stores.links.get(`${ORG}:customer:7`)?.syncToken).toBe(
      updated?.SyncToken
    );
  });
});

describe("void + skip semantics", () => {
  it("voiding an invoice that was never synced is a completed no-op", async () => {
    const { qbo, deps } = setup();
    await ensureInvoiceVoided(deps, 42);
    expect(qbo.calls).not.toContain("voidInvoice");
  });

  it("voiding a synced invoice voids the QBO mirror", async () => {
    const { qbo, deps } = setup();
    await ensureInvoiceSynced(deps, 42);
    await ensureInvoiceVoided(deps, 42);
    expect(qbo.invoices[0].voided).toBe(true);
  });

  it("a payment on a voided invoice is skipped (stays a SqFt anomaly)", async () => {
    const { qbo, stores, deps } = setup();
    const invoiceSource = await stores.getInvoiceSource(ORG, 42);
    if (!invoiceSource) throw new Error("fixture missing");
    stores.invoices.set(42, { ...invoiceSource, status: "void" });
    const ref = await ensurePaymentSynced(deps, 9);
    expect(ref).toBeNull();
    expect(qbo.payments).toHaveLength(0);
  });

  it("a voided-in-SqFt invoice is never created in QBO by a late sync task", async () => {
    const { qbo, stores, deps } = setup();
    const invoiceSource = await stores.getInvoiceSource(ORG, 42);
    if (!invoiceSource) throw new Error("fixture missing");
    stores.invoices.set(42, { ...invoiceSource, status: "void" });
    const ref = await ensureInvoiceSynced(deps, 42);
    expect(ref).toBeNull();
    expect(qbo.invoices).toHaveLength(0);
  });
});

describe("invoiceMatches", () => {
  const existing = { customerId: "5", totalAmt: 450 };
  it("matches same customer + same total", () => {
    expect(invoiceMatches(existing, "5", { amount: 450, taxAmount: 0 })).toBe(
      true
    );
  });
  it("matches a tax-inclusive total", () => {
    expect(
      invoiceMatches({ ...existing, totalAmt: 481.5 }, "5", {
        amount: 450,
        taxAmount: 31.5,
      })
    ).toBe(true);
  });
  it("rejects a different customer or total", () => {
    expect(invoiceMatches(existing, "6", { amount: 450, taxAmount: 0 })).toBe(
      false
    );
    expect(invoiceMatches(existing, "5", { amount: 999, taxAmount: 0 })).toBe(
      false
    );
  });
});
