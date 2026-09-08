import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression for issue #159: document numbers (estimate / site-measure /
// invoice) must be allocated with an ATOMIC increment-returning update on the
// Organization counter, not a non-atomic findUnique-then-update. A plain read
// does not lock the row under READ COMMITTED, so two concurrent creates could
// both read N and both allocate N. These tests assert each create path uses the
// `{ increment: 1 }` update and never reads the counter via findUnique.

vi.mock("@/lib/prisma", () => {
  const tx = {
    estimate: { findFirst: vi.fn(), create: vi.fn() },
    siteMeasure: { findFirst: vi.fn(), create: vi.fn() },
    location: { findFirst: vi.fn() },
    invoice: { create: vi.fn() },
    organization: {
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  return {
    prisma: {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { createEstimate } from "@/lib/repositories/estimateRepo";
import { createInvoice } from "@/lib/repositories/invoiceRepo";
import { createSiteMeasure } from "@/lib/repositories/siteMeasureRepo";

// biome-ignore lint/suspicious/noExplicitAny: test helper
const tx = (prisma as any).__tx;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEstimate — atomic number allocation", () => {
  it("allocates via an increment-returning Organization update", async () => {
    // siteMeasure existence check passes, then the create + final hydrate.
    tx.siteMeasure.findFirst.mockResolvedValue({ id: 1 });
    tx.organization.update.mockResolvedValue({
      nextEstimateNumber: 43,
      defaultDepositPct: 0.3,
      defaultTerms: "",
      defaultValidityDays: 21,
    });
    tx.estimate.create.mockResolvedValue({ id: 99 });
    tx.estimate.findFirst.mockResolvedValue({ id: 99 });

    await createEstimate("org_1", { siteMeasureId: 1 });

    expect(tx.organization.findUnique).not.toHaveBeenCalled();
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: { nextEstimateNumber: { increment: 1 } },
      select: expect.objectContaining({ nextEstimateNumber: true }),
    });
    // Reserved number is the pre-increment value (returned - 1).
    expect(tx.estimate.create.mock.calls[0][0].data.estimateNumber).toBe(42);
  });
});

describe("createSiteMeasure — atomic number allocation", () => {
  it("allocates via an increment-returning Organization update", async () => {
    tx.location.findFirst.mockResolvedValue({ id: 5 });
    tx.organization.update.mockResolvedValue({ nextSiteMeasureNumber: 8 });
    tx.siteMeasure.create.mockResolvedValue({ id: 50 });

    await createSiteMeasure("org_1", { locationId: 5 });

    expect(tx.organization.findUnique).not.toHaveBeenCalled();
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: { nextSiteMeasureNumber: { increment: 1 } },
      select: { nextSiteMeasureNumber: true },
    });
    expect(tx.siteMeasure.create.mock.calls[0][0].data.siteMeasureNumber).toBe(
      7
    );
  });
});

describe("createInvoice — atomic number allocation", () => {
  it("allocates via an increment-returning Organization update", async () => {
    tx.estimate.findFirst.mockResolvedValue({
      id: 3,
      orgId: "org_1",
      terms: "",
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [],
      siteMeasure: { items: [] },
      invoices: [],
    });
    tx.organization.update.mockResolvedValue({
      nextInvoiceNumber: 12,
      defaultPaymentInstructions: "",
    });
    tx.invoice.create.mockResolvedValue({ id: 70 });

    await createInvoice("org_1", { estimateId: 3, pct: 0 });

    expect(tx.organization.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, defaultPaymentInstructions: true },
    });
    expect(tx.invoice.create.mock.calls[0][0].data.invoiceNumber).toBe(11);
  });
});
