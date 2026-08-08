/**
 * All Prisma access for the QBO sync: connection lifecycle (encrypted,
 * rotation-safe tokens), record links, the task outbox, and the
 * SyncStore/TaskStore port implementations the engine (lib/qbo/sync.ts)
 * runs against.
 *
 * The load-bearing pieces:
 *   - `getFreshAccessContext` — SINGLE-FLIGHT token refresh. Intuit rotates
 *     the refresh token (~24h): two concurrent refreshes brick the
 *     connection, so the refresh happens under `SELECT … FOR UPDATE` on the
 *     QboConnection row and the rotated pair is persisted atomically before
 *     the lock releases. Waiters re-read and skip their own refresh.
 *   - `enqueueQboTaskTx` — invariant 3: called INSIDE the domain-write
 *     transaction (send / payment / void) so a connected org can never have
 *     a domain write that silently produced no sync intent — including while
 *     the connection is auth-dead (the task lands `paused_auth` and re-arms
 *     on reconnect).
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getQboConfig, type QboConfig } from "@/lib/qbo/config";
import {
  exchangeRefreshToken,
  QboAuthDeadError,
  type QboTokens,
  shouldRefresh,
} from "@/lib/qbo/connect";
import { decryptToken, encryptToken } from "@/lib/qbo/crypto";
import type { TaxableInvoiceSnapshot } from "@/lib/qbo/mapping";
import type {
  ClaimedTask,
  QboTaskKind,
  SyncStore,
  TaskStore,
} from "@/lib/qbo/sync";

export type QboSyncBadgeState =
  | "synced"
  | "pending"
  | "failed"
  | "auth_required"
  | "void_synced";

export interface InvoiceQboState {
  state: QboSyncBadgeState;
  lastError: string | null;
}

const TASK_RESET = {
  status: "pending",
  attempts: 0,
  lastError: null,
} as const;

// ── Connection lifecycle ────────────────────────────────────────────────────

export async function getQboConnection(orgId: string) {
  return prisma.qboConnection.findUnique({ where: { orgId } });
}

function tokenColumns(tokens: QboTokens, now: Date) {
  return {
    accessTokenEnc: encryptToken(tokens.accessToken),
    refreshTokenEnc: encryptToken(tokens.refreshToken),
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
    refreshTokenExpiresAt: new Date(
      now.getTime() + tokens.refreshExpiresIn * 1000
    ),
  };
}

/**
 * Store a freshly-authorized connection. Reconnecting to the SAME realm
 * re-arms paused tasks and keeps links; connecting a DIFFERENT realm wipes
 * the org's links (ids from another company's books must never be written
 * to) and resets the service-item pointer.
 */
export async function upsertQboConnection(args: {
  orgId: string;
  realmId: string;
  tokens: QboTokens;
  companyName: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.qboConnection.findUnique({
      where: { orgId: args.orgId },
      select: { realmId: true },
    });
    const realmChanged = existing !== null && existing.realmId !== args.realmId;
    if (realmChanged) {
      await tx.qboLink.deleteMany({ where: { orgId: args.orgId } });
    }
    await tx.qboConnection.upsert({
      where: { orgId: args.orgId },
      create: {
        orgId: args.orgId,
        realmId: args.realmId,
        status: "active",
        companyName: args.companyName,
        ...tokenColumns(args.tokens, now),
      },
      update: {
        realmId: args.realmId,
        status: "active",
        companyName: args.companyName,
        ...(realmChanged ? { qboItemId: null } : {}),
        ...tokenColumns(args.tokens, now),
      },
    });
    await tx.qboSyncTask.updateMany({
      where: { orgId: args.orgId, status: "paused_auth" },
      data: { ...TASK_RESET, nextAttemptAt: now },
    });
  });
}

/** Returns the decrypted refresh token (for revocation) or null. */
export async function readRefreshToken(orgId: string): Promise<string | null> {
  const conn = await prisma.qboConnection.findUnique({
    where: { orgId },
    select: { refreshTokenEnc: true },
  });
  if (!conn) return null;
  try {
    return decryptToken(conn.refreshTokenEnc);
  } catch {
    return null;
  }
}

/** Disconnect (user-initiated or auth death): connection → disconnected,
 *  pending tasks → paused_auth. Nothing is deleted — reconnecting to the
 *  same realm resumes exactly where sync stopped. */
