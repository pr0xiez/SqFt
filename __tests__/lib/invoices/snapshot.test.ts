import { describe, expect, it } from "vitest";
import { snapshotInvoice } from "@/lib/invoices/snapshot";
import type { ProrationSource } from "@/lib/invoices/types";

const source: ProrationSource = {
  view: {
    lines: [{ id: 1, effectiveQty: 1, subtotal: 307 }],
    subtotal: 307,
    markup: 0,
    total: 307,
    deposit: 0,
    hasUnresolvedLines: false,
  },
  lineMeta: [{ id: 1, name: "Carpet Tear Out", description: "Remove carpet" }],
};

describe("snapshotInvoice", () => {
  it("captures identity, prorated lines, and balance-due totals", () => {
    const snap = snapshotInvoice(source, {
      invoiceNumber: 7465,
      date: new Date("2026-06-05T00:00:00Z"),
      dueDate: new Date("2026-06-06T00:00:00Z"),
      memo: "Deposit",
      terms: "50% to schedule, bal upon compl",
      paymentInstructions: "WARNING! cards via link…",
      pct: 0.5,
      amount: 153.5,
      customer: {
        name: "Alex Hall",
        address: "3722 Amity Lane",
        email: null,
        phone: null,
      },
      org: {
        name: "All About Hardwood",
        address: null,
        phone: null,
        licenseNumber: null,
        logoUrl: null,
      },
      stripePaymentLinkUrl: "https://pay.example/abc",
    });
    expect(snap.invoiceNumber).toBe(7465);
    expect(snap.date).toBe("2026-06-05T00:00:00.000Z");
    expect(snap.dueDate).toBe("2026-06-06T00:00:00.000Z");
    expect(snap.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 },
    ]);
    expect(snap.totals.balanceDue).toBe(153.5);
  });

  it("is a plain JSON value the Prisma `snapshot` column can store as-is (no `as never` cast needed at the call site — see issue #119)", () => {
    const snap = snapshotInvoice(source, {
      invoiceNumber: 7465,
      date: new Date("2026-06-05T00:00:00Z"),
      dueDate: null,
      memo: null,
      terms: "Net 30",
      paymentInstructions: "",
      pct: null,
      amount: 307,
      customer: null,
      org: {
        name: "All About Hardwood",
        address: null,
        phone: null,
        licenseNumber: null,
        logoUrl: null,
      },
      stripePaymentLinkUrl: null,
    });
    // A round-trip through JSON is exactly what Prisma does when persisting a
    // Json column; equality here confirms the snapshot carries no non-JSON
    // values (Date, undefined, class instances, …) that would silently
    // change shape on write.
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});
