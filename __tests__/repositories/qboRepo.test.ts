/**
 * Tier D: qboRepo against a real Postgres (skipped in CI's DB-less unit job,
 * like recordStripePayment.test.ts). Pins the two invariants that only exist
 * at the database layer:
 *   - enqueue-in-transaction (a rolled-back domain write leaves no task)
 *   - single-flight token refresh under the QboConnection row lock
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { QboConfig } from "@/lib/qbo/config";
import type { QboTokens } from "@/lib/qbo/connect";
import { decryptToken, encryptToken } from "@/lib/qbo/crypto";
import {
  markInvoiceSent,
  recordPayment,
  voidInvoice,
} from "@/lib/repositories/invoiceRepo";
import {
  enqueueQboTaskTx,
  getFreshAccessContext,
  getInvoiceQboState,
  makeTaskStore,
  markQboDisconnected,
  requeueInvoiceSync,
  upsertQboConnection,
} from "@/lib/repositories/qboRepo";

const ENV_KEYS = [
  "QBO_CLIENT_ID",
  "QBO_CLIENT_SECRET",
  "QBO_ENVIRONMENT",
  "QBO_TOKEN_ENC_KEY",
] as const;
const prevEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) prevEnv[key] = process.env[key];
  process.env.QBO_CLIENT_ID = "cid";
  process.env.QBO_CLIENT_SECRET = "csecret";
  process.env.QBO_ENVIRONMENT = "sandbox";
  process.env.QBO_TOKEN_ENC_KEY = "test-enc-key";
});
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (prevEnv[key] === undefined) delete process.env[key];
    else process.env[key] = prevEnv[key];
  }
});

const createdOrgIds: string[] = [];
afterAll(async () => {
  if (createdOrgIds.length > 0) {
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrgIds } },
    });
  }
});

function tokens(suffix: string): QboTokens {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresIn: 3600,
    refreshExpiresIn: 86400,
  };
}

/** Org + customer→location→siteMeasure→estimate→invoice chain, plus an
 *  active QBO connection unless withConnection is false. */
async function seed(withConnection = true) {
  const ts = `${Date.now()}-${Math.round(performance.now() * 1000)}`;
  const org = await prisma.organization.create({
    data: { name: "QBO Repo Co", slug: `qbo-repo-${ts}` },
  });
  createdOrgIds.push(org.id);
  const customer = await prisma.customer.create({
    data: { orgId: org.id, name: `Sam ${ts}` },
  });
  const location = await prisma.location.create({
    data: { orgId: org.id, customerId: customer.id, address: "1 Main St" },
  });
  const siteMeasure = await prisma.siteMeasure.create({
    data: { orgId: org.id, locationId: location.id, siteMeasureNumber: 1 },
  });
  const estimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: siteMeasure.id,
      estimateNumber: 1,
      status: "approved",
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: estimate.id,
      invoiceNumber: 1,
      status: "sent",
      amount: 500,
      sentAt: new Date(),
    },
  });
  if (withConnection) {
    await upsertQboConnection({
      orgId: org.id,
      realmId: `realm-${ts}`,
      tokens: tokens("seed"),
      companyName: "Seed Co",
    });
  }
  return { org, customer, invoice, realmId: `realm-${ts}` };
}

