import { describe, expect, it } from "vitest";
import {
  canPay,
  canResend,
  canSend,
  canVoid,
  INVOICE_STATUSES,
  type InvoiceStatus,
  isTerminal,
} from "@/lib/invoices/status";

// `void` is canVoid with no payment recorded; any payment blocks it (below).
const table: Record<
  InvoiceStatus,
  { send: boolean; resend: boolean; pay: boolean; void: boolean; term: boolean }
> = {
  draft: { send: true, resend: false, pay: false, void: true, term: false },
  sent: { send: false, resend: true, pay: true, void: true, term: false },
  viewed: { send: false, resend: true, pay: true, void: true, term: false },
  partial: { send: false, resend: true, pay: true, void: true, term: false },
  paid: { send: false, resend: true, pay: false, void: false, term: true },
  void: { send: false, resend: false, pay: false, void: false, term: true },
};

describe("invoice action gating", () => {
  it("covers every status", () => {
    expect(Object.keys(table).sort()).toEqual([...INVOICE_STATUSES].sort());
  });

  it("never voids a paid or already-void invoice", () => {
    expect(canVoid("paid", true)).toBe(false);
    expect(canVoid("void", false)).toBe(false);
  });

  for (const s of INVOICE_STATUSES) {
    it(`never voids a ${s} invoice with a payment recorded`, () => {
      expect(canVoid(s, true)).toBe(false);
    });
  }

  for (const s of INVOICE_STATUSES) {
    it(`gates actions for ${s}`, () => {
      const e = table[s];
      expect(canSend(s)).toBe(e.send);
      expect(canResend(s)).toBe(e.resend);
      expect(canPay(s)).toBe(e.pay);
      expect(canVoid(s, false)).toBe(e.void);
      expect(isTerminal(s)).toBe(e.term);
    });
  }
});