export async function markQboDisconnected(orgId: string): Promise<void> {
  await prisma.$transaction([
    prisma.qboConnection.updateMany({
      where: { orgId },
      data: { status: "disconnected" },
    }),
    prisma.qboSyncTask.updateMany({
      where: { orgId, status: "pending" },
      data: { status: "paused_auth" },
    }),
  ]);
}

// ── Single-flight token refresh ─────────────────────────────────────────────

export interface QboAccessContext {
  accessToken: string;
  realmId: string;
  apiBaseUrl: string;
}

type TokenExchange = (
  config: QboConfig,
  refreshToken: string
) => Promise<QboTokens>;

interface LockedConnectionRow {
  id: string;
  realmId: string;
  status: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessTokenExpiresAt: Date;
}

/**
 * A valid access token for the org's active connection, refreshing if it is
 * within the expiry skew — or `force`-refreshing after a 401. Null when QBO
 * is unconfigured or the org has no active connection. Throws
 * QboAuthDeadError (after marking the connection disconnected) when Intuit
 * rejects the grant.
 */
export async function getFreshAccessContext(
  orgId: string,
  opts: { force?: boolean; exchange?: TokenExchange } = {}
): Promise<QboAccessContext | null> {
  const config = getQboConfig();
  if (!config) return null;
  const exchange = opts.exchange ?? exchangeRefreshToken;

  const conn = await prisma.qboConnection.findUnique({ where: { orgId } });
  if (!conn || conn.status !== "active") return null;

  const now = new Date();
  if (!opts.force && !shouldRefresh(now, conn.accessTokenExpiresAt)) {
    return {
      accessToken: decryptToken(conn.accessTokenEnc),
      realmId: conn.realmId,
      apiBaseUrl: config.apiBaseUrl,
    };
  }

  // Once the exchange succeeds, Intuit has ALREADY rotated the pair — losing
  // it (a commit failure, a transaction timeout) leaves a dead refresh token
  // in the DB and bricks the connection. Track the exchanged pair so the
  // catch block can salvage it outside the transaction. (A ref object: TS
  // flow analysis can't see assignments made inside the tx closure.)
  const rotated: {
    current: {
      tokens: QboTokens;
      connectionId: string;
      realmId: string;
      at: Date;
    } | null;
  } = { current: null };

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Row lock: concurrent refreshers queue here; the winner refreshes
        // and persists the rotated pair before releasing the lock.
        const rows = await tx.$queryRaw<LockedConnectionRow[]>`
          SELECT "id", "realmId", "status", "accessTokenEnc",
                 "refreshTokenEnc", "accessTokenExpiresAt"
          FROM "QboConnection" WHERE "orgId" = ${orgId} FOR UPDATE`;
        const locked = rows[0];
        if (!locked || locked.status !== "active") return null;

        // A waiter that queued behind the winner sees fresh columns — use
        // them instead of refreshing again (the old refresh token is dead).
        const lockedAt = new Date();
        if (
          !shouldRefresh(lockedAt, locked.accessTokenExpiresAt) &&
          locked.accessTokenEnc !== conn.accessTokenEnc
        ) {
          return {
            accessToken: decryptToken(locked.accessTokenEnc),
            realmId: locked.realmId,
            apiBaseUrl: config.apiBaseUrl,
          };
        }

        const tokens = await exchange(
          config,
          decryptToken(locked.refreshTokenEnc)
        );
        rotated.current = {
          tokens,
          connectionId: locked.id,
          realmId: locked.realmId,
          at: lockedAt,
        };
        await tx.qboConnection.update({
          where: { id: locked.id },
          data: tokenColumns(tokens, lockedAt),
        });
        return {
          accessToken: tokens.accessToken,
          realmId: locked.realmId,
          apiBaseUrl: config.apiBaseUrl,
        };
      },
      // The token endpoint is called under the lock by design (its fetch is
      // capped at 10s, see connect.ts); allow slack before Prisma aborts.
      { timeout: 20_000, maxWait: 20_000 }
    );
  } catch (err) {
    if (err instanceof QboAuthDeadError) {
      await markQboDisconnected(orgId);
      throw err;
    }
    // Exchange succeeded but the transaction failed to commit: persist the
    // rotated pair out-of-band rather than dropping it (the old refresh
    // token is already dead on Intuit's side).
    const salvage = rotated.current;
    if (salvage) {
      try {
        await prisma.qboConnection.update({
          where: { id: salvage.connectionId },
          data: tokenColumns(salvage.tokens, salvage.at),
        });
        return {
          accessToken: salvage.tokens.accessToken,
          realmId: salvage.realmId,
          apiBaseUrl: config.apiBaseUrl,
        };
      } catch {
        // fall through to the original error
      }
    }
    throw err;
  }
}

