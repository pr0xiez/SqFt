import { describe, expect, it } from "vitest";
import {
  estimateCreateSchema,
  estimateDeclineSchema,
  estimateSendSchema,
  estimateUpdateSchema,
} from "@/lib/estimates/schema";

// NOTE: the linked GitHub issue describes a `convenienceFeeRate` (0–1) field
// on the estimate-update schema. The convenience-fee feature was removed
// (see prisma/migrations/20260627000000_drop_convenience_fee and
// docs/superpowers/plans/2026-06-27-remove-convenience-fee.md) and the
// current `estimateUpdateSchema` has no such field at all. These tests
// reflect the schema as it actually stands today.

describe("estimateCreateSchema", () => {
  it("accepts a valid siteMeasureId", () => {
    expect(estimateCreateSchema.safeParse({ siteMeasureId: 1 }).success).toBe(
      true
    );
  });

  it("rejects a non-positive siteMeasureId", () => {
    expect(estimateCreateSchema.safeParse({ siteMeasureId: 0 }).success).toBe(
      false
    );
    expect(estimateCreateSchema.safeParse({ siteMeasureId: -1 }).success).toBe(
      false
    );
  });

  it("rejects a non-integer siteMeasureId", () => {
    expect(estimateCreateSchema.safeParse({ siteMeasureId: 1.5 }).success).toBe(
      false
    );
  });

  it("rejects a missing siteMeasureId", () => {
    expect(estimateCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("estimateUpdateSchema", () => {
  it("accepts an empty patch (every field optional)", () => {
    expect(estimateUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts every valid status enum value", () => {
    for (const status of ["draft", "sent"] as const) {
      expect(estimateUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it.each(["approved", "declined"])("rejects forged %s status", (status) => {
    expect(estimateUpdateSchema.safeParse({ status }).success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    expect(estimateUpdateSchema.safeParse({ status: "voided" }).success).toBe(
      false
    );
  });

  it("accepts markupPct of 0", () => {
    expect(estimateUpdateSchema.safeParse({ markupPct: 0 }).success).toBe(true);
  });

  it("accepts a markupPct greater than 1 (no upper bound)", () => {
    expect(estimateUpdateSchema.safeParse({ markupPct: 2.5 }).success).toBe(
      true
    );
  });

  it("rejects a negative markupPct", () => {
    expect(estimateUpdateSchema.safeParse({ markupPct: -0.01 }).success).toBe(
      false
    );
  });

  it("accepts depositPct at the 0 and 1 boundaries", () => {
    expect(estimateUpdateSchema.safeParse({ depositPct: 0 }).success).toBe(
      true
    );
    expect(estimateUpdateSchema.safeParse({ depositPct: 1 }).success).toBe(
      true
    );
  });

  it("rejects depositPct just outside 0–1", () => {
    expect(
      estimateUpdateSchema.safeParse({ depositPct: -0.0001 }).success
    ).toBe(false);
    expect(estimateUpdateSchema.safeParse({ depositPct: 1.0001 }).success).toBe(
      false
    );
  });

  describe("lineItems", () => {
    const baseItem = { name: "Hardwood install", rate: 5.5 };

    it("accepts a minimal valid line item", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [baseItem],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        const item = r.data.lineItems?.[0];
        // defaults
        expect(item?.qtyMode).toBe("manual");
        expect(item?.wastePct).toBe(0);
        expect(item?.unitLabel).toBe("ft²");
        expect(item?.linkedRoomIds).toEqual([]);
        expect(item?.sortOrder).toBe(0);
      }
    });

    it("accepts a fully populated line item", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [
          {
            id: 1,
            name: "Hardwood install",
            description: "Oak plank",
            rate: 5.5,
            qtyMode: "linked_area",
            qty: 120,
            wastePct: 0.1,
            unitLabel: "sqft",
            linkedRoomIds: [1, 2],
            sortOrder: 2,
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects a line item missing the required name", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ rate: 5.5 }],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a line item missing the required rate", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ name: "Hardwood install" }],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a non-numeric rate", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ name: "x", rate: "5.5" }],
      });
      expect(r.success).toBe(false);
    });

    it("rejects an invalid qtyMode enum value", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ ...baseItem, qtyMode: "linked_volume" }],
      });
      expect(r.success).toBe(false);
    });

    it("accepts every valid qtyMode enum value", () => {
      for (const qtyMode of [
        "manual",
        "linked_area",
        "linked_perimeter",
      ] as const) {
        const r = estimateUpdateSchema.safeParse({
          lineItems: [{ ...baseItem, qtyMode }],
        });
        expect(r.success).toBe(true);
      }
    });

    it("allows a nullish qty and description", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ ...baseItem, qty: null, description: null }],
      });
      expect(r.success).toBe(true);
    });

    it("rejects a non-integer linkedRoomIds entry", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ ...baseItem, linkedRoomIds: [1.5] }],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a non-integer id", () => {
      const r = estimateUpdateSchema.safeParse({
        lineItems: [{ ...baseItem, id: 1.5 }],
      });
      expect(r.success).toBe(false);
    });
  });
});

describe("estimateSendSchema", () => {
  const base = { to: "customer@example.com", subject: "Your estimate" };

  it("accepts a minimal valid payload", () => {
    expect(estimateSendSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a malformed `to` email", () => {
    expect(
      estimateSendSchema.safeParse({ ...base, to: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects an empty subject", () => {
    expect(estimateSendSchema.safeParse({ ...base, subject: "" }).success).toBe(
      false
    );
  });

  it("accepts a subject at the 200-char maximum", () => {
    expect(
      estimateSendSchema.safeParse({ ...base, subject: "s".repeat(200) })
        .success
    ).toBe(true);
  });

  it("rejects a subject over the 200-char maximum", () => {
    expect(
      estimateSendSchema.safeParse({ ...base, subject: "s".repeat(201) })
        .success
    ).toBe(false);
  });

  it("accepts a message at the 2000-char maximum", () => {
    expect(
      estimateSendSchema.safeParse({ ...base, message: "m".repeat(2000) })
        .success
    ).toBe(true);
  });

  it("rejects a message over the 2000-char maximum", () => {
    expect(
      estimateSendSchema.safeParse({ ...base, message: "m".repeat(2001) })
        .success
    ).toBe(false);
  });

  it("allows an optional regenerateLink boolean", () => {
    expect(
      estimateSendSchema.safeParse({ ...base, regenerateLink: true }).success
    ).toBe(true);
  });
});

describe("estimateDeclineSchema", () => {
  it("allows omitting the reason entirely", () => {
    expect(estimateDeclineSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a reason at the 1000-char maximum", () => {
    expect(
      estimateDeclineSchema.safeParse({ reason: "r".repeat(1000) }).success
    ).toBe(true);
  });

  it("rejects a reason over the 1000-char maximum", () => {
    expect(
      estimateDeclineSchema.safeParse({ reason: "r".repeat(1001) }).success
    ).toBe(false);
  });
});
