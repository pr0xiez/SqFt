import { describe, expect, it } from "vitest";
import {
  customerCreateSchema,
  customerUpdateSchema,
} from "@/lib/customers/schema";

describe("customerCreateSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = customerCreateSchema.safeParse({ name: "Jane Doe" });
    expect(r.success).toBe(true);
    if (r.success) {
      // source defaults to "phone" when omitted
      expect(r.data.source).toBe("phone");
    }
  });

  it("accepts a fully populated payload", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      phone: "614-555-0100",
      email: "jane@example.com",
      source: "referral",
      notes: "Prefers morning appointments.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(customerCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty name (below the 1-char minimum)", () => {
    expect(customerCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts a name at the 200-char maximum", () => {
    const r = customerCreateSchema.safeParse({ name: "a".repeat(200) });
    expect(r.success).toBe(true);
  });

  it("rejects a name over the 200-char maximum", () => {
    const r = customerCreateSchema.safeParse({ name: "a".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("accepts a phone at the 30-char maximum", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      phone: "1".repeat(30),
    });
    expect(r.success).toBe(true);
  });

  it("rejects a phone over the 30-char maximum", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      phone: "1".repeat(31),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty string for email (explicit no-email sentinel)", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      email: "",
    });
    expect(r.success).toBe(true);
  });

  it("allows omitting email entirely", () => {
    const r = customerCreateSchema.safeParse({ name: "Jane Doe" });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid source value", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      source: "carrier-pigeon",
    });
    expect(r.success).toBe(false);
  });

  it("accepts every valid source enum value", () => {
    for (const source of [
      "phone",
      "online",
      "referral",
      "walkin",
      "website",
    ] as const) {
      expect(
        customerCreateSchema.safeParse({ name: "Jane Doe", source }).success
      ).toBe(true);
    }
  });

  it("accepts notes at the 2000-char maximum", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      notes: "n".repeat(2000),
    });
    expect(r.success).toBe(true);
  });

  it("rejects notes over the 2000-char maximum", () => {
    const r = customerCreateSchema.safeParse({
      name: "Jane Doe",
      notes: "n".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("allows omitting notes", () => {
    expect(customerCreateSchema.safeParse({ name: "Jane Doe" }).success).toBe(
      true
    );
  });
});

describe("customerUpdateSchema", () => {
  it("accepts an empty patch (every field optional)", () => {
    expect(customerUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("does not default source when omitted", () => {
    const r = customerUpdateSchema.safeParse({ name: "Jane Doe" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.source).toBeUndefined();
    }
  });

  it("rejects an empty-string name if provided", () => {
    expect(customerUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over the 200-char maximum", () => {
    expect(
      customerUpdateSchema.safeParse({ name: "a".repeat(201) }).success
    ).toBe(false);
  });

  it("rejects an invalid source value", () => {
    expect(
      customerUpdateSchema.safeParse({ source: "smoke-signal" }).success
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(customerUpdateSchema.safeParse({ email: "nope" }).success).toBe(
      false
    );
  });

  it("rejects notes over the 2000-char maximum", () => {
    expect(
      customerUpdateSchema.safeParse({ notes: "n".repeat(2001) }).success
    ).toBe(false);
  });
});
