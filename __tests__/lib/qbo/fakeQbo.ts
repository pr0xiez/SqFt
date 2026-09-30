/**
 * In-memory fake of the QBO realm + sync stores, used by the Tier A/B suites
 * (see specs/2026-07-23-qbo-sync-plan.md §10). The realm is stateful —
 * entities get ids and SyncTokens, natural-key queries work — and failures
 * inject per-call via `failNext`:
 *
 *   - "timeout"        → the mutation IS applied, then the call throws
 *                        (lost-response semantics; exercises invariant 2)
 *   - "duplicate_name" / "duplicate_docnum" / "stale_object" / "auth" /
 *     "throttle"       → typed QboApiError before any mutation
 *
 * `down = true` makes every call throw a plain network-ish error.
 */

import { QboApiError, type QboFaultKind } from "@/lib/qbo/client";
import type {
  CustomerSyncSource,
  PaymentSyncSource,
  QboCustomerBody,
  QboInvoiceBody,
  QboPaymentBody,
  TaxableInvoiceSnapshot,
} from "@/lib/qbo/mapping";
import type {
  ClaimedTask,
  InvoiceSyncSource,
  QboEntityRef,
  QboEntityType,
  QboPort,
  QboTaskKind,
  SyncStore,
  TaskStore,
} from "@/lib/qbo/sync";

type FailKind = QboFaultKind | "timeout";

interface FakeCustomer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
}

interface FakeInvoice {
  Id: string;
  SyncToken: string;
  DocNumber: string;
  CustomerRef: string;
  TotalAmt: number;
  voided: boolean;
  body: QboInvoiceBody;
}

interface FakePayment {
  Id: string;
  SyncToken: string;
  PaymentRefNum: string;
  body: QboPaymentBody;
}

export class FakeQbo implements QboPort {
  customers: FakeCustomer[] = [];
  invoices: FakeInvoice[] = [];
  payments: FakePayment[] = [];
  items: Array<{ Id: string; Name: string }> = [];
  calls: string[] = [];
  down = false;

  private nextId = 1;
  private failures: Array<{ kind: FailKind; op?: string }> = [];

  /** Arm a failure for the next call — or, with `op`, for the next call to
   *  that specific operation (queries run before creates, so target the op
   *  you mean to break). */
  failNext(kind: FailKind, op?: string): void {
    this.failures.push({ kind, op });
  }

  /** Simulate an out-of-band QBO-side edit (bumps the entity's SyncToken). */
  bumpCustomerSyncToken(id: string): void {
    const c = this.customers.find((x) => x.Id === id);
    if (c) c.SyncToken = String(Number(c.SyncToken) + 1);
  }

  private id(): string {
    return String(this.nextId++);
  }

  private fault(kind: QboFaultKind): never {
    throw new QboApiError({
      kind,
      status: kind === "auth" ? 401 : kind === "throttle" ? 429 : 400,
      message: `fake ${kind}`,
    });
  }

  /** Runs before each op; applies `down` and non-timeout armed failures.
   *  Returns true when a "timeout" is armed (throw AFTER mutating). */
  private gate(op: string): boolean {
    this.calls.push(op);
    if (this.down) throw new Error("fake network down");
    const next = this.failures[0];
    if (next === undefined) return false;
    if (next.op !== undefined && next.op !== op) return false;
    this.failures.shift();
    if (next.kind === "timeout") return true;
    this.fault(next.kind);
  }

  async findCustomerByName(name: string) {
    this.gate("findCustomerByName");
    const c = this.customers.find((x) => x.DisplayName === name);
    return c
      ? { id: c.Id, syncToken: c.SyncToken, displayName: c.DisplayName }
      : null;
  }

  async createCustomer(body: QboCustomerBody): Promise<QboEntityRef> {
    const timeout = this.gate("createCustomer");
    if (this.customers.some((c) => c.DisplayName === body.DisplayName)) {
      this.fault("duplicate_name");
    }
    const c: FakeCustomer = {
      Id: this.id(),
      SyncToken: "0",
      DisplayName: body.DisplayName,
    };
    this.customers.push(c);
    if (timeout) throw new Error("fake timeout after create");
    return { id: c.Id, syncToken: c.SyncToken };
  }

  async updateCustomer(
    body: QboCustomerBody & { Id: string; SyncToken: string }
  ): Promise<QboEntityRef> {
    this.gate("updateCustomer");
    const c = this.customers.find((x) => x.Id === body.Id);
    if (!c) this.fault("not_found");
    if (c.SyncToken !== body.SyncToken) this.fault("stale_object");
    if (body.DisplayName) c.DisplayName = body.DisplayName;
    c.SyncToken = String(Number(c.SyncToken) + 1);
    return { id: c.Id, syncToken: c.SyncToken };
  }