// ── Task outbox ─────────────────────────────────────────────────────────────

/**
 * Invariant 3: enqueue a sync intent INSIDE the domain-write transaction.
 * No-op only when the org has never connected QBO (no mirror to maintain).
 * While the connection is dead (`disconnected` after an auth death or a
 * user disconnect) the intent is captured as `paused_auth` — reconnecting
 * re-arms it, so an auth outage never loses a domain write. Re-enqueueing an
 * existing task (resend, re-edit, manual retry) resets it.
 */
export async function enqueueQboTaskTx(
  tx: Prisma.TransactionClient,
  orgId: string,
  kind: QboTaskKind,
  entityId: number
): Promise<void> {
  const conn = await tx.qboConnection.findUnique({
    where: { orgId },
    select: { status: true },
  });
  if (!conn) return;
  const status = conn.status === "active" ? "pending" : "paused_auth";
  const now = new Date();
  await tx.qboSyncTask.upsert({
    where: { orgId_kind_entityId: { orgId, kind, entityId } },
    create: { orgId, kind, entityId, status, nextAttemptAt: now },
    update: { ...TASK_RESET, status, nextAttemptAt: now },
  });
}

/** Manual "Sync now": (re-)enqueue everything for one invoice — the invoice
 *  itself (or its void), plus its recorded payments. Throws nothing; the
 *  route validates connection state first. */
export async function requeueInvoiceSync(
  orgId: string,
  invoiceId: number
): Promise<boolean> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    select: { status: true, payments: { select: { id: true } } },
  });
  if (!invoice) return false;
  await prisma.$transaction(async (tx) => {
    await enqueueQboTaskTx(
      tx,
      orgId,
      invoice.status === "void" ? "void_invoice" : "sync_invoice",
      invoiceId
    );
    for (const payment of invoice.payments) {
      await enqueueQboTaskTx(tx, orgId, "sync_payment", payment.id);
    }
  });
  return true;
}

// ── Port implementations ────────────────────────────────────────────────────

export function makeSyncStore(): SyncStore {
  return {
    async getLink(orgId, entityType, entityId) {
      const link = await prisma.qboLink.findUnique({
        where: { orgId_entityType_entityId: { orgId, entityType, entityId } },
        select: { qboId: true, syncToken: true },
      });
      return link;
    },
    async saveLink(orgId, entityType, entityId, ref) {
      await prisma.qboLink.upsert({
        where: { orgId_entityType_entityId: { orgId, entityType, entityId } },
        create: {
          orgId,
          entityType,
          entityId,
          qboId: ref.id,
          syncToken: ref.syncToken,
        },
        update: { qboId: ref.id, syncToken: ref.syncToken },
      });
    },
    async getItem(orgId) {
      const conn = await prisma.qboConnection.findUnique({
        where: { orgId },
        select: { qboItemId: true, qboItemName: true },
      });
      return {
        itemId: conn?.qboItemId ?? null,
        itemName: conn?.qboItemName ?? "Flooring services",
      };
    },
    async saveItemId(orgId, itemId) {
      await prisma.qboConnection.update({
        where: { orgId },
        data: { qboItemId: itemId },
      });
    },
    async getCustomerSource(orgId, customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, orgId },
        select: {
          name: true,
          email: true,
          phone: true,
          locations: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { address: true },
          },
        },
      });
      if (!customer) return null;
      return {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.locations[0]?.address ?? null,
      };
    },
    async getInvoiceSource(orgId, invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, orgId },
        select: {
          invoiceNumber: true,
          status: true,
          amount: true,
          snapshot: true,
          estimate: {
            select: {
              siteMeasure: {
                select: { location: { select: { customerId: true } } },
              },
            },
          },
        },
      });
      if (!invoice) return null;
      return {
        customerId: invoice.estimate.siteMeasure.location.customerId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        amount: invoice.amount,
        snapshot:
          (invoice.snapshot as unknown as TaxableInvoiceSnapshot | null) ??
          null,
      };
    },
    async getPaymentSource(orgId, paymentId) {
      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, invoice: { orgId } },
        select: {
          id: true,
          invoiceId: true,
          amount: true,
          paidAt: true,
          method: true,
          reference: true,
        },
      });
      if (!payment) return null;
      return {
        invoiceId: payment.invoiceId,
        source: {
          paymentId: payment.id,
          amount: payment.amount,
          paidAt: payment.paidAt.toISOString(),
          method: payment.method,
          reference: payment.reference,
        },
      };
    },
  };
}

