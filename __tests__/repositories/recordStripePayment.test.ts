import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getInvoice,
  recordStripePayment,
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
    expect(second.recorded).toBe(false);

    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1);
    expect(inv?.status).toBe("paid");
    expect(inv?.payments[0]?.stripeFeeAmount).toBe(1.43);
  });
});
