import { describe, expect, it } from "vitest";
import {
  addDays,
  dateStr,
  deepCopy,
  estTotalArea,
  fmtBig,
  fmtDayHead,
  fmtDollar,
  getEffectiveQty,
  getWeekStart,
  type LineItemCalc,
  liSubtotal,
  parsef,
  type RoomItem,
  roomPerimeter,
  roomSqft,
  sourceName,
  timeToMinutes,
} from "@/lib/utils";

// ── parsef ────────────────────────────────────────────────────────────────────

describe("parsef", () => {
  it("parses integer strings", () => expect(parsef("42")).toBe(42));
  it("parses float strings", () => expect(parsef("3.14")).toBe(3.14));
  it("parses number values directly", () => expect(parsef(7)).toBe(7));
  it("returns null for empty string", () => expect(parsef("")).toBeNull());
  it("returns null for null", () => expect(parsef(null)).toBeNull());
  it("returns null for undefined", () => expect(parsef(undefined)).toBeNull());
  it("returns null for non-numeric string", () =>
    expect(parsef("abc")).toBeNull());
});

// ── fmtBig ────────────────────────────────────────────────────────────────────

describe("fmtBig", () => {
  it("formats whole numbers with $ prefix", () =>
    expect(fmtBig(4250)).toBe("$4,250"));
  it("rounds decimals", () => expect(fmtBig(4250.75)).toBe("$4,251"));
  it("formats small numbers", () => expect(fmtBig(0)).toBe("$0"));
});

// ── fmtDollar ─────────────────────────────────────────────────────────────────

describe("fmtDollar", () => {
  it("formats with two decimal places", () =>
    expect(fmtDollar(42.5)).toBe("$42.50"));
  it("returns em dash for null", () => expect(fmtDollar(null)).toBe("—"));
  it("returns em dash for undefined", () =>
    expect(fmtDollar(undefined)).toBe("—"));
});

// ── deepCopy ──────────────────────────────────────────────────────────────────

describe("deepCopy", () => {
  it("returns a new object not equal by reference", () => {
    const obj = { a: 1, b: { c: 2 } };
    const copy = deepCopy(obj);
    expect(copy).toEqual(obj);
    expect(copy).not.toBe(obj);
    expect(copy.b).not.toBe(obj.b);
  });
});

// ── roomSqft ──────────────────────────────────────────────────────────────────

describe("roomSqft", () => {
  const rectRoom: RoomItem = {
    id: 1,
    type: "room",
    shape: "rect",
    w: "10",
    l: "12",
  };
  const triRoom: RoomItem = {
    id: 2,
    type: "room",
    shape: "tri",
    w: "10",
    l: "8",
  };
  const noteItem: RoomItem = { id: 4, type: "note", text: "See spec" };

  it("calculates rectangular area", () => expect(roomSqft(rectRoom)).toBe(120));
  it("calculates triangular area as half of w*l", () =>
    expect(roomSqft(triRoom)).toBe(40));
  it("returns 0 for note items", () => expect(roomSqft(noteItem)).toBe(0));
  it("returns 0 when dimensions are missing", () => {
    const empty: RoomItem = { id: 5, type: "room", shape: "rect" };
    expect(roomSqft(empty)).toBe(0);
  });
  it("defaults to rect when shape is null", () => {
    const noShape: RoomItem = {
      id: 6,
      type: "room",
      shape: null,
      w: "5",
      l: "4",
    };
    expect(roomSqft(noShape)).toBe(20);
  });
});

// ── roomPerimeter ─────────────────────────────────────────────────────────────

describe("roomPerimeter", () => {
  it("calculates rectangular perimeter as 2(w+l)", () => {
    const rect: RoomItem = {
      id: 1,
      type: "room",
      shape: "rect",
      w: "10",
      l: "15",
    };
    expect(roomPerimeter(rect)).toBe(50);
  });

  it("calculates triangle perimeter as w + l + hypotenuse", () => {
    const tri: RoomItem = {
      id: 2,
      type: "room",
      shape: "tri",
      w: "3",
      l: "4",
    };
    expect(roomPerimeter(tri)).toBe(12); // 3 + 4 + 5
  });

  it("returns 0 for note items", () => {
    const note: RoomItem = { id: 3, type: "note", text: "See spec" };
    expect(roomPerimeter(note)).toBe(0);
  });

  it("returns 0 when w is missing", () => {
    const room: RoomItem = { id: 4, type: "room", shape: "rect", l: "10" };
    expect(roomPerimeter(room)).toBe(0);
  });

  it("returns 0 when l is null", () => {
    const room: RoomItem = {
      id: 5,
      type: "room",
      shape: "rect",
      w: "10",
      l: null,
    };
    expect(roomPerimeter(room)).toBe(0);
  });
});