/** Claim lease: a claimed task stops being due for this long, so concurrent
 *  runners (an after() attempt racing the cron sweep) can't double-run it;
 *  a runner that dies mid-task leaves it to re-become due when the lease
 *  expires. */
export const CLAIM_LEASE_MS = 2 * 60_000;

export function makeTaskStore(): TaskStore {
  return {
    async claimDue(orgId, now, limit) {
      const candidates = await prisma.qboSyncTask.findMany({
        where: { orgId, status: "pending", nextAttemptAt: { lte: now } },
        orderBy: { id: "asc" },
        take: limit,
        select: { id: true, kind: true, entityId: true, attempts: true },
      });
      // Atomic per-task claim: the where-guard means exactly one concurrent
      // runner wins each task (count 1); losers skip it.
      const lease = new Date(now.getTime() + CLAIM_LEASE_MS);
      const claimed: ClaimedTask[] = [];
      for (const task of candidates) {
        const res = await prisma.qboSyncTask.updateMany({
          where: {
            id: task.id,
            status: "pending",
            nextAttemptAt: { lte: now },
          },
          data: { nextAttemptAt: lease },
        });
        if (res.count === 1) {
          claimed.push({
            ...task,
            kind: task.kind as QboTaskKind,
            leaseUntil: lease,
          });
        }
      }
      return claimed;
    },
    // Terminal writes are fenced on the claim's identity (attempts + the
    // lease this claim wrote). A count of 0 means the row was re-enqueued
    // while this run was in flight — the fresh pending intent must survive,
    // so the stale runner's outcome is dropped on the floor.
    async markDone(task, note) {
      await prisma.qboSyncTask.updateMany({
        where: {
          id: task.id,
          status: "pending",
          attempts: task.attempts,
          nextAttemptAt: task.leaseUntil,
        },
        data: { status: "done", lastError: note ?? null },
      });
    },
    async markFailed(args) {
      await prisma.qboSyncTask.updateMany({
        where: {
          id: args.task.id,
          status: "pending",
          attempts: args.task.attempts,
          nextAttemptAt: args.task.leaseUntil,
        },
        data: {
          status: args.terminal ? "failed" : "pending",
          attempts: args.attempts,
          lastError: args.error.slice(0, 1000),
          nextAttemptAt: args.nextAttemptAt,
        },
      });
    },
    async pauseOrg(orgId) {
      await markQboDisconnected(orgId);
    },
    async touchLastSynced(orgId, now) {
      await prisma.qboConnection.updateMany({
        where: { orgId },
        data: { lastSyncedAt: now },
      });
    },
  };
}

// ── Read models (badge + health) ────────────────────────────────────────────

/** Sync badge state for one invoice, or null when there is nothing to show
 *  (no connection, or a draft that has never been enqueued). Payment tasks
 *  count too: an invoice whose payment sync failed must not show a clean
 *  check while the books are short a payment. */
export async function getInvoiceQboState(
  orgId: string,
  invoiceId: number
): Promise<InvoiceQboState | null> {
  const conn = await prisma.qboConnection.findUnique({
    where: { orgId },
    select: { id: true },
  });
  if (!conn) return null;

  const [link, paymentIds] = await Promise.all([
    prisma.qboLink.findUnique({
      where: {
        orgId_entityType_entityId: {
          orgId,
          entityType: "invoice",
          entityId: invoiceId,
        },
      },
      select: { id: true },
    }),
    prisma.payment
      .findMany({
        where: { invoiceId, invoice: { orgId } },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id)),
  ]);
  const tasks = await prisma.qboSyncTask.findMany({
    where: {
      orgId,
      OR: [
        {
          entityId: invoiceId,
          kind: { in: ["sync_invoice", "void_invoice"] },
        },
        ...(paymentIds.length > 0
          ? [{ entityId: { in: paymentIds }, kind: "sync_payment" }]
          : []),
      ],
    },
    select: { kind: true, status: true, lastError: true },
  });

  // Any task carrying an error shows as failed — a pending retry with a
  // lastError still deserves the error + Retry affordance, not a silent
  // spinner until the 10th attempt goes terminal.
  const failed = tasks.find(
    (t) => t.status === "failed" || (t.status !== "done" && t.lastError)
  );
  if (failed) return { state: "failed", lastError: failed.lastError };
  // A dead connection is not "syncing" — nothing progresses until an admin
  // reconnects, and the badge should say so instead of spinning forever.
  if (tasks.some((t) => t.status === "paused_auth")) {
    return { state: "auth_required", lastError: null };
  }
  if (tasks.some((t) => t.status === "pending")) {
    return { state: "pending", lastError: null };
  }
  if (tasks.some((t) => t.kind === "void_invoice" && t.status === "done")) {
    return { state: "void_synced", lastError: null };
  }
  if (link) return { state: "synced", lastError: null };
  return null;
}

