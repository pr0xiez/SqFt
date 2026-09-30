import { describe, expect, it } from "vitest";
import {
  buildQboCustomer,
  buildQboInvoice,
  buildQboPayment,
  docNumberCandidates,
  paymentRefNum,
} from "@/lib/qbo/mapping";
import { makeSnapshot } from "./fixtures";

describe("buildQboCustomer", () => {
  it("maps contact fields and drops absent ones", () => {
    const body = buildQboCustomer({
      name: "Sam Waters",
      email: "sam@example.com",
      phone: null,
      address: "1 Main St",
    });
    expect(body).toEqual({
      DisplayName: "Sam Waters",
      PrimaryEmailAddr: { Address: "sam@example.com" },
      BillAddr: { Line1: "1 Main St" },
    });
  });

  it("accepts a display-name override (collision suffix)", () => {
    const body = buildQboCustomer(
      { name: "Sam", email: null, phone: null, address: null },
      "Sam (SqFt)"
    );
    expect(body.DisplayName).toBe("Sam (SqFt)");
  });
});

describe("buildQboInvoice", () => {
  const base = {
    customerQboId: "55",
    itemId: "9",
    docNumber: "42",
  };

  it("builds lines from the frozen snapshot with folded amounts and no markup row", () => {
    const body = buildQboInvoice({ snapshot: makeSnapshot(), ...base });
    expect(body.DocNumber).toBe("42");
    expect(body.TxnDate).toBe("2026-07-01");
    expect(body.DueDate).toBe("2026-07-31");
    expect(body.CustomerRef).toEqual({ value: "55" });
    expect(body.Line).toHaveLength(2);
    expect(body.Line[0]).toEqual({
      DetailType: "SalesItemLineDetail",
      Amount: 300,
      Description: "LVP install — Living room",
      SalesItemLineDetail: {
        ItemRef: { value: "9" },
        TaxCodeRef: { value: "NON" },
      },
    });
    expect(body.Line[1].Description).toBe("Trim");
    expect(body.Line.reduce((s, l) => s + l.Amount, 0)).toBe(450);
    expect(body.TxnTaxDetail).toBeUndefined();
    expect(body.PrivateNote).toBe("Deposit for LVP install");
  });

  it("emits the tax override when the snapshot carries the tax contract", () => {
    const snapshot = makeSnapshot({
      totals: {
        subtotal: 500,
        markup: 50,
        balanceDue: 481.5,
        taxRate: 0.07,
        taxableSubtotal: 450,
        taxAmount: 31.5,
      },
    });
    const body = buildQboInvoice({ snapshot, ...base });
    expect(body.TxnTaxDetail).toEqual({ TotalTax: 31.5 });
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({
      value: "TAX",
    });
  });

  it("omits DueDate when the snapshot has none", () => {
    const body = buildQboInvoice({
      snapshot: makeSnapshot({ dueDate: null }),
      ...base,
    });
    expect(body.DueDate).toBeUndefined();
  });
});

describe("buildQboPayment", () => {
  it("links the payment to the invoice with the ref-num idempotency key", () => {
    const body = buildQboPayment({
      source: {
        paymentId: 9,
        amount: 200,
        paidAt: "2026-07-02T15:00:00.000Z",
        method: "check",
        reference: "1042",
      },
      customerQboId: "55",
      invoiceQboId: "77",
      openBalance: 450,
    });
    expect(body).toEqual({
      TotalAmt: 200,
      TxnDate: "2026-07-02",
      CustomerRef: { value: "55" },
      PaymentRefNum: "SQFT-P9",
      PrivateNote: "check 1042",
      Line: [
        {
          Amount: 200,
          LinkedTxn: [{ TxnId: "77", TxnType: "Invoice" }],
        },
      ],
    });
  });
});

describe("doc numbers", () => {
  it("prefers the customer-facing number, falls back prefixed", () => {
    expect(docNumberCandidates(42)).toEqual(["42", "SQFT-42"]);
  });
  it("payment ref num is stable", () => {
    expect(paymentRefNum(9)).toBe("SQFT-P9");
  });
});