async function taskRows(orgId: string) {
  return prisma.qboSyncTask.findMany({
    where: { orgId },
    orderBy: { id: "asc" },
  });
}

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("qboRepo", () => {
  it("markInvoiceSent enqueues sync_invoice in the same transaction", async () => {
    const { org, invoice } = await seed();
    await markInvoiceSent(invoice.id, org.id, {
      to: "sam@example.com",
      subject: "Invoice",
      sentByEmail: "lead@acme.com",
      sentByName: "Lead",
      snapshot: { amount: 500 },
    });
    const rows = await taskRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "sync_invoice",
      entityId: invoice.id,
      status: "pending",
    });
  });

  it("no connection → domain writes enqueue nothing", async () => {
    const { org, invoice } = await seed(false);
    await markInvoiceSent(invoice.id, org.id, {
      to: "sam@example.com",
      subject: "Invoice",
      sentByEmail: "lead@acme.com",
      sentByName: "Lead",
      snapshot: { amount: 500 },
    });
    expect(await taskRows(org.id)).toHaveLength(0);
  });

  it("a rolled-back domain write leaves no task (void invoice → payment throws)", async () => {
    const { org, invoice } = await seed();
    await voidInvoice(invoice.id, org.id); // enqueues void_invoice
    await expect(
      recordPayment(invoice.id, org.id, {
        amount: 100,
        method: "check",
        recordedByEmail: "lead@acme.com",
        recordedByName: "Lead",
      })
    ).rejects.toThrow();
    const rows = await taskRows(org.id);
    expect(rows.map((r) => r.kind)).toEqual(["void_invoice"]);
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } })
    ).toBe(0);
  });

  it("recordPayment enqueues sync_payment with the created payment id", async () => {
    const { org, invoice } = await seed();
    await recordPayment(invoice.id, org.id, {
      amount: 100,
      method: "check",
      recordedByEmail: "lead@acme.com",
      recordedByName: "Lead",
    });
    const payment = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id },
    });
    const rows = await taskRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "sync_payment",
      entityId: payment?.id,
    });
  });

  it("enqueue is an upsert: re-enqueueing resets a failed task to pending", async () => {
    const { org, invoice } = await seed();
    await prisma.$transaction((tx) =>
      enqueueQboTaskTx(tx, org.id, "sync_invoice", invoice.id)
    );
    await prisma.qboSyncTask.updateMany({
      where: { orgId: org.id },
      data: { status: "failed", attempts: 10, lastError: "boom" },
    });
    await prisma.$transaction((tx) =>
      enqueueQboTaskTx(tx, org.id, "sync_invoice", invoice.id)
    );
    const rows = await taskRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      lastError: null,
    });
  });

  it("a domain write while the connection is dead lands paused_auth and re-arms on reconnect", async () => {
    const { org, invoice, realmId } = await seed();
    await markQboDisconnected(org.id);
    // The auth outage must not lose this send's sync intent.
    await markInvoiceSent(invoice.id, org.id, {
      to: "sam@example.com",
      subject: "Invoice",
      sentByEmail: "lead@acme.com",
      sentByName: "Lead",
      snapshot: { amount: 500 },
    });
    const rows = await taskRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "sync_invoice",
      status: "paused_auth",
    });

    await upsertQboConnection({
      orgId: org.id,
      realmId,
      tokens: tokens("re"),
      companyName: "Seed Co",
    });
    expect((await taskRows(org.id))[0]?.status).toBe("pending");
  });

  it("markDone/markFailed are fenced: a mid-flight re-enqueue survives both", async () => {
    const { org, invoice } = await seed();
    await prisma.$transaction((tx) =>
      enqueueQboTaskTx(tx, org.id, "sync_invoice", invoice.id)
    );
    const store = makeTaskStore();
    const now = new Date(Date.now() + 1000);
    const [claimed] = await store.claimDue(org.id, now, 10);
    expect(claimed).toBeDefined();

    // The admin resends while the runner is mid-flight → fresh intent.
    await prisma.$transaction((tx) =>
      enqueueQboTaskTx(tx, org.id, "sync_invoice", invoice.id)
    );

    await store.markDone(claimed);
    expect((await taskRows(org.id))[0]).toMatchObject({
      status: "pending",
      attempts: 0,
    });

    await store.markFailed({
      task: claimed,
      error: "boom",
      attempts: claimed.attempts + 1,
      nextAttemptAt: new Date(now.getTime() + 120_000),
      terminal: false,
    });
    expect((await taskRows(org.id))[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      lastError: null,
    });

    // Without a competing re-enqueue the same claim identity CAN complete:
    // re-claim (the reset made it due again) and mark done normally.
    const [reclaimed] = await store.claimDue(
      org.id,
      new Date(Date.now() + 1000),
      10
    );
    expect(reclaimed).toBeDefined();
    await store.markDone(reclaimed);
    expect((await taskRows(org.id))[0]?.status).toBe("done");
  });

  it("single-flight: two concurrent refreshes make exactly one token call", async () => {
    const { org } = await seed();
    // Force both callers down the refresh path.
    await prisma.qboConnection.update({
      where: { orgId: org.id },
      data: { accessTokenExpiresAt: new Date(Date.now() + 60_000) },
    });
    let calls = 0;
    const exchange = vi.fn(async (): Promise<QboTokens> => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 150));
      return tokens(`rotated-${calls}`);
    });

    const [a, b] = await Promise.all([
      getFreshAccessContext(org.id, { exchange }),
      getFreshAccessContext(org.id, { exchange }),
    ]);
    expect(calls).toBe(1);
    expect(a?.accessToken).toBe("access-rotated-1");
    expect(b?.accessToken).toBe("access-rotated-1");

    const conn = await prisma.qboConnection.findUnique({
      where: { orgId: org.id },
    });
    expect(decryptToken(conn?.refreshTokenEnc ?? "")).toBe("refresh-rotated-1");
  });

  it("auth-dead refresh marks the connection disconnected and pauses tasks", async () => {
    const { org, invoice } = await seed();
    await prisma.$transaction((tx) =>
      enqueueQboTaskTx(tx, org.id, "sync_invoice", invoice.id)
    );
    await prisma.qboConnection.update({
      where: { orgId: org.id },
      data: { accessTokenExpiresAt: new Date() },
    });
    const { QboAuthDeadError } = await import("@/lib/qbo/connect");
    const exchange = vi.fn(async (): Promise<QboTokens> => {
      throw new QboAuthDeadError("invalid_grant");
    });
    await expect(
      getFreshAccessContext(org.id, { exchange })
    ).rejects.toBeInstanceOf(QboAuthDeadError);
    const conn = await prisma.qboConnection.findUnique({
      where: { orgId: org.id },
    });
    expect(conn?.status).toBe("disconnected");
    expect((await taskRows(org.id))[0]?.status).toBe("paused_auth");
  });

  it("reconnecting the SAME realm re-arms paused tasks and keeps links", async () => {
    const { org, invoice, realmId } = await seed();
    await prisma.qboLink.create({
      data: {
        orgId: org.id,
        entityType: "invoice",
        entityId: invoice.id,
        qboId: "77",
        syncToken: "0",
      },
    });
    await prisma.$transaction((tx) =>
      enqueueQboTaskTx(tx, org.id, "sync_invoice", invoice.id)
    );
    await markQboDisconnected(org.id);
    expect((await taskRows(org.id))[0]?.status).toBe("paused_auth");

    await upsertQboConnection({
      orgId: org.id,
      realmId,
      tokens: tokens("re"),
      companyName: "Seed Co",
    });
    expect((await taskRows(org.id))[0]?.status).toBe("pending");
    expect(await prisma.qboLink.count({ where: { orgId: org.id } })).toBe(1);
  });

  it("connecting a DIFFERENT realm wipes links and the item pointer", async () => {
    const { org, invoice } = await seed();
    await prisma.qboConnection.update({
      where: { orgId: org.id },
      data: { qboItemId: "item-1" },
    });
    await prisma.qboLink.create({
      data: {
        orgId: org.id,
        entityType: "invoice",
        entityId: invoice.id,
        qboId: "77",
        syncToken: "0",
      },
    });
    await upsertQboConnection({
      orgId: org.id,
      realmId: `other-realm-${Date.now()}`,
      tokens: tokens("other"),
      companyName: "Other Co",
    });
    expect(await prisma.qboLink.count({ where: { orgId: org.id } })).toBe(0);
    const conn = await prisma.qboConnection.findUnique({
      where: { orgId: org.id },
    });
    expect(conn?.qboItemId).toBeNull();
  });

  it("claimDue honors status + due time and orders oldest first", async () => {
    const { org, invoice } = await seed();
    const store = makeTaskStore();
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000);
    await prisma.qboSyncTask.createMany({
      data: [
        {
          orgId: org.id,
          kind: "sync_invoice",
          entityId: invoice.id,
          nextAttemptAt: new Date(now.getTime() - 1000),
        },
        {
          orgId: org.id,
          kind: "sync_payment",
          entityId: 1,
          nextAttemptAt: later,
        },
        {
          orgId: org.id,
          kind: "void_invoice",
          entityId: invoice.id,
          status: "done",
        },
      ],
    });
    const due = await store.claimDue(org.id, now, 10);
    expect(due.map((t) => t.kind)).toEqual(["sync_invoice"]);

    // The claim leases the task: a concurrent (or immediate) second claim
    // gets nothing, so racing runners can't double-run it.
    expect(await store.claimDue(org.id, now, 10)).toEqual([]);
  });

  it("requeueInvoiceSync + getInvoiceQboState round-trip", async () => {
    const { org, invoice } = await seed();
    expect(await getInvoiceQboState(org.id, invoice.id)).toBeNull();

    expect(await requeueInvoiceSync(org.id, invoice.id)).toBe(true);
    expect(await getInvoiceQboState(org.id, invoice.id)).toEqual({
      state: "pending",
      lastError: null,
    });

    await prisma.qboSyncTask.updateMany({
      where: { orgId: org.id },
      data: { status: "failed", lastError: "boom" },
    });
    expect(await getInvoiceQboState(org.id, invoice.id)).toEqual({
      state: "failed",
      lastError: "boom",
    });

    await prisma.qboSyncTask.updateMany({
      where: { orgId: org.id },
      data: { status: "done", lastError: null },
    });
    await prisma.qboLink.create({
      data: {
        orgId: org.id,
        entityType: "invoice",
        entityId: invoice.id,
        qboId: "77",
        syncToken: "0",
      },
    });
    expect(await getInvoiceQboState(org.id, invoice.id)).toEqual({
      state: "synced",
      lastError: null,
    });

    expect(await requeueInvoiceSync(org.id, 999_999)).toBe(false);
  });

  it("token columns are encrypted at rest", async () => {
    const { org } = await seed();
    const conn = await prisma.qboConnection.findUnique({
      where: { orgId: org.id },
    });
    expect(conn?.accessTokenEnc).not.toContain("access-seed");
    expect(conn?.refreshTokenEnc).not.toContain("refresh-seed");
    expect(decryptToken(conn?.accessTokenEnc ?? "")).toBe("access-seed");
    expect(encryptToken("x")).not.toBe(encryptToken("x"));
  });
});
