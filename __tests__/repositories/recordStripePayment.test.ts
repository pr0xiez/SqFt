import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getInvoice,
  recordStripePayment,
  recordStripePaymentFailure,
} from "@/lib/repositories/invoiceRepo";

// Seeds a minimal org→customer→location→siteMeasure→estimate→sent-invoice chain.
async function seedSentInvoice() {
  const ts = `${Date.now()}-${Math.round(performance.now())}`;
  const org = await prisma.organization.create({
    data: { name: "Stripe Pay Co", slug: `stripe-pay-${ts}` },
  });
  const customer = await prisma.customer.create({
    data: { orgId: org.id, name: "Sam", email: `sam-${ts}@example.com` },
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
  const amount = 500;
  const invoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: estimate.id,
      invoiceNumber: 1,
      status: "sent",
      amount,
      sentAt: new Date(),
    },
  });
  return { orgId: org.id, invoiceId: invoice.id, amount };
}

// Collect seeded org ids for cleanup; cascade deletes all children.
const seededOrgIds: string[] = [];

// Integration test against the real database. Runs locally (DATABASE_URL
// loaded from .env by vitest.setup.ts). Skipped in CI's DB-less unit job
// where database behavior is covered by the Playwright e2e suite instead.
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("recordStripePayment", () => {
  afterAll(async () => {
    for (const id of seededOrgIds) {
      await prisma.organization.delete({ where: { id } }).catch(() => {});
    }
  });

  it("records once and is idempotent on chargeId", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    seededOrgIds.push(orgId);

    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const args = {
      paymentIntentId: `pi_${ts}`,
      chargeId: `ch_${ts}`,
      orgId,
      invoiceId,
      amount,
      feeAmount: 1.43,
      netAmount: amount - 1.43,
    };

    const first = await recordStripePayment(args);
    const second = await recordStripePayment(args); // duplicate delivery

    expect(first.recorded).toBe(true);
    expect(first.overpaid).toBe(false); // exact balance → not overpaid
    expect(second.recorded).toBe(false);

    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1);
    expect(inv?.status).toBe("paid");
    expect(inv?.payments[0]?.stripeFeeAmount).toBe(1.43);
  });

  it("records a charge on a voided invoice, keeps it void, and flags it for refund", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    seededOrgIds.push(orgId);
    // Customer opened Checkout; contractor voids before they pay; the card is
    // still charged. The money must be recorded — but the invoice stays void.
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "void", voidedAt: new Date() },
    });

    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const result = await recordStripePayment({
      paymentIntentId: `pi_${ts}`,
      chargeId: `ch_${ts}`,
      orgId,
      invoiceId,
      amount,
      feeAmount: 1.43,
      netAmount: amount - 1.43,
    });

    expect(result.recorded).toBe(true);
    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1); // money is not dropped
    expect(inv?.status).toBe("void"); // never resurrected
    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId } });
    const flagged = events.find(
      (e) => (e.metadata as { refundNeeded?: boolean })?.refundNeeded
    );
    expect(flagged).toBeDefined();
    expect((flagged?.metadata as { refundReason?: string })?.refundReason).toBe(
      "invoice_void"
    );
  });

  it("records an overpayment charge and flags it for refund", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    seededOrgIds.push(orgId);
    // A manual payment already covered the balance and marked it paid.
    await prisma.payment.create({
      data: { invoiceId, amount, method: "check", recordedByName: "Office" },
    });
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt: new Date() },
    });

    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const result = await recordStripePayment({
      paymentIntentId: `pi_${ts}`,
      chargeId: `ch_${ts}`,
      orgId,
      invoiceId,
      amount, // a second full payment → overpaid
      feeAmount: 1.43,
      netAmount: amount - 1.43,
    });

    expect(result.recorded).toBe(true);
    expect(result.overpaid).toBe(true); // surfaced so the confirm route can warn
    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(2);
    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId } });
    const flagged = events.find(
      (e) =>
        (e.metadata as { refundReason?: string })?.refundReason ===
        "overpayment"
    );
    expect(flagged).toBeDefined();
  });

  // ── Fee/net backfill: Stripe's balance transaction can lag the charge ──────

  it("backfills fee/net from a later delivery when the first record had none, without a second payment", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    seededOrgIds.push(orgId);
    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const base = {
      paymentIntentId: `pi_${ts}`,
      chargeId: `ch_${ts}`,
      orgId,
      invoiceId,
      amount,
    };

    // The first recorder beat the balance transaction → fee/net unknown.
    const first = await recordStripePayment({
      ...base,
      feeAmount: null,
      netAmount: null,
    });
    // A later delivery of the same charge (webhook redelivery / confirm) has it.
    const later = await recordStripePayment({
      ...base,
      feeAmount: 14.8,
      netAmount: 485.2,
    });

    expect(first.recorded).toBe(true);
    expect(later).toEqual({ recorded: false, overpaid: false });
    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1);
    expect(inv?.payments[0]?.stripeFeeAmount).toBe(14.8);
    expect(inv?.payments[0]?.stripeNetAmount).toBe(485.2);
    expect(inv?.status).toBe("paid");
    // The ledger side effects ran once — the backfill only touches fee/net.
    const recorded = await prisma.invoiceEvent.findMany({
      where: { invoiceId, type: "payment_recorded" },
    });
    expect(recorded).toHaveLength(1);
  });

  it("never overwrites a captured fee/net", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    seededOrgIds.push(orgId);
    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const base = {
      paymentIntentId: `pi_${ts}`,
      chargeId: `ch_${ts}`,
      orgId,
      invoiceId,
      amount,
    };

    await recordStripePayment({ ...base, feeAmount: 14.8, netAmount: 485.2 });
    // A path that missed the balance transaction, then a conflicting read.
    await recordStripePayment({ ...base, feeAmount: null, netAmount: null });
    await recordStripePayment({ ...base, feeAmount: 99, netAmount: 401 });

    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1);
    expect(inv?.payments[0]?.stripeFeeAmount).toBe(14.8);
    expect(inv?.payments[0]?.stripeNetAmount).toBe(485.2);
  });

  it("does not backfill through another org's delivery of the same charge id", async () => {
    const owner = await seedSentInvoice();
    const other = await seedSentInvoice();
    seededOrgIds.push(owner.orgId, other.orgId);
    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const chargeId = `ch_${ts}`;

    await recordStripePayment({
      paymentIntentId: `pi_${ts}`,
      chargeId,
      orgId: owner.orgId,
      invoiceId: owner.invoiceId,
      amount: owner.amount,
      feeAmount: null,
      netAmount: null,
    });
    const forged = await recordStripePayment({
      paymentIntentId: `pi_${ts}`,
      chargeId,
      orgId: other.orgId,
      invoiceId: other.invoiceId,
      amount: other.amount,
      feeAmount: 14.8,
      netAmount: 485.2,
    });

    expect(forged.recorded).toBe(false);
    const inv = await getInvoice(owner.invoiceId, owner.orgId);
    expect(inv?.payments[0]?.stripeFeeAmount).toBeNull();
    expect(inv?.payments[0]?.stripeNetAmount).toBeNull();
    const otherInv = await getInvoice(other.invoiceId, other.orgId);
    expect(otherInv?.payments).toHaveLength(0);
  });

  it("backfills fee/net when this delivery loses the insert race (P2002) to one that had none", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    seededOrgIds.push(orgId);
    const ts = `${Date.now()}-${Math.round(performance.now())}`;
    const chargeId = `ch_${ts}`;

    let loser: ReturnType<typeof recordStripePayment> | undefined;
    await prisma.$transaction(async (tx) => {
      // The winning delivery has inserted the charge (without fee/net) but not
      // committed: the loser's soft check can't see it, so the loser's insert
      // blocks on the unique index and fails with P2002 once this commits.
      await tx.payment.create({
        data: {
          invoiceId,
          amount,
          method: "stripe",
          stripeChargeId: chargeId,
          recordedByName: "Stripe",
        },
      });
      loser = recordStripePayment({
        paymentIntentId: `pi_${ts}`,
        chargeId,
        orgId,
        invoiceId,
        amount,
        feeAmount: 14.8,
        netAmount: 485.2,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await expect(loser).resolves.toEqual({ recorded: false, overpaid: false });
    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1);
    expect(inv?.payments[0]?.stripeFeeAmount).toBe(14.8);
    expect(inv?.payments[0]?.stripeNetAmount).toBe(485.2);
  });
});

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)(
  "recordStripePaymentFailure",
  () => {
    // Own cleanup: the first describe's afterAll runs before this suite does.
    const localOrgIds: string[] = [];
    afterAll(async () => {
      for (const id of localOrgIds) {
        await prisma.organization.delete({ where: { id } }).catch(() => {});
      }
    });

    it("writes a payment_failed event, no Payment row, and never resolves cross-org ids", async () => {
      const { orgId, invoiceId, amount } = await seedSentInvoice();
      localOrgIds.push(orgId);

      const ts = `${Date.now()}-${Math.round(performance.now())}`;
      await recordStripePaymentFailure({
        orgId,
        invoiceId,
        amount,
        paymentIntentId: `pi_${ts}`,
      });
      // Cross-org guard: a forged invoiceId under a different org is a no-op.
      await recordStripePaymentFailure({
        orgId: "some-other-org",
        invoiceId,
        amount,
        paymentIntentId: `pi_${ts}-forged`,
      });

      const inv = await getInvoice(invoiceId, orgId);
      expect(inv?.payments).toHaveLength(0); // no money moved, no ledger row
      expect(inv?.status).toBe("sent"); // unchanged
      const events = await prisma.invoiceEvent.findMany({
        where: { invoiceId, type: "payment_failed" },
      });
      expect(events).toHaveLength(1); // the forged call wrote nothing
      expect((events[0]?.metadata as { amount?: number })?.amount).toBe(amount);
    });
  }
);
