/**
 * The QBO sync engine: idempotent "ensure synced" operations + the task
 * runner. Everything here is port-based — `QboPort` (the API), `SyncStore`
 * (links + domain reads), `TaskStore` (the outbox) — so the engine never
 * imports Prisma or fetch and the reliability invariants run against
 * in-memory fakes (__tests__/lib/qbo/).
 *
 * The invariants (CONTEXT.md, QuickBooks Sync):
 *   1. Tasks are ensure-ops, not raw API calls — any order converges.
 *   2. Create-once: no create without first querying by natural key
 *      (DisplayName / DocNumber / PaymentRefNum) and adopting a match.
 *   3. (Enqueue-in-transaction lives in the repos, not here.)
 *   4. Sync never blocks a user action — callers run this via after()/cron.
 *   5. The runner is serial per org with capped exponential backoff.
 *   6. Auth death pauses the org's tasks; nothing is dropped.
 *   7. Stale SyncToken → re-read once, then retry.
 */

import { QboApiError } from "./client";
import { QboAuthDeadError } from "./connect";
import {
  buildQboCustomer,
  buildQboInvoice,
  buildQboPayment,
  type CustomerSyncSource,
  docNumberCandidates,
  type PaymentSyncSource,
  paymentRefNum,
  type QboCustomerBody,
  type QboInvoiceBody,
  type QboPaymentBody,
  type TaxableInvoiceSnapshot,
} from "./mapping";

export interface QboEntityRef {
  id: string;
  syncToken: string;
}

export interface QboPort {
  findCustomerByName(
    name: string
  ): Promise<(QboEntityRef & { displayName: string }) | null>;
  createCustomer(body: QboCustomerBody): Promise<QboEntityRef>;
  updateCustomer(
    body: QboCustomerBody & { Id: string; SyncToken: string }
  ): Promise<QboEntityRef>;
  readCustomer(id: string): Promise<QboEntityRef | null>;
  findInvoiceByDocNumber(
    docNumber: string
  ): Promise<(QboEntityRef & { customerId: string; totalAmt: number }) | null>;
  createInvoice(body: QboInvoiceBody): Promise<QboEntityRef>;
  readInvoice(id: string): Promise<QboEntityRef | null>;
  voidInvoice(id: string, syncToken: string): Promise<QboEntityRef>;
  findPaymentByRefNum(refNum: string): Promise<QboEntityRef | null>;
  createPayment(body: QboPaymentBody): Promise<QboEntityRef>;
  findItemByName(name: string): Promise<{ id: string } | null>;
  createItem(name: string): Promise<{ id: string }>;
}

export type QboEntityType = "customer" | "invoice" | "payment";

export interface InvoiceSyncSource {
  customerId: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  snapshot: TaxableInvoiceSnapshot | null;
}

export interface SyncStore {
  getLink(
    orgId: string,
    entityType: QboEntityType,
    entityId: number
  ): Promise<{ qboId: string; syncToken: string } | null>;
  saveLink(
    orgId: string,
    entityType: QboEntityType,
    entityId: number,
    ref: QboEntityRef
  ): Promise<void>;
  getItem(orgId: string): Promise<{ itemId: string | null; itemName: string }>;
  saveItemId(orgId: string, itemId: string): Promise<void>;
  getCustomerSource(
    orgId: string,
    customerId: number
  ): Promise<CustomerSyncSource | null>;
  getInvoiceSource(
    orgId: string,
    invoiceId: number
  ): Promise<InvoiceSyncSource | null>;
  getPaymentSource(
    orgId: string,
    paymentId: number
  ): Promise<{ invoiceId: number; source: PaymentSyncSource } | null>;
}

export interface SyncDeps {
  orgId: string;
  qbo: QboPort;
  store: SyncStore;
}

/** Suffix used when a DisplayName collides with an unrelated QBO
 *  customer/vendor/employee. */
function suffixedName(name: string): string {
  return `${name} (SqFt)`;
}

/** Invariant 7: on a stale SyncToken, re-read the entity once and retry. */
async function withStaleRetry<T>(
  attempt: (syncToken: string) => Promise<T>,
  firstToken: string,
  reread: () => Promise<QboEntityRef | null>
): Promise<T> {
  try {
    return await attempt(firstToken);
  } catch (err) {
    if (err instanceof QboApiError && err.kind === "stale_object") {
      const fresh = await reread();
      if (fresh) return attempt(fresh.syncToken);
    }
    throw err;
  }
}

/** Ensure the org's single Service item exists; adopt an existing item of
 *  the same name before creating (invariant 2). */
export async function ensureItem(deps: SyncDeps): Promise<string> {
  const { itemId, itemName } = await deps.store.getItem(deps.orgId);
  if (itemId) return itemId;
  const found = await deps.qbo.findItemByName(itemName);
  const item = found ?? (await deps.qbo.createItem(itemName));
  await deps.store.saveItemId(deps.orgId, item.id);
  return item.id;
}

/**
 * Dependency-semantics customer sync: an existing link is trusted as-is
 * (updates flow through syncCustomerTask). Adopts an exact DisplayName match
 * before creating; on a duplicate-name rejection, re-queries (create race)
 * then falls back to a suffixed name. Returns null when the customer no
 * longer exists (nothing to sync).
 */