// ── estTotalArea ──────────────────────────────────────────────────────────────

describe("estTotalArea", () => {
  it("sums all room items and ignores notes", () => {
    const items: RoomItem[] = [
      { id: 1, type: "room", shape: "rect", w: "10", l: "10" },
      { id: 2, type: "note", text: "just a note" },
      { id: 3, type: "room", shape: "rect", w: "5", l: "4" },
    ];
    expect(estTotalArea(items)).toBe(120); // 100 + 20
  });

  it("returns 0 for empty array", () => expect(estTotalArea([])).toBe(0));

  it("counts triangle rooms as half of w*l", () => {
    const items: RoomItem[] = [
      { id: 1, type: "room", shape: "tri", w: "10", l: "8" },
    ];
    expect(estTotalArea(items)).toBe(40); // 10*8/2
  });

  it("sums mixed rect and triangle rooms", () => {
    const items: RoomItem[] = [
      { id: 1, type: "room", shape: "rect", w: "10", l: "10" }, // 100
      { id: 2, type: "room", shape: "tri", w: "10", l: "8" }, // 40
      { id: 3, type: "note", text: "note" }, // ignored
    ];
    expect(estTotalArea(items)).toBe(140); // 100 + 40
  });
});

// ── getEffectiveQty ───────────────────────────────────────────────────────────

describe("getEffectiveQty", () => {
  const rooms: RoomItem[] = [
    { id: 1, type: "room", shape: "rect", w: "10", l: "10" }, // 100 sqft
    { id: 2, type: "room", shape: "rect", w: "5", l: "4" }, // 20 sqft
  ];

  it("returns manual qty when mode is manual", () => {
    const li: LineItemCalc = {
      id: 1,
      name: "Carpet",
      rate: 3,
      qtyMode: "manual",
      qty: 150,
      wastePct: 10,
      unitLabel: "sqft",
      linkedRoomIds: [],
    };
    expect(getEffectiveQty(li, rooms)).toBe(150);
  });

  it("sums linked room areas and applies waste% when mode is linked", () => {
    const li: LineItemCalc = {
      id: 2,
      name: "Hardwood",
      rate: 5,
      qtyMode: "linked_area",
      wastePct: 10,
      unitLabel: "sqft",
      linkedRoomIds: [1, 2],
    };
    // 120 sqft * 1.10 = 132
    expect(getEffectiveQty(li, rooms)).toBeCloseTo(132);
  });

  it("returns null when linked mode has no matching rooms", () => {
    const li: LineItemCalc = {
      id: 3,
      name: "Tile",
      rate: 4,
      qtyMode: "linked_area",
      wastePct: 0,
      unitLabel: "sqft",
      linkedRoomIds: [99],
    };
    expect(getEffectiveQty(li, rooms)).toBeNull();
  });

  it("sums linked room perimeters when mode is linked_perimeter (single room)", () => {
    const singleRoom: RoomItem[] = [
      { id: 1, type: "room", shape: "rect", w: "10", l: "10" }, // perimeter 40
    ];
    const li: LineItemCalc = {
      id: 10,
      name: "Shoe mold",
      rate: 2,
      qtyMode: "linked_perimeter",
      wastePct: 0,
      unitLabel: "lf",
      linkedRoomIds: [1],
    };
    expect(getEffectiveQty(li, singleRoom)).toBe(40);
  });

  it("sums linked room perimeters and applies waste% when mode is linked_perimeter (two rooms)", () => {
    const twoRooms: RoomItem[] = [
      { id: 1, type: "room", shape: "rect", w: "10", l: "10" }, // perimeter 40
      { id: 2, type: "room", shape: "rect", w: "10", l: "10" }, // perimeter 40
    ];
    const li: LineItemCalc = {
      id: 11,
      name: "Shoe mold",
      rate: 2,
      qtyMode: "linked_perimeter",
      wastePct: 10,
      unitLabel: "lf",
      linkedRoomIds: [1, 2],
    };
    // (40 + 40) * 1.10 = 88
    expect(getEffectiveQty(li, twoRooms)).toBeCloseTo(88);
  });

  it("returns null when manual qty is null", () => {
    const li: LineItemCalc = {
      id: 4,
      name: "Pad",
      rate: 1,
      qtyMode: "manual",
      qty: null,
      wastePct: 0,
      unitLabel: "sqft",
      linkedRoomIds: [],
    };
    expect(getEffectiveQty(li, rooms)).toBeNull();
  });
});