export interface QboSyncHealth {
  pending: number;
  failed: number;
  done: number;
  pausedAuth: number;
  lastSyncedAt: Date | null;
  recentErrors: Array<{
    id: number;
    kind: string;
    entityId: number;
    /** The invoice a retry can be launched from (the payment's invoice for
     *  sync_payment rows); null for customer tasks. */
    invoiceId: number | null;
    lastError: string | null;
    updatedAt: Date;
  }>;
}

export async function getQboSyncHealth(orgId: string): Promise<QboSyncHealth> {
  const [grouped, conn, failedRows] = await Promise.all([
    prisma.qboSyncTask.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { _all: true },
      orderBy: undefined,
    }),
    prisma.qboConnection.findUnique({
      where: { orgId },
      select: { lastSyncedAt: true },
    }),
    prisma.qboSyncTask.findMany({
      where: { orgId, status: "failed" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        kind: true,
        entityId: true,
        lastError: true,
        updatedAt: true,
      },
    }),
  ]);
  // A failed payment sync is retried from its INVOICE page (requeue covers
  // the invoice + all its payments) — map payment ids to invoice ids so the
  // health panel can link there.
  const failedPaymentIds = failedRows
    .filter((r) => r.kind === "sync_payment")
    .map((r) => r.entityId);
  const paymentInvoice = new Map<number, number>(
    failedPaymentIds.length > 0
      ? (
          await prisma.payment.findMany({
            where: { id: { in: failedPaymentIds }, invoice: { orgId } },
            select: { id: true, invoiceId: true },
          })
        ).map((p) => [p.id, p.invoiceId])
      : []
  );
  const recentErrors = failedRows.map((row) => ({
    ...row,
    invoiceId:
      row.kind === "sync_invoice" || row.kind === "void_invoice"
        ? row.entityId
        : (paymentInvoice.get(row.entityId) ?? null),
  }));
  const counts: Record<string, number> = {};
  for (const row of grouped) {
    counts[row.status] = row._count._all;
  }
  return {
    pending: counts.pending ?? 0,
    failed: counts.failed ?? 0,
    done: counts.done ?? 0,
    pausedAuth: counts.paused_auth ?? 0,
    lastSyncedAt: conn?.lastSyncedAt ?? null,
    recentErrors,
  };
}

/** Orgs that currently have due work, MOST OVERDUE FIRST — if a sweep is
 *  killed by the function timeout, the same orgs must not be starved on
 *  every subsequent sweep. */
export async function listOrgsWithDueTasks(now: Date): Promise<string[]> {
  const rows = await prisma.qboSyncTask.groupBy({
    by: ["orgId"],
    where: { status: "pending", nextAttemptAt: { lte: now } },
    _min: { nextAttemptAt: true },
    orderBy: { _min: { nextAttemptAt: "asc" } },
  });
  return rows.map((r) => r.orgId);
}

/** Whether the customer has a link (used to enqueue update tasks only for
 *  customers that already exist in QBO). Pass the ambient transaction when
 *  calling inside one — the global client would grab a second pooled
 *  connection while the transaction holds its own. */
export async function hasCustomerLink(
  orgId: string,
  customerId: number,
  db: Prisma.TransactionClient = prisma
): Promise<boolean> {
  const link = await db.qboLink.findUnique({
    where: {
      orgId_entityType_entityId: {
        orgId,
        entityType: "customer",
        entityId: customerId,
      },
    },
    select: { id: true },
  });
  return link !== null;
}
