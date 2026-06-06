import { describe, expect, it } from "vitest";
import { reduceEstimateDraft } from "@/lib/estimateDraft";
import type { EstimateDraft } from "@/lib/estimateDraft/types";
import { computeEstimateView } from "@/lib/estimateView";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc } from "@/lib/utils";
import { QtyMode } from "@/lib/utils";

const template = (over: Partial<LineItemTemplate> = {}): LineItemTemplate => ({
  id: 100,
  orgId: "org",
  name: "Laminate Install",
  description: "Glue-down",
  rate: 4.25,
  unitLabel: "sqft",
  archived: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const li = (over: Partial<LineItemCalc> = {}): LineItemCalc => ({
  id: 1,
  name: "Item",
  description: null,
  rate: 0,
  qtyMode: QtyMode.Manual,
  qty: null,
  wastePct: 0,
  unitLabel: "sqft",
  linkedRoomIds: [],
  sortOrder: 0,
  ...over,
});

const draft = (over: Partial<EstimateDraft> = {}): EstimateDraft => ({
  lineItems: [],
  convenienceFeeRate: 0.03,
  markupPct: 0,
  depositPct: 0.5,
  ...over,
});

describe("reduceEstimateDraft — addLineItem", () => {
  it("appends a new manual line with the supplied id and sortOrder = current length, saving lineItems", () => {
    const start = draft({ lineItems: [li({ id: 1 })] });

    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "addLineItem",
      id: 42,
    });

    expect(next.lineItems).toHaveLength(2);
    const added = next.lineItems[1];
    expect(added.id).toBe(42);
    expect(added.qtyMode).toBe(QtyMode.Manual);
    expect(added.sortOrder).toBe(1);
    expect(added.qty).toBe(0);
    expect(save).toEqual({ lineItems: next.lineItems });
  });

  it("seeds qty 0 so the new line resolves to a subtotal (not flagged as unset)", () => {
    const { draft: next } = reduceEstimateDraft(draft(), {
      type: "addLineItem",
      id: 7,
    });

    const view = computeEstimateView({
      lineItems: next.lineItems,
      items: [],
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0,
    });

    // qty 0 → effectiveQty 0 → subtotal 0 (NOT null), so the row is not flagged.
    expect(view.lines[0].subtotal).toBe(0);
    expect(view.lines[0].subtotal).not.toBeNull();
  });
});

describe("reduceEstimateDraft — updateLineItem", () => {
  it("patches the targeted line and saves lineItems immediately", () => {
    const start = draft({ lineItems: [li({ id: 1 }), li({ id: 2, rate: 1 })] });

    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "updateLineItem",
      id: 2,
      patch: { rate: 9, qty: 3 },
    });

    expect(next.lineItems[0]).toEqual(start.lineItems[0]);
    expect(next.lineItems[1].rate).toBe(9);
    expect(next.lineItems[1].qty).toBe(3);
    expect(save).toEqual({ lineItems: next.lineItems });
  });

  it("leaves the draft unchanged for an unknown id but still emits a save (no-op patch is harmless)", () => {
    const start = draft({ lineItems: [li({ id: 1 })] });

    const { draft: next } = reduceEstimateDraft(start, {
      type: "updateLineItem",
      id: 999,
      patch: { rate: 5 },
    });

    expect(next.lineItems).toEqual(start.lineItems);
  });
});

describe("reduceEstimateDraft — money field setters", () => {
  it("setConvenienceFeeRate stores the decimal and saves just that field", () => {
    const start = draft({ convenienceFeeRate: 0.03 });
    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "setConvenienceFeeRate",
      value: 0.1,
    });
    expect(next.convenienceFeeRate).toBe(0.1);
    expect(save).toEqual({ convenienceFeeRate: 0.1 });
  });

  it("setMarkupPct stores the percent and saves just that field", () => {
    const start = draft({ markupPct: 0 });
    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "setMarkupPct",
      value: 20,
    });
    expect(next.markupPct).toBe(20);
    expect(save).toEqual({ markupPct: 20 });
  });

  it("setDepositPct stores the decimal and saves just that field", () => {
    const start = draft({ depositPct: 0.5 });
    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "setDepositPct",
      value: 0.25,
    });
    expect(next.depositPct).toBe(0.25);
    expect(save).toEqual({ depositPct: 0.25 });
  });
});

