import { describe, expect, it } from "vitest";
import { computeEstimateView } from "@/lib/estimateView/compute";
import {
  fromPrismaEstimate,
  type PrismaEstimateForView,
} from "@/lib/estimateView/fromPrisma";

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

  it("survives a malformed segments JSON value by falling back to legacy w/l", () => {
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
              name: "Den",
              shape: "rect",
              w: 10,
              l: 12,
              // A non-array with a .length property: the worst case for the
              // old bare cast, which let it reach roomSqft's reduce and throw.
              segments: "10x12",
              note: null,
              text: null,
            },
          ],
        },
      })
    );

    expect(view.lines[0].effectiveQty).toBe(120);
  });
});

describe("fromPrismaEstimate — EstimateInput mapping", () => {
  it("maps a fully-populated estimate (line items + rooms) to EstimateInput", () => {
    const prismaEstimate: PrismaEstimateForView = {
      markupPct: 15,
      depositPct: 0.5,
      lineItems: [
        {
          id: 1,
          name: "Oak flooring",
          description: "3/4in solid oak",
          rate: 6.5,
          qtyMode: "linked_area",
          qty: null,
          wastePct: 10,
          unitLabel: "sqft",
          linkedRoomIds: [10, 11],
          sortOrder: 0,
        },
      ],
      siteMeasure: {
        items: [
          {
            id: 10,
            type: "room",
            name: "Living Room",
            shape: "rect",
            w: 12,
            l: 15,
            segments: [
              { w: 12, l: 15 },
              { w: 3, l: 3 },
            ],
            note: "open concept",
            text: null,
          },
        ],
      },
    };

    const input = fromPrismaEstimate(prismaEstimate);

    expect(input.markupPct).toBe(15);
    expect(input.depositPct).toBe(0.5);

    expect(input.lineItems).toEqual([
      {
        id: 1,
        name: "Oak flooring",
        description: "3/4in solid oak",
        rate: 6.5,
        qtyMode: "linked_area",
        qty: null,
        wastePct: 10,
        unitLabel: "sqft",
        linkedRoomIds: [10, 11],
        sortOrder: 0,
      },
    ]);

    expect(input.items).toEqual([
      {
        id: 10,
        type: "room",
        shape: "rect",
        w: 12,
        l: 15,
        segments: [
          { w: 12, l: 15 },
          { w: 3, l: 3 },
        ],
        name: "Living Room",
        note: "open concept",
        text: null,
      },
    ]);
  });

  it("defaults null/undefined optional fields on line items and rooms", () => {
    const prismaEstimate: PrismaEstimateForView = {
      markupPct: 0,
      depositPct: 0,
      lineItems: [
        {
          id: 2,
          name: "Manual line",
          rate: 1,
          qtyMode: "manual",
          qty: 100,
          wastePct: 0,
          unitLabel: "ea",
          linkedRoomIds: [],
          // description and sortOrder omitted
        },
      ],
      siteMeasure: {
        items: [
          {
            id: 20,
            type: "note",
            segments: null,
            // name, shape, w, l, note, text omitted; segments explicitly null
          },
        ],
      },
    };

    const input = fromPrismaEstimate(prismaEstimate);

    expect(input.lineItems[0]).toEqual({
      id: 2,
      name: "Manual line",
      description: null,
      rate: 1,
      qtyMode: "manual",
      qty: 100,
      wastePct: 0,
      unitLabel: "ea",
      linkedRoomIds: [],
      sortOrder: undefined,
    });

    expect(input.items[0]).toEqual({
      id: 20,
      type: "note",
      shape: null,
      w: null,
      l: null,
      segments: undefined,
      name: null,
      note: null,
      text: null,
    });
  });

  it("narrows an unrecognized qtyMode string to manual", () => {
    const prismaEstimate: PrismaEstimateForView = {
      markupPct: 0,
      depositPct: 0,
      lineItems: [
        {
          id: 3,
          name: "Legacy line",
          rate: 2,
          qtyMode: "some_legacy_value",
          qty: 5,
          wastePct: 0,
          unitLabel: "ea",
          linkedRoomIds: [],
        },
      ],
      siteMeasure: { items: [] },
    };

    const input = fromPrismaEstimate(prismaEstimate);
    expect(input.lineItems[0].qtyMode).toBe("manual");
  });

  it('narrows an unrecognized room type to "room" and unrecognized shape to null', () => {
    const prismaEstimate: PrismaEstimateForView = {
      markupPct: 0,
      depositPct: 0,
      lineItems: [],
      siteMeasure: {
        items: [
          {
            id: 30,
            type: "anything-else",
            shape: "circle",
            segments: null,
          },
        ],
      },
    };

    const input = fromPrismaEstimate(prismaEstimate);
    expect(input.items[0].type).toBe("room");
    expect(input.items[0].shape).toBeNull();
  });

  it("handles an empty line items array and empty site measure items", () => {
    const prismaEstimate: PrismaEstimateForView = {
      markupPct: 20,
      depositPct: 0.25,
      lineItems: [],
      siteMeasure: { items: [] },
    };

    const input = fromPrismaEstimate(prismaEstimate);

    expect(input.lineItems).toEqual([]);
    expect(input.items).toEqual([]);
    expect(input.markupPct).toBe(20);
    expect(input.depositPct).toBe(0.25);
  });

  it("drops malformed room segments back to undefined", () => {
    const prismaEstimate: PrismaEstimateForView = {
      markupPct: 0,
      depositPct: 0,
      lineItems: [],
      siteMeasure: {
        items: [
          { id: 40, type: "room", segments: "not-an-array" },
          { id: 41, type: "room", segments: [] },
        ],
      },
    };

    const input = fromPrismaEstimate(prismaEstimate);
    expect(input.items[0].segments).toBeUndefined();
    expect(input.items[1].segments).toBeUndefined();
  });
});
