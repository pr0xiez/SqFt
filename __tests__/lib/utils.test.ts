import { describe, expect, it } from "vitest";
import {
  addDays,
  dateStr,
  deepCopy,
  estTotalArea,
  fmtBig,
  fmtDayHead,
  fmtDollar,
  getWeekStart,
  parsef,
  parseRoomSegments,
  type RoomItem,
  roomPerimeter,
  roomSegments,
  roomSqft,
  segmentSqft,
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
  const noteItem: RoomItem = { id: 4, type: "note", text: "See spec" };

  it("calculates rectangular area", () => expect(roomSqft(rectRoom)).toBe(120));
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

// ── segments ────────────────────────────────────────────────────────────────

describe("roomSqft with segments", () => {
  it("sums the area of every box", () => {
    expect(
      roomSqft({
        id: 1,
        type: "room",
        segments: [
          { w: 10, l: 12 },
          { w: 4, l: 3 },
        ],
      })
    ).toBe(132);
  });
  it("ignores a box missing a dimension", () => {
    expect(
      roomSqft({
        id: 1,
        type: "room",
        segments: [
          { w: 10, l: 12 },
          { w: 5, l: null },
        ],
      })
    ).toBe(120);
  });
  it("falls back to legacy w/l when segments is absent", () => {
    expect(roomSqft({ id: 1, type: "room", w: 10, l: 12 })).toBe(120);
  });
  it("treats a room with an unknown legacy shape as a full rectangle (triangles dropped)", () => {
    // A DB row could still say shape "tri"; readers narrow it to null and the
    // math treats every box as a rectangle.
    expect(roomSqft({ id: 1, type: "room", shape: null, w: 10, l: 12 })).toBe(
      120
    );
  });
});

describe("roomPerimeter with segments", () => {
  it("sums each box's perimeter", () => {
    // 2(10+12) + 2(4+3) = 44 + 14
    expect(
      roomPerimeter({
        id: 1,
        type: "room",
        segments: [
          { w: 10, l: 12 },
          { w: 4, l: 3 },
        ],
      })
    ).toBe(58);
  });
});

describe("roomSegments", () => {
  it("returns the room's segments when present", () => {
    const segs = [{ w: 1, l: 2 }];
    expect(roomSegments({ id: 1, type: "room", segments: segs })).toBe(segs);
  });
  it("returns a single legacy box when segments is absent", () => {
    expect(roomSegments({ id: 1, type: "room", w: 10, l: 12 })).toEqual([
      { w: 10, l: 12 },
    ]);
  });
  it("falls back to the legacy box when segments is not an array (malformed JSON)", () => {
    const room = {
      id: 1,
      type: "room",
      w: 10,
      l: 12,
      segments: "10x12" as unknown as RoomItem["segments"],
    } satisfies RoomItem;
    expect(roomSegments(room)).toEqual([{ w: 10, l: 12 }]);
    expect(roomSqft(room)).toBe(120);
  });
});

describe("segmentSqft", () => {
  it("multiplies w×l", () => {
    expect(segmentSqft({ w: 10, l: 12 })).toBe(120);
  });
  it("returns 0 when either dimension is missing", () => {
    expect(segmentSqft({ w: 10, l: null })).toBe(0);
    expect(segmentSqft({ w: null, l: 12 })).toBe(0);
    expect(segmentSqft({})).toBe(0);
  });
});

describe("parseRoomSegments", () => {
  it("passes a well-formed array through", () => {
    expect(
      parseRoomSegments([
        { w: 10, l: 12 },
        { w: 4, l: 3 },
      ])
    ).toEqual([
      { w: 10, l: 12 },
      { w: 4, l: 3 },
    ]);
  });
  it("returns undefined for non-arrays and empty arrays", () => {
    expect(parseRoomSegments(null)).toBeUndefined();
    expect(parseRoomSegments(undefined)).toBeUndefined();
    expect(parseRoomSegments("10x12")).toBeUndefined();
    expect(parseRoomSegments({ length: 1 })).toBeUndefined();
    expect(parseRoomSegments([])).toBeUndefined();
  });
  it("coerces malformed elements and non-numeric dims to null boxes", () => {
    expect(parseRoomSegments(["bad", { w: "10", l: 12 }, { w: 5 }])).toEqual([
      { w: null, l: null },
      { w: null, l: 12 },
      { w: 5, l: null },
    ]);
  });
  it("rejects non-finite numbers", () => {
    expect(parseRoomSegments([{ w: Infinity, l: Number.NaN }])).toEqual([
      { w: null, l: null },
    ]);
  });
});