describe("reduceEstimateDraft — applyTemplate", () => {
  it("copies name/description/rate/unitLabel and saves, but never qty, scope, or waste", () => {
    const start = draft({
      lineItems: [
        li({
          id: 1,
          name: "Old",
          description: "old desc",
          rate: 1,
          unitLabel: "lf",
          qtyMode: QtyMode.LinkedArea,
          qty: 12,
          wastePct: 10,
          linkedRoomIds: [5, 6],
        }),
      ],
    });

    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "applyTemplate",
      id: 1,
      template: template({
        name: "Laminate Install",
        description: "Glue-down",
        rate: 4.25,
        unitLabel: "sqft",
      }),
    });

    const line = next.lineItems[0];
    // Copied from the template.
    expect(line.name).toBe("Laminate Install");
    expect(line.description).toBe("Glue-down");
    expect(line.rate).toBe(4.25);
    expect(line.unitLabel).toBe("sqft");
    // Preserved from the line item — templates carry no qty/scope/waste.
    expect(line.qtyMode).toBe(QtyMode.LinkedArea);
    expect(line.qty).toBe(12);
    expect(line.wastePct).toBe(10);
    expect(line.linkedRoomIds).toEqual([5, 6]);
    expect(save).toEqual({ lineItems: next.lineItems });
  });

  it("copies a null template description as null", () => {
    const start = draft({ lineItems: [li({ id: 1, description: "keep?" })] });

    const { draft: next } = reduceEstimateDraft(start, {
      type: "applyTemplate",
      id: 1,
      template: template({ description: null }),
    });

    expect(next.lineItems[0].description).toBeNull();
  });
});

describe("reduceEstimateDraft — editLineItemText + flush", () => {
  it("editLineItemText updates the draft but saves nothing", () => {
    const start = draft({ lineItems: [li({ id: 1, name: "Old" })] });

    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "editLineItemText",
      id: 1,
      patch: { name: "New name" },
    });

    expect(next.lineItems[0].name).toBe("New name");
    expect(save).toBeNull();
  });

  it("flush persists the current lineItems", () => {
    const start = draft({ lineItems: [li({ id: 1, name: "Edited" })] });

    const { draft: next, save } = reduceEstimateDraft(start, { type: "flush" });

    expect(next).toEqual(start);
    expect(save).toEqual({ lineItems: start.lineItems });
  });
});

describe("reduceEstimateDraft — commitSubtotal", () => {
  it("back-calculates rate = nextSubtotal / effectiveQty at full precision and saves", () => {
    const start = draft({ lineItems: [li({ id: 1, rate: 10, qty: 4 })] });

    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "commitSubtotal",
      id: 1,
      effectiveQty: 3,
      nextSubtotal: 100,
    });

    // 100 / 3 — kept at full precision, not rounded.
    expect(next.lineItems[0].rate).toBeCloseTo(33.3333333, 6);
    expect(next.lineItems[0].rate).not.toBe(33.33);
    expect(save).toEqual({ lineItems: next.lineItems });
  });

  it("is a no-op (no change, no save) when effectiveQty is 0", () => {
    const start = draft({ lineItems: [li({ id: 1, rate: 10 })] });
    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "commitSubtotal",
      id: 1,
      effectiveQty: 0,
      nextSubtotal: 100,
    });
    expect(next).toEqual(start);
    expect(save).toBeNull();
  });

  it("is a no-op when effectiveQty is null", () => {
    const start = draft({ lineItems: [li({ id: 1, rate: 10 })] });
    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "commitSubtotal",
      id: 1,
      effectiveQty: null,
      nextSubtotal: 100,
    });
    expect(next).toEqual(start);
    expect(save).toBeNull();
  });

  it("is a no-op when nextSubtotal is null or negative", () => {
    const start = draft({ lineItems: [li({ id: 1, rate: 10 })] });
    for (const nextSubtotal of [null, -5]) {
      const { draft: next, save } = reduceEstimateDraft(start, {
        type: "commitSubtotal",
        id: 1,
        effectiveQty: 4,
        nextSubtotal,
      });
      expect(next).toEqual(start);
      expect(save).toBeNull();
    }
  });
});

describe("reduceEstimateDraft — removeLineItem", () => {
  it("drops the targeted line and saves the remaining lineItems", () => {
    const start = draft({ lineItems: [li({ id: 1 }), li({ id: 2 })] });

    const { draft: next, save } = reduceEstimateDraft(start, {
      type: "removeLineItem",
      id: 1,
    });

    expect(next.lineItems).toHaveLength(1);
    expect(next.lineItems[0].id).toBe(2);
    expect(save).toEqual({ lineItems: next.lineItems });
  });
});