  async readCustomer(id: string): Promise<QboEntityRef | null> {
    this.gate("readCustomer");
    const c = this.customers.find((x) => x.Id === id);
    return c ? { id: c.Id, syncToken: c.SyncToken } : null;
  }

  async findInvoiceByDocNumber(docNumber: string) {
    this.gate("findInvoiceByDocNumber");
    const inv = this.invoices.find(
      (x) => x.DocNumber === docNumber && !x.voided
    );
    return inv
      ? {
          id: inv.Id,
          syncToken: inv.SyncToken,
          customerId: inv.CustomerRef,
          totalAmt: inv.TotalAmt,
        }
      : null;
  }

  async createInvoice(body: QboInvoiceBody): Promise<QboEntityRef> {
    const timeout = this.gate("createInvoice");
    const total =
      body.Line.reduce((s, l) => s + l.Amount, 0) +
      (body.TxnTaxDetail?.TotalTax ?? 0);
    const inv: FakeInvoice = {
      Id: this.id(),
      SyncToken: "0",
      DocNumber: body.DocNumber,
      CustomerRef: body.CustomerRef.value,
      TotalAmt: total,
      voided: false,
      body,
    };
    this.invoices.push(inv);
    if (timeout) throw new Error("fake timeout after create");
    return { id: inv.Id, syncToken: inv.SyncToken };
  }

  async readInvoice(id: string): Promise<QboEntityRef | null> {
    this.gate("readInvoice");
    const inv = this.invoices.find((x) => x.Id === id);
    return inv ? { id: inv.Id, syncToken: inv.SyncToken } : null;
  }

  async readInvoiceBalance(id: string) {
    const invoice = this.invoices.find((x) => x.Id === id);
    if (!invoice) throw new Error("Invoice not found");
    const applied = this.payments.reduce(
      (sum, payment) =>
        sum +
        payment.body.Line.reduce(
          (lineSum, line) =>
            lineSum +
            (line.LinkedTxn.some((txn) => txn.TxnId === id) ? line.Amount : 0),
          0
        ),
      0
    );
    return Math.max(0, invoice.TotalAmt - applied);
  }

  async voidInvoice(id: string, syncToken: string): Promise<QboEntityRef> {
    this.gate("voidInvoice");
    const inv = this.invoices.find((x) => x.Id === id);
    if (!inv) this.fault("not_found");
    if (inv.SyncToken !== syncToken) this.fault("stale_object");
    inv.voided = true;
    inv.SyncToken = String(Number(inv.SyncToken) + 1);
    return { id: inv.Id, syncToken: inv.SyncToken };
  }

  async findPaymentByRefNum(refNum: string) {
    this.gate("findPaymentByRefNum");
    const p = this.payments.find((x) => x.PaymentRefNum === refNum);
    return p ? { id: p.Id, syncToken: p.SyncToken } : null;
  }

  async createPayment(body: QboPaymentBody): Promise<QboEntityRef> {
    const timeout = this.gate("createPayment");
    const p: FakePayment = {
      Id: this.id(),
      SyncToken: "0",
      PaymentRefNum: body.PaymentRefNum,
      body,
    };
    this.payments.push(p);
    if (timeout) throw new Error("fake timeout after create");
    return { id: p.Id, syncToken: p.SyncToken };
  }

  async findItemByName(name: string) {
    this.gate("findItemByName");
    const item = this.items.find((x) => x.Name === name);
    return item ? { id: item.Id } : null;
  }

  async createItem(name: string) {
    this.gate("createItem");
    const item = { Id: this.id(), Name: name };
    this.items.push(item);
    return { id: item.Id };
  }
}

// ── Fake stores ─────────────────────────────────────────────────────────────

export interface FakeTaskRow {
  id: number;
  orgId: string;
  kind: QboTaskKind;
  entityId: number;
  status: "pending" | "done" | "failed" | "paused_auth";
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
}

export class FakeStores implements SyncStore, TaskStore {
  links = new Map<string, { qboId: string; syncToken: string }>();
  item: { itemId: string | null; itemName: string } = {
    itemId: null,
    itemName: "Flooring services",
  };
  customers = new Map<number, CustomerSyncSource>();
  invoices = new Map<number, InvoiceSyncSource>();
  payments = new Map<
    number,
    { invoiceId: number; source: PaymentSyncSource }
  >();
  tasks: FakeTaskRow[] = [];
  connectionStatus: "active" | "disconnected" = "active";
  lastSyncedAt: Date | null = null;

  private nextTaskId = 1;

  private key(orgId: string, type: QboEntityType, id: number): string {
    return `${orgId}:${type}:${id}`;
  }