export async function ensureCustomerSynced(
  deps: SyncDeps,
  customerId: number
): Promise<QboEntityRef | null> {
  const link = await deps.store.getLink(deps.orgId, "customer", customerId);
  if (link) return { id: link.qboId, syncToken: link.syncToken };

  const source = await deps.store.getCustomerSource(deps.orgId, customerId);
  if (!source) return null;

  const adopt = async (ref: QboEntityRef) => {
    await deps.store.saveLink(deps.orgId, "customer", customerId, ref);
    return ref;
  };

  const found = await deps.qbo.findCustomerByName(source.name);
  if (found) return adopt(found);

  try {
    return await adopt(await deps.qbo.createCustomer(buildQboCustomer(source)));
  } catch (err) {
    if (!(err instanceof QboApiError) || err.kind !== "duplicate_name") {
      throw err;
    }
    // Raced a concurrent create of the same customer name — adopt it…
    const raced = await deps.qbo.findCustomerByName(source.name);
    if (raced) return adopt(raced);
    // …or the name belongs to a vendor/employee: create under a suffix.
    return adopt(
      await deps.qbo.createCustomer(
        buildQboCustomer(source, suffixedName(source.name))
      )
    );
  }
}

/** Task-semantics customer sync: with a link, push current SqFt fields as a
 *  sparse update (stale-token safe); without one, full ensure. */
export async function syncCustomerTask(
  deps: SyncDeps,
  customerId: number
): Promise<void> {
  const link = await deps.store.getLink(deps.orgId, "customer", customerId);
  if (!link) {
    await ensureCustomerSynced(deps, customerId);
    return;
  }
  const source = await deps.store.getCustomerSource(deps.orgId, customerId);
  if (!source) return;

  const updated = await withStaleRetry(
    (syncToken) =>
      deps.qbo.updateCustomer({
        ...buildQboCustomer(source),
        Id: link.qboId,
        SyncToken: syncToken,
        sparse: true,
      }),
    link.syncToken,
    () => deps.qbo.readCustomer(link.qboId)
  );
  await deps.store.saveLink(deps.orgId, "customer", customerId, updated);
}

/** True when a QBO invoice found under one of our DocNumbers is plausibly
 *  OURS (a lost create) rather than a foreign invoice that happens to share
 *  the number: same customer and a matching total (pre- or post-tax). */
export function invoiceMatches(
  existing: { customerId: string; totalAmt: number },
  customerQboId: string,
  source: { amount: number; taxAmount: number }
): boolean {
  if (existing.customerId !== customerQboId) return false;
  const close = (a: number, b: number) => Math.abs(a - b) < 0.011;
  return (
    close(existing.totalAmt, source.amount) ||
    close(existing.totalAmt, source.amount + source.taxAmount)
  );
}

/**
 * Ensure a sent invoice exists in QBO, built from its frozen snapshot.
 * Skips (returns null) drafts-without-snapshot and voided invoices — the
 * void task owns those. Tries DocNumber candidates in order, adopting a
 * plausible match and skipping past foreign occupants (invariant 2).
 */
