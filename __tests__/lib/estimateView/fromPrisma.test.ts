import { describe, expect, it } from "vitest";
import { computeEstimateView } from "@/lib/estimateView/compute";
import { fromPrismaEstimate } from "@/lib/estimateView/fromPrisma";

describe("fromPrismaEstimate — room segments", () => {
  it("carries segments so a linked-area line uses the summed box area", () => {
    const view = computeEstimateView(
      fromPrismaEstimate({
        markupPct: 0,
        depositPct: 0,
        lineItems: [
          {
            id: 1,
            name: "Flooring",
            description: null,
            rate: 2,
            qtyMode: "linked_area",
            qty: null,
            wastePct: 0,
            unitLabel: "ft²",
            linkedRoomIds: [10],
            sortOrder: 0,
          },
        ],
        siteMeasure: {
          items: [
            {
              id: 10,
              type: "room",
              name: "L-shape",
              shape: "rect",
              w: null,
              l: null,
              segments: [
                { w: 10, l: 12 },
                { w: 4, l: 3 },
              ], // 120 + 12 = 132
              note: null,
              text: null,
            },
          ],
        },
      })
    );

    expect(view.lines[0].effectiveQty).toBe(132);
    expect(view.total).toBe(264); // 132 sqft × $2 — was 0 before the fix
  });
});