  async getLink(orgId: string, type: QboEntityType, id: number) {
    return this.links.get(this.key(orgId, type, id)) ?? null;
  }

  async saveLink(
    orgId: string,
    type: QboEntityType,
    id: number,
    ref: QboEntityRef
  ) {
    const owner = await this.findLinkedEntity(orgId, type, ref.id);
    if (owner !== null && owner !== id) throw new Error("Duplicate QBO link");
    this.links.set(this.key(orgId, type, id), {
      qboId: ref.id,
      syncToken: ref.syncToken,
    });
  }

  async findLinkedEntity(orgId: string, type: QboEntityType, qboId: string) {
    for (const [key, link] of this.links)
      if (key.startsWith(`${orgId}:${type}:`) && link.qboId === qboId)
        return Number(key.split(":").at(-1));
    return null;
  }

  async getItem() {
    return this.item;
  }

  async saveItemId(_orgId: string, itemId: string) {
    this.item.itemId = itemId;
  }

  async getCustomerSource(_orgId: string, customerId: number) {
    return this.customers.get(customerId) ?? null;
  }

  async getInvoiceSource(_orgId: string, invoiceId: number) {
    return this.invoices.get(invoiceId) ?? null;
  }

  async getPaymentSource(_orgId: string, paymentId: number) {
    return this.payments.get(paymentId) ?? null;
  }

  /** Mirrors the real upsert: re-enqueueing an existing row RESETS it (this
   *  is what a mid-flight admin edit does to a claimed task). */
  enqueue(orgId: string, kind: QboTaskKind, entityId: number): FakeTaskRow {
    const existing = this.tasks.find(
      (t) => t.orgId === orgId && t.kind === kind && t.entityId === entityId
    );
    if (existing) {
      existing.status = "pending";
      existing.attempts = 0;
      existing.lastError = null;
      existing.nextAttemptAt = new Date(0);
      return existing;
    }
    const row: FakeTaskRow = {
      id: this.nextTaskId++,
      orgId,
      kind,
      entityId,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(0),
      lastError: null,
    };
    this.tasks.push(row);
    return row;
  }

  async claimDue(orgId: string, now: Date, limit: number) {
    // Mirrors the real store's lease semantics: claiming advances
    // nextAttemptAt so a concurrent claimer skips the same task.
    const lease = new Date(now.getTime() + 6 * 60_000);
    const due = this.tasks
      .filter(
        (t) =>
          t.orgId === orgId &&
          t.status === "pending" &&
          t.nextAttemptAt.getTime() <= now.getTime()
      )
      .slice(0, limit);
    for (const t of due) {
      t.nextAttemptAt = lease;
    }
    return due.map(
      (t): ClaimedTask => ({
        id: t.id,
        kind: t.kind,
        entityId: t.entityId,
        attempts: t.attempts,
        leaseUntil: lease,
      })
    );
  }

  /** Fenced like the real store: a row re-enqueued while the claim was in
   *  flight (attempts/lease mismatch) keeps its fresh pending intent. */
  private claimStillHeld(task: ClaimedTask): FakeTaskRow | null {
    const t = this.tasks.find((x) => x.id === task.id);
    if (!t) return null;
    if (
      t.status !== "pending" ||
      t.attempts !== task.attempts ||
      t.nextAttemptAt.getTime() !== task.leaseUntil.getTime()
    ) {
      return null;
    }
    return t;
  }

  async markDone(task: ClaimedTask, note?: string) {
    const t = this.claimStillHeld(task);
    if (!t) return;
    t.status = "done";
    t.lastError = note ?? null;
  }

  async markFailed(args: {
    task: ClaimedTask;
    error: string;
    attempts: number;
    nextAttemptAt: Date;
    terminal: boolean;
  }) {
    const t = this.claimStillHeld(args.task);
    if (!t) return;
    t.attempts = args.attempts;
    t.lastError = args.error;
    t.nextAttemptAt = args.nextAttemptAt;
    t.status = args.terminal ? "failed" : "pending";
  }

  async pauseOrg(orgId: string) {
    this.connectionStatus = "disconnected";
    for (const t of this.tasks) {
      if (t.orgId === orgId && t.status === "pending") {
        t.status = "paused_auth";
      }
    }
  }

  /** Reconnect-to-same-realm semantics: paused tasks re-arm. */
  rearm(orgId: string) {
    this.connectionStatus = "active";
    for (const t of this.tasks) {
      if (t.orgId === orgId && t.status === "paused_auth") {
        t.status = "pending";
        t.nextAttemptAt = new Date(0);
      }
    }
  }

  async touchLastSynced(_orgId: string, now: Date) {
    this.lastSyncedAt = now;
  }
}
