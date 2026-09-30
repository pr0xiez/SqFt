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
  readInvoiceBalance(id: string): Promise<number>;
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
  findLinkedEntity(
    orgId: string,
    entityType: QboEntityType,
    qboId: string
  ): Promise<number | null>;
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

/** Stable identity keeps namesakes and unrelated existing customers separate. */
export function customerDisplayName(name: string, customerId: number): string {
  const suffix = ` (SqFt #${customerId})`;
  return `${name.slice(0, 100 - suffix.length)}${suffix}`;
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
 * before creating; on a duplicate-name rejection, re-queries (create race).
 * An unresolved collision fails visibly. Returns null when the customer no
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
    const owner = await deps.store.findLinkedEntity(
      deps.orgId,
      "customer",
      ref.id
    );
    if (owner !== null && owner !== customerId)
      throw new Error(
        "QuickBooks customer is already linked to another SqFt customer"
      );
    await deps.store.saveLink(deps.orgId, "customer", customerId, ref);
    return ref;
  };

  const displayName = customerDisplayName(source.name, customerId);
  const found = await deps.qbo.findCustomerByName(displayName);
  if (found) return adopt(found);

  try {
    return await adopt(
      await deps.qbo.createCustomer(buildQboCustomer(source, displayName))
    );
  } catch (err) {
    if (!(err instanceof QboApiError) || err.kind !== "duplicate_name") {
      throw err;
    }
    // Raced a concurrent create of the same customer name — adopt it…
    const raced = await deps.qbo.findCustomerByName(displayName);
    if (raced) return adopt(raced);
    throw err;
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
        ...buildQboCustomer(
          source,
          customerDisplayName(source.name, customerId)
        ),
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
 * `onDocNumberFallback` fires when the invoice lands under `SQFT-{n}` so the
 * runner can record why the QBO number differs from the SqFt one.
 */
export async function ensureInvoiceSynced(
  deps: SyncDeps,
  invoiceId: number,
  opts: { onDocNumberFallback?: (used: string, preferred: string) => void } = {}
): Promise<QboEntityRef | null> {
  const link = await deps.store.getLink(deps.orgId, "invoice", invoiceId);
  if (link) return { id: link.qboId, syncToken: link.syncToken };

  const source = await deps.store.getInvoiceSource(deps.orgId, invoiceId);
  if (!source?.snapshot || source.status === "void") return null;

  // For an accounting sync, a divergent total must be a visible failed task,
  // never a pushed invoice that disagrees with what the customer was billed.
  // (Also catches the all-lines-unresolved case: [] with a non-zero amount.)
  const lineSum = source.snapshot.lines.reduce((sum, l) => sum + l.amount, 0);
  if (Math.abs(lineSum - source.amount) > 0.005) {
    throw new Error(
      `Invoice ${invoiceId}: snapshot lines sum to $${lineSum.toFixed(
        2
      )} but the invoice amount is $${source.amount.toFixed(2)} — refusing to push a divergent invoice`
    );
  }

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

  const candidates = docNumberCandidates(source.invoiceNumber);
  const preferred = candidates[0];
  for (const docNumber of candidates) {
    const noteFallback = () => {
      if (docNumber !== preferred) {
        opts.onDocNumberFallback?.(docNumber, preferred);
      }
    };
    const existing = await deps.qbo.findInvoiceByDocNumber(docNumber);
    if (existing) {
      if (invoiceMatches(existing, customer.id, { ...source, taxAmount })) {
        noteFallback();
        return adopt(existing);
      }
      continue; // foreign invoice occupies this DocNumber — try the fallback
    }
    try {
      const created = await adopt(
        await deps.qbo.createInvoice(
          buildQboInvoice({
            snapshot: source.snapshot,
            customerQboId: customer.id,
            itemId,
            docNumber,
          })
        )
      );
      noteFallback();
      return created;
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

  const openBalance = await deps.qbo.readInvoiceBalance(invoice.id);
  return adopt(
    await deps.qbo.createPayment(
      buildQboPayment({
        source: payment.source,
        customerQboId: customer.qboId,
        invoiceQboId: invoice.id,
        openBalance,
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
  /** The `nextAttemptAt` the claim wrote — part of the claim's identity. */
  leaseUntil: Date;
}

export interface TaskStore {
  /** Due pending tasks for the org, oldest first. */
  claimDue(orgId: string, now: Date, limit: number): Promise<ClaimedTask[]>;
  /**
   * Terminal writes are FENCED on the claim's identity (attempts +
   * leaseUntil): if the row was re-enqueued while this run was in flight
   * (an admin's second edit resets it to pending/attempts 0), the write must
   * be a no-op so the fresh intent is never swallowed. `note` records a
   * non-fatal warning (e.g. a DocNumber fallback) on the completed task.
   */
  markDone(task: ClaimedTask, note?: string): Promise<void>;
  markFailed(args: {
    task: ClaimedTask;
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

/** Returns a non-fatal warning note to record on the done task, if any. */
export async function runTask(
  deps: SyncDeps,
  task: ClaimedTask
): Promise<string | undefined> {
  switch (task.kind) {
    case "sync_customer":
      await syncCustomerTask(deps, task.entityId);
      return;
    case "sync_invoice": {
      let note: string | undefined;
      await ensureInvoiceSynced(deps, task.entityId, {
        onDocNumberFallback: (used, preferred) => {
          note = `Warning: synced as DocNumber ${used} — ${preferred} was already taken in QuickBooks`;
        },
      });
      return note;
    }
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
  for (let processed = 0; processed < (opts.limit ?? 25); processed++) {
    const claimedAt = opts.now ?? new Date();
    const [task] = await tasks.claimDue(deps.orgId, claimedAt, 1);
    if (!task) break;
    try {
      const note = await runTask(deps, task);
      await tasks.markDone(task, note);
      await tasks.touchLastSynced(deps.orgId, now);
      result.done += 1;
    } catch (err) {
      if (isAuthError(err)) {
        await tasks.pauseOrg(deps.orgId);
        result.paused = true;
        return result;
      }
      const transient =
        (err instanceof QboApiError &&
          (err.kind === "throttle" || err.status >= 500)) ||
        (err instanceof Error &&
          ["TimeoutError", "AbortError"].includes(err.name));
      const attempts = task.attempts + (transient ? 0 : 1);
      await tasks.markFailed({
        task,
        error: err instanceof Error ? err.message : String(err),
        attempts,
        nextAttemptAt: new Date(
          claimedAt.getTime() + backoffMinutes(Math.max(1, attempts)) * 60_000
        ),
        terminal: attempts >= MAX_TASK_ATTEMPTS,
      });
      result.failed += 1;
    }
  }
  return result;
}