// ── liSubtotal ────────────────────────────────────────────────────────────────

describe("liSubtotal", () => {
  const rooms: RoomItem[] = [
    { id: 1, type: "room", shape: "rect", w: "10", l: "10" },
  ];

  it("multiplies effective qty by rate", () => {
    const li: LineItemCalc = {
      id: 1,
      name: "Carpet",
      rate: 3.5,
      qtyMode: "manual",
      qty: 100,
      wastePct: 0,
      unitLabel: "sqft",
      linkedRoomIds: [],
    };
    expect(liSubtotal(li, rooms)).toBe(350);
  });

  it("returns null when qty is null", () => {
    const li: LineItemCalc = {
      id: 2,
      name: "Pad",
      rate: 2,
      qtyMode: "linked_area",
      wastePct: 0,
      unitLabel: "sqft",
      linkedRoomIds: [99],
    };
    expect(liSubtotal(li, rooms)).toBeNull();
  });
});

// ── getWeekStart ──────────────────────────────────────────────────────────────

describe("getWeekStart", () => {
  it("returns Monday when given a Wednesday", () => {
    const wed = new Date(2024, 0, 10, 12); // Wednesday, local noon to avoid UTC midnight boundary
    const mon = getWeekStart(wed);
    expect(mon.getDay()).toBe(1);
    expect(dateStr(mon)).toBe("2024-01-08");
  });

  it("returns the previous Monday when given a Sunday", () => {
    const sun = new Date(2024, 0, 14, 12); // Sunday, local noon to avoid UTC midnight boundary
    const mon = getWeekStart(sun);
    expect(mon.getDay()).toBe(1);
    expect(dateStr(mon)).toBe("2024-01-08");
  });

  it("returns the same day when given a Monday", () => {
    // Use local-time constructor (noon) to avoid UTC midnight day-boundary issues
    const mon = new Date(2024, 0, 8, 12);
    const result = getWeekStart(mon);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(8);
  });
});

// ── addDays ───────────────────────────────────────────────────────────────────

describe("addDays", () => {
  const base = new Date(2024, 0, 10, 12); // local noon to avoid UTC midnight boundary
  it("adds positive days", () =>
    expect(dateStr(addDays(base, 5))).toBe("2024-01-15"));
  it("adds negative days (subtracts)", () =>
    expect(dateStr(addDays(base, -3))).toBe("2024-01-07"));
  it("does not mutate the original date", () => {
    addDays(base, 10);
    expect(dateStr(base)).toBe("2024-01-10");
  });
});

// ── timeToMinutes ─────────────────────────────────────────────────────────────

describe("timeToMinutes", () => {
  it('converts "08:30" to 510', () => expect(timeToMinutes("08:30")).toBe(510));
  it('converts "00:00" to 0', () => expect(timeToMinutes("00:00")).toBe(0));
  it('converts "23:59" to 1439', () =>
    expect(timeToMinutes("23:59")).toBe(1439));
  it('handles missing minutes gracefully ("09")', () =>
    expect(timeToMinutes("09")).toBe(540));
});

// ── sourceName ────────────────────────────────────────────────────────────────

describe("sourceName", () => {
  it('maps "phone" to "Phone"', () =>
    expect(sourceName("phone")).toBe("Phone"));
  it('maps "walkin" to "Walk-in"', () =>
    expect(sourceName("walkin")).toBe("Walk-in"));
  it("passes through unknown keys unchanged", () =>
    expect(sourceName("unknown")).toBe("unknown"));
});

// ── fmtDayHead ────────────────────────────────────────────────────────────────

describe("fmtDayHead", () => {
  it("formats a date as 'Mon 8'", () => {
    const mon = new Date("2024-01-08T12:00:00");
    const result = fmtDayHead(mon);
    expect(result).toMatch(/Mon/);
    expect(result).toMatch(/8/);
  });
});
