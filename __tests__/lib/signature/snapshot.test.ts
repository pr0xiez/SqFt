import { describe, expect, it } from "vitest";
import { canonicalize, sha256, snapshotQuote } from "@/lib/signature/snapshot";

describe("canonicalize", () => {
  it("produces deterministic JSON regardless of key insertion order", () => {
    const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
    const b = { c: { x: 2, y: 1 }, a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("emits no whitespace", () => {
    expect(canonicalize({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}');
  });

  it("handles null and missing keys", () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });
});

describe("sha256", () => {
  it("produces the expected hex digest for a known input", () => {
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("is deterministic", () => {
    expect(sha256("x")).toBe(sha256("x"));
  });
});

describe("snapshotQuote", () => {
  const quote = {
    quoteNumber: 5001,
    date: new Date("2026-05-01T00:00:00Z"),
    taxRate: 0.075,
    markupPct: 35,
    depositPct: 0.5,
    estimate: {
      customer: {
        name: "J. Henderson",
        address: "1247 Elm St",
        email: "h@example.com",
        phone: "555",
      },
      items: [
        {
          id: 1,
          type: "room" as const,
          name: "Living",
          w: 14,
          l: 18,
          shape: "rect" as const,
          note: null,
          text: null,
        },
      ],
    },
    lineItems: [
      {
        id: 1,
        sortOrder: 0,
        name: "LVP",
        rate: 4.85,
        qtyMode: "manual" as const,
        qty: 545,
        wastePct: 0,
        unitLabel: "ft²",
        linkedRoomIds: [],
      },
    ],
    org: {
      name: "Mike's Flooring",
      address: "842 Industrial Pkwy",
      phone: "(614) 555-0100",
      licenseNumber: "OH-FL-44129",
      logo: null,
    },
  };

  it("produces a snapshot containing all required top-level keys", () => {
    const snap = snapshotQuote(quote);
    expect(snap).toMatchObject({
      quoteNumber: 5001,
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      customer: expect.objectContaining({ name: "J. Henderson" }),
      org: expect.objectContaining({ name: "Mike's Flooring" }),
      items: expect.any(Array),
      lineItems: expect.any(Array),
      totals: expect.objectContaining({
        subtotal: expect.any(Number),
        tax: expect.any(Number),
        total: expect.any(Number),
      }),
    });
  });

  it("produces a stable hash for the same input", () => {
    const a = sha256(canonicalize(snapshotQuote(quote)));
    const b = sha256(canonicalize(snapshotQuote(quote)));
    expect(a).toBe(b);
  });

  it("changes the hash when a line item rate changes", () => {
    const a = sha256(canonicalize(snapshotQuote(quote)));
    const modified = {
      ...quote,
      lineItems: [{ ...quote.lineItems[0], rate: 4.86 }],
    };
    const b = sha256(canonicalize(snapshotQuote(modified)));
    expect(a).not.toBe(b);
  });
});
