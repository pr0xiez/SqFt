import { describe, expect, it } from "vitest";
import {
  invoiceCreateSchema,
  invoicePaymentSchema,
} from "@/lib/invoices/schema";

describe("invoiceCreateSchema", () => {
  it("accepts a flat-dollar invoice", () => {
    const r = invoiceCreateSchema.safeParse({ amount: 1500, memo: "Deposit" });
    expect(r.success).toBe(true);
  });
  it("accepts a percentage invoice", () => {
    const r = invoiceCreateSchema.safeParse({ pct: 0.5 });
    expect(r.success).toBe(true);
  });
  it("rejects when neither amount nor pct is given", () => {
    const r = invoiceCreateSchema.safeParse({ memo: "x" });
    expect(r.success).toBe(false);
  });
  it("rejects when both amount and pct are given", () => {
    const r = invoiceCreateSchema.safeParse({ amount: 100, pct: 0.5 });
    expect(r.success).toBe(false);
  });
});

describe("invoicePaymentSchema", () => {
  it("requires a positive amount and a method", () => {
    expect(
      invoicePaymentSchema.safeParse({ amount: 100, method: "check" }).success
    ).toBe(true);
    expect(
      invoicePaymentSchema.safeParse({ amount: 0, method: "check" }).success
    ).toBe(false);
    expect(
      invoicePaymentSchema.safeParse({ amount: 100, method: "bitcoin" }).success
    ).toBe(false);
  });
});