export async function ensureInvoiceSynced(
  deps: SyncDeps,
  invoiceId: number
): Promise<QboEntityRef | null> {
  const link = await deps.store.getLink(deps.orgId, "invoice", invoiceId);
  if (link) return { id: link.qboId, syncToken: link.syncToken };

  const source = await deps.store.getInvoiceSource(deps.orgId, invoiceId);
  if (!source?.snapshot || source.status === "void") return null;

  const customer = await ensureCustomerSynced(deps, source.customerId);
  if (!customer) {
    throw new Error(
      `Invoice ${invoiceId}: customer ${source.customerId} not found`
    );
  }
  const itemId = await ensureItem(deps);
  const taxAmount = source.snapshot.totals.taxAmount ?? 0;

  const adopt = async (ref: QboEntityRef) => {
    await deps.store.saveLink(deps.orgId, "invoice", invoiceId, ref);
    return ref;
  };

  for (const docNumber of docNumberCandidates(source.invoiceNumber)) {
    const existing = await deps.qbo.findInvoiceByDocNumber(docNumber);
    if (existing) {
      if (invoiceMatches(existing, customer.id, { ...source, taxAmount })) {
        return adopt(existing);
      }
      continue; // foreign invoice occupies this DocNumber — try the fallback
    }
    try {
      return await adopt(
        await deps.qbo.createInvoice(
          buildQboInvoice({
            snapshot: source.snapshot,
            customerQboId: customer.id,
            itemId,
            docNumber,
          })
        )
      );
    } catch (err) {
      if (err instanceof QboApiError && err.kind === "duplicate_docnum") {
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Invoice ${invoiceId}: every DocNumber candidate is taken in QBO`
  );
}

/** Ensure a recorded payment exists in QBO, linked to its invoice. Skips
 *  payments whose invoice is void (the refund-needed anomaly path stays in
 *  SqFt) or whose records no longer exist. */
export async function ensurePaymentSynced(
  deps: SyncDeps,
  paymentId: number
): Promise<QboEntityRef | null> {
  const link = await deps.store.getLink(deps.orgId, "payment", paymentId);
  if (link) return { id: link.qboId, syncToken: link.syncToken };

  const payment = await deps.store.getPaymentSource(deps.orgId, paymentId);
  if (!payment) return null;
  const invoiceSource = await deps.store.getInvoiceSource(
    deps.orgId,
    payment.invoiceId
  );
  if (!invoiceSource || invoiceSource.status === "void") return null;

  const invoice = await ensureInvoiceSynced(deps, payment.invoiceId);
  if (!invoice) return null;
  const customer = await deps.store.getLink(
    deps.orgId,
    "customer",
    invoiceSource.customerId
  );
  if (!customer) {
    throw new Error(`Payment ${paymentId}: customer link missing`);
  }

  const adopt = async (ref: QboEntityRef) => {
    await deps.store.saveLink(deps.orgId, "payment", paymentId, ref);
    return ref;
  };

  const found = await deps.qbo.findPaymentByRefNum(paymentRefNum(paymentId));
  if (found) return adopt(found);

  return adopt(
    await deps.qbo.createPayment(
      buildQboPayment({
        source: payment.source,
        customerQboId: customer.qboId,
        invoiceQboId: invoice.id,
      })
    )
  );
}

/** Void the QBO mirror of a voided SqFt invoice. A no-op when the invoice
 *  was never synced or is already gone. */
export async function ensureInvoiceVoided(
  deps: SyncDeps,
  invoiceId: number
): Promise<void> {
  const link = await deps.store.getLink(deps.orgId, "invoice", invoiceId);
  if (!link) return;
  const fresh = await deps.qbo.readInvoice(link.qboId);
  if (!fresh) return;
  const voided = await withStaleRetry(
    (syncToken) => deps.qbo.voidInvoice(link.qboId, syncToken),
    fresh.syncToken,
    () => deps.qbo.readInvoice(link.qboId)
  );
  await deps.store.saveLink(deps.orgId, "invoice", invoiceId, voided);
}

// ── Task runner ─────────────────────────────────────────────────────────────

export type QboTaskKind =
  | "sync_customer"
  | "sync_invoice"
  | "sync_payment"
  | "void_invoice";

export interface ClaimedTask {
  id: number;
  kind: QboTaskKind;
  entityId: number;
  attempts: number;
}

export interface TaskStore {
  /** Due pending tasks for the org, oldest first. */
  claimDue(orgId: string, now: Date, limit: number): Promise<ClaimedTask[]>;
  markDone(taskId: number): Promise<void>;
  markFailed(args: {
    taskId: number;
    error: string;
    attempts: number;
    nextAttemptAt: Date;
    terminal: boolean;
  }): Promise<void>;
  /** Auth death: pending tasks → paused_auth, connection → disconnected. */
  pauseOrg(orgId: string): Promise<void>;
  touchLastSynced(orgId: string, now: Date): Promise<void>;
}

export const MAX_TASK_ATTEMPTS = 10;

/** Exponential backoff in minutes: 2, 4, 8, … capped at 6h. */
export function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 360);
}

export function isAuthError(err: unknown): boolean {
  return (
    err instanceof QboAuthDeadError ||
    (err instanceof QboApiError && err.kind === "auth")
  );
}

export async function runTask(
  deps: SyncDeps,
  task: ClaimedTask
): Promise<void> {
  switch (task.kind) {
    case "sync_customer":
      await syncCustomerTask(deps, task.entityId);
      return;
    case "sync_invoice":
      await ensureInvoiceSynced(deps, task.entityId);
      return;
    case "sync_payment":
      await ensurePaymentSynced(deps, task.entityId);
      return;
    case "void_invoice":
      await ensureInvoiceVoided(deps, task.entityId);
      return;
  }
}

export interface RunResult {
  done: number;
  failed: number;
  paused: boolean;
}

/**
 * Process an org's due tasks serially (per-realm rate limits + refresh
 * safety). Failures back off individually; an auth-dead error pauses the
 * whole org and stops the loop (invariant 6). Never throws.
 */
export async function runDueTasksForOrg(
  deps: SyncDeps,
  tasks: TaskStore,
  opts: { now?: Date; limit?: number } = {}
): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const result: RunResult = { done: 0, failed: 0, paused: false };
  const due = await tasks.claimDue(deps.orgId, now, opts.limit ?? 25);

  for (const task of due) {
    try {
      await runTask(deps, task);
      await tasks.markDone(task.id);
      await tasks.touchLastSynced(deps.orgId, now);
      result.done += 1;
    } catch (err) {
      if (isAuthError(err)) {
        await tasks.pauseOrg(deps.orgId);
        result.paused = true;
        return result;
      }
      const attempts = task.attempts + 1;
      await tasks.markFailed({
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
        attempts,
        nextAttemptAt: new Date(
          now.getTime() + backoffMinutes(attempts) * 60_000
        ),
        terminal: attempts >= MAX_TASK_ATTEMPTS,
      });
      result.failed += 1;
    }
  }
  return result;
}
