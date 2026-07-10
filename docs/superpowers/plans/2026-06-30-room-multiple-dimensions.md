# Multiple Dimensions Per Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a site-measure room be broken into multiple L×W boxes that sum to its total square footage (for non-rectangular rooms), and auto-focus the room-name input when a room is added.

**Architecture:** A nullable `segments` JSON column on `SiteMeasureItem` holds a room's boxes (`[{ w, l }]`); the single-source-of-truth math (`roomSqft` / `roomPerimeter` in `lib/utils.ts`) sums boxes with an exact legacy `w`/`l` fallback, so linked-area/perimeter line quantities and gross-area totals follow automatically. The builder renders a stack of box rows; the customer chip renders from the same boxes. Rooms on the public page are live (not snapshotted), so no snapshot work.

**Tech Stack:** Next.js (app router), Prisma/Postgres, Zod, react-query, Vitest + Testing Library (jsdom), Biome.

## Global Constraints

- **Boxes only** — each dimension is a rectangle `{ w, l }`; no per-box triangle/subtract/labels.
- **Perimeter of a multi-box room = Σ of each box's `2(w+l)`** (over-orders trim safely; positions aren't stored). Single-box rooms unchanged.
- **No data migration.** Add `segments` as a **nullable** column only — `ADD COLUMN` NOT NULL fails the populated Neon PR branch; nullable is safe.
- **Never squash migrations; add on top.** Do **not** run `prisma migrate dev` (it offers a destructive reset against the shared dev DB, and DDL to that DB is sandbox-blocked). Hand-write the migration SQL; Vercel/CI runs `prisma migrate deploy`.
- **`npm run lint:ci` (biome) must pass** before any commit. `npm run typecheck` must pass. Run the full `npm test` before handoff.
- **Keep docs current in the same change** — update `CONTEXT.md` (Site Measure section). CRLF is already handled by `.gitattributes` + biome `lineEnding: lf`; don't re-diagnose line-ending diffs.
- A fresh worktree may have incomplete `node_modules`. If `npx prisma generate` or a test run fails to resolve `@prisma/client`/deps, run `npm install` once first.

---

## File Structure

- `lib/utils.ts` — **Modify.** Add `RoomSegment`, `RoomItem.segments`, `roomSegments()`; make `roomSqft`/`roomPerimeter` segment-aware. Pure functions, the single source of truth. *(Task 1)*
- `prisma/schema.prisma` — **Modify.** Add `segments Json?` to `SiteMeasureItem`. *(Task 2)*
- `prisma/migrations/20260630000000_add_room_segments/migration.sql` — **Create.** `ADD COLUMN "segments" JSONB`. *(Task 2)*
- `lib/siteMeasures/schema.ts` — **Modify.** Add `segments` to `itemSchema`. *(Task 2)*
- `lib/repositories/siteMeasureRepo.ts` — **Modify.** Pass `segments` through `createMany`. *(Task 2)*
- `components/siteMeasures/RoomSection.tsx` — **Modify.** Box-row stack + "+ dimension" + room total + name auto-focus. *(Task 3)*
- `components/estimates/public-estimate/RoomsList.tsx` — **Modify.** Render dimension text from boxes. *(Task 4)*
- `app/estimate-review/[token]/page.tsx` — **Modify.** Map `segments` onto public items. *(Task 4)*
- `CONTEXT.md` — **Modify.** Update the Site Measure section. *(Task 5)*
- Tests: `__tests__/lib/utils.test.ts` (Task 1), `__tests__/lib/siteMeasures/schema.test.ts` (Task 2, create), `__tests__/components/siteMeasures/RoomSection.test.tsx` (Task 3), `__tests__/components/estimates/public-estimate/RoomsList.test.tsx` (Task 4, create).

---

## Task 1: Segment-aware room math (`lib/utils.ts`)

**Files:**
- Modify: `lib/utils.ts` (interface `RoomItem` ~34-43; `roomSqft` ~46-53; `roomPerimeter` ~58-65)
- Test: `__tests__/lib/utils.test.ts`

**Interfaces:**
- Produces:
  - `interface RoomSegment { w?: number | null; l?: number | null }`
  - `RoomItem.segments?: RoomSegment[] | null`
  - `roomSegments(room: RoomItem): RoomSegment[]` — the room's boxes, or a single legacy box from `w`/`l`.
  - `roomSqft(room: RoomItem): number` and `roomPerimeter(room: RoomItem): number` — unchanged signatures; now sum boxes when `segments` present.
- Consumes: `parsef` (already in file).

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/lib/utils.test.ts`. First extend the import block (the existing `import { … } from "@/lib/utils"` near the top) to include `roomSegments`, then append these blocks after the existing `roomPerimeter` describe:

```ts
// ── segments ────────────────────────────────────────────────────────────────
describe("roomSqft with segments", () => {
  it("sums the area of every box", () => {
    expect(
      roomSqft({ id: 1, type: "room", segments: [{ w: 10, l: 12 }, { w: 4, l: 3 }] })
    ).toBe(132);
  });
  it("ignores a box missing a dimension", () => {
    expect(
      roomSqft({ id: 1, type: "room", segments: [{ w: 10, l: 12 }, { w: 5, l: null }] })
    ).toBe(120);
  });
  it("falls back to legacy w/l when segments is absent", () => {
    expect(roomSqft({ id: 1, type: "room", w: 10, l: 12 })).toBe(120);
  });
  it("still halves a legacy tri room", () => {
    expect(roomSqft({ id: 1, type: "room", shape: "tri", w: 10, l: 12 })).toBe(60);
  });
});

describe("roomPerimeter with segments", () => {
  it("sums each box's perimeter", () => {
    // 2(10+12) + 2(4+3) = 44 + 14
    expect(
      roomPerimeter({ id: 1, type: "room", segments: [{ w: 10, l: 12 }, { w: 4, l: 3 }] })
    ).toBe(58);
  });
});

describe("roomSegments", () => {
  it("returns the room's segments when present", () => {
    const segs = [{ w: 1, l: 2 }];
    expect(roomSegments({ id: 1, type: "room", segments: segs })).toBe(segs);
  });
  it("returns a single legacy box when segments is absent", () => {
    expect(roomSegments({ id: 1, type: "room", w: 10, l: 12 })).toEqual([{ w: 10, l: 12 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/utils.test.ts`
Expected: FAIL — `roomSegments` is not exported; segment cases return 0 / wrong totals.

- [ ] **Step 3: Implement the segment-aware math**

In `lib/utils.ts`, replace the `RoomItem` interface, `roomSqft`, and `roomPerimeter` (the block currently spanning ~34-65) with:

```ts
export interface RoomSegment {
  w?: number | null;
  l?: number | null;
}

export interface RoomItem {
  id: number;
  type: "room" | "note";
  shape?: "rect" | "tri" | null;
  w?: string | number | null;
  l?: string | number | null;
  /** Box decomposition of a (possibly non-rectangular) room; sqft = Σ w*l.
   *  Absent/empty means a single legacy box described by the scalar w/l. */
  segments?: RoomSegment[] | null;
  name?: string | null;
  note?: string | null;
  text?: string | null;
}

/** The boxes making up a room: its segments if present, else the single legacy
 *  box from w/l. Use for display and box-count; roomSqft/roomPerimeter remain
 *  the authoritative area/length. */
export function roomSegments(room: RoomItem): RoomSegment[] {
  if (room.segments && room.segments.length > 0) return room.segments;
  return [{ w: parsef(room.w), l: parsef(room.l) }];
}

/** Calculate net square footage for a single room item */
export function roomSqft(room: RoomItem): number {
  if (room.type !== "room") return 0;
  if (room.segments && room.segments.length > 0) {
    return room.segments.reduce((sum, s) => {
      const w = parsef(s.w);
      const l = parsef(s.l);
      return w === null || l === null ? sum : sum + w * l;
    }, 0);
  }
  const w = parsef(room.w);
  const l = parsef(room.l);
  if (w === null || l === null) return 0;
  if ((room.shape || "rect") === "tri") return (w * l) / 2;
  return w * l;
}

/** Calculate the perimeter (linear feet) of a room. Multi-box rooms sum each
 *  box's 2(w+l) (over-counts shared edges — positions aren't stored — which
 *  errs toward ordering enough trim). Legacy single-box: 2(w+l), or for tri
 *  rooms w + l + hypotenuse(w,l). Drives linear measures like shoe mold,
 *  quarter-round, transition strips. */
export function roomPerimeter(room: RoomItem): number {
  if (room.type !== "room") return 0;
  if (room.segments && room.segments.length > 0) {
    return room.segments.reduce((sum, s) => {
      const w = parsef(s.w);
      const l = parsef(s.l);
      return w === null || l === null ? sum : sum + 2 * (w + l);
    }, 0);
  }
  const w = parsef(room.w);
  const l = parsef(room.l);
  if (w === null || l === null) return 0;
  if ((room.shape || "rect") === "tri") return w + l + Math.hypot(w, l);
  return 2 * (w + l);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/utils.test.ts`
Expected: PASS (new blocks + all pre-existing `roomSqft`/`roomPerimeter`/`estTotalArea` cases).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts __tests__/lib/utils.test.ts
git commit -m "feat(site-measure): segment-aware roomSqft/roomPerimeter"
```

---

## Task 2: Persist segments (schema + migration + validation + repo)

**Files:**
- Modify: `prisma/schema.prisma` (`SiteMeasureItem`, ~143-159)
- Create: `prisma/migrations/20260630000000_add_room_segments/migration.sql`
- Modify: `lib/siteMeasures/schema.ts` (`itemSchema`, 3-13)
- Modify: `lib/repositories/siteMeasureRepo.ts` (import line 1; `createMany` in `saveSiteMeasure`, ~235-242)
- Test: `__tests__/lib/siteMeasures/schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (the DB column is independent).
- Produces: a `segments` field accepted end-to-end — Zod-validated (`{ w, l }[]`), stored on `SiteMeasureItem`, and returned by `getSiteMeasure`. Task 3/4 rely on it being persisted and echoed back.

- [ ] **Step 1: Write the failing validation test**

Create `__tests__/lib/siteMeasures/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estimateUpdateSchema } from "@/lib/siteMeasures/schema";

describe("estimateUpdateSchema — room segments", () => {
  it("accepts an item with a segments array", () => {
    const parsed = estimateUpdateSchema.parse({
      items: [
        {
          id: 1,
          type: "room",
          name: "L-shaped",
          segments: [{ w: 10, l: 12 }, { w: 4, l: 3 }],
        },
      ],
    });
    expect(parsed.items?.[0]?.segments).toEqual([{ w: 10, l: 12 }, { w: 4, l: 3 }]);
  });

  it("accepts a box with a null dimension (partial entry)", () => {
    const parsed = estimateUpdateSchema.parse({
      items: [{ id: 1, type: "room", segments: [{ w: 5, l: null }] }],
    });
    expect(parsed.items?.[0]?.segments?.[0]).toEqual({ w: 5, l: null });
  });

  it("still accepts a legacy item with no segments", () => {
    const parsed = estimateUpdateSchema.parse({
      items: [{ id: 1, type: "room", w: 10, l: 12 }],
    });
    expect(parsed.items?.[0]?.segments).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/siteMeasures/schema.test.ts`
Expected: FAIL — `segments` is stripped/rejected because it isn't in `itemSchema`.

- [ ] **Step 3: Add `segments` to the Zod item schema**

In `lib/siteMeasures/schema.ts`, add a `segments` field to `itemSchema` (after the `l` field):

```ts
const itemSchema = z.object({
  id: z.number().int(),
  type: z.enum(["room", "note"]),
  sortOrder: z.number().int().default(0),
  name: z.string().nullish(),
  shape: z.enum(["rect", "tri"]).nullish(),
  w: z.number().nullish(),
  l: z.number().nullish(),
  segments: z
    .array(z.object({ w: z.number().nullish(), l: z.number().nullish() }))
    .nullish(),
  note: z.string().nullish(),
  text: z.string().nullish(),
});
```

- [ ] **Step 4: Run the validation test to verify it passes**

Run: `npx vitest run __tests__/lib/siteMeasures/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Prisma column**

In `prisma/schema.prisma`, add `segments` to `SiteMeasureItem` (in the Room fields block, after `note`):

```prisma
  // Room fields
  name  String?
  shape String? // rect | tri  (legacy single-box rooms)
  w     Float?
  l     Float?
  note  String?

  // Box decomposition of a non-rectangular room: JSON array of { w, l } in
  // feet; room sqft = Σ w*l. Null/empty means a single legacy box (w/l above).
  segments Json?
```

- [ ] **Step 6: Hand-write the migration**

Create `prisma/migrations/20260630000000_add_room_segments/migration.sql`:

```sql
-- Add a nullable JSON column holding a room's box decomposition
-- ([{ w, l }, ...]); NULL means a legacy single box described by w/l.
-- Nullable + no backfill so it is safe on the populated Neon PR branch.
ALTER TABLE "SiteMeasureItem" ADD COLUMN "segments" JSONB;
```

Do **not** run `prisma migrate dev`. Regenerate the client types only:

Run: `npx prisma generate`
Expected: "Generated Prisma Client" (no DB connection). If it fails to resolve deps, run `npm install` once, then retry.

- [ ] **Step 7: Pass `segments` through the repo save**

In `lib/repositories/siteMeasureRepo.ts` — keep the existing `import type { Prisma }` (the cast below is a type-only use, so a value import would fail biome's `useImportType`).

1. Override `segments` on the `SiteMeasureItemInput` type (currently ~42-47) so the wire/zod segment shape — not Prisma's `InputJsonValue` — flows in from the route. This keeps the `saveSiteMeasure(id, orgId, input)` call assignable (Prisma's `InputJsonValue` rejects the `undefined`-valued nested props that optional `w?`/`l?` produce):

```ts
type SiteMeasureItemInput = Omit<
  Prisma.SiteMeasureItemUncheckedCreateInput,
  "id" | "siteMeasureId" | "segments"
> & {
  id?: number;
  segments?: { w?: number | null; l?: number | null }[] | null;
};
```

2. In `saveSiteMeasure`, update the `createMany` mapping (currently ~235-242) so `segments` is only written when present, cast to Prisma's Json input type at this single seam:

```ts
if (items.length > 0) {
  await tx.siteMeasureItem.createMany({
    data: items.map(({ id: _id, segments, ...item }) => ({
      ...item,
      siteMeasureId: id,
      ...(segments != null
        ? { segments: segments as Prisma.InputJsonValue }
        : {}),
    })),
  });
}
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If it reports a JSON assignability error on the `createMany` data, confirm the `as Prisma.InputJsonValue` cast from Step 7 is present; if the route call `saveSiteMeasure(id, orgId, input)` errors on `items`, confirm the `SiteMeasureItemInput` `segments` override from Step 7.1 is present.)

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260630000000_add_room_segments/migration.sql lib/siteMeasures/schema.ts lib/repositories/siteMeasureRepo.ts __tests__/lib/siteMeasures/schema.test.ts
git commit -m "feat(site-measure): persist room segments (schema + validation)"
```

> Note: the new column is not applied to the shared dev DB locally (DDL is sandbox-blocked; `migrate deploy` runs in CI/Vercel). The tests in this plan are pure/jsdom/Zod and need no DB.

---

## Task 3: Builder dimension stack + name auto-focus (`RoomSection.tsx`)

**Files:**
- Modify: `components/siteMeasures/RoomSection.tsx`
- Test: `__tests__/components/siteMeasures/RoomSection.test.tsx`

**Interfaces:**
- Consumes: `roomSegments`, `roomSqft`, `RoomSegment`, `RoomItem` from `lib/utils` (Task 1).
- Produces: builder UI. Persists rooms as `{ segments: RoomSegment[], w: null, l: null, … }` via the existing `onSave(items)`.

**Behavior to implement:**
- Seed local state with rooms normalized to segments (legacy `w`/`l` → `[{ w, l }]`, scalars nulled).
- One row per box: `L × W`, that box's sqft, and a `✕` remove button shown only when the room has more than one box.
- A compact **"+ dimension"** control appends `{ w: null, l: null }`.
- A **"Room total"** line shown only when a room has more than one box (single-box rooms look exactly as before).
- On **+ Add Room**: new room starts with one empty box and its name input receives focus (text selected).

- [ ] **Step 1: Write the failing tests**

Add these tests to `__tests__/components/siteMeasures/RoomSection.test.tsx` (inside the existing `describe("RoomSection", …)`). They use `document.activeElement` (this suite doesn't load jest-dom matchers):

```ts
it("focuses the name input when a room is added", () => {
  renderSection([]);
  fireEvent.click(screen.getByText("+ Add Room"));
  const nameInput = screen.getByPlaceholderText("Room name") as HTMLInputElement;
  expect(document.activeElement).toBe(nameInput);
});

it("adds a dimension box and sums it into the room total", () => {
  renderSection([room({ id: 1, name: "Great Room", w: 10, l: 12 })]); // 120
  // Add a second box.
  fireEvent.click(screen.getByText("+ dimension"));
  // Now two L inputs and two W inputs; fill the second box 4 × 3 = 12.
  const ls = screen.getAllByPlaceholderText("L");
  const ws = screen.getAllByPlaceholderText("W");
  fireEvent.change(ls[1], { target: { value: "4" } });
  fireEvent.change(ws[1], { target: { value: "3" } });
  // 120 + 12 = 132 gross.
  expect(grossArea()).toContain("132 sqft");
});

it("removes a dimension box and recomputes the total", () => {
  renderSection([
    room({ id: 1, name: "Great Room", segments: [{ w: 10, l: 12 }, { w: 4, l: 3 }], w: null, l: null }),
  ]);
  expect(grossArea()).toContain("132 sqft");
  // Two boxes → each has a remove control; remove the second.
  const removes = screen.getAllByLabelText("Remove dimension");
  expect(removes).toHaveLength(2);
  fireEvent.click(removes[1]);
  expect(grossArea()).toContain("120 sqft");
});

it("does not show a per-box remove control when a room has one box", () => {
  renderSection([room({ id: 1, w: 10, l: 12 })]);
  expect(screen.queryByLabelText("Remove dimension")).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/components/siteMeasures/RoomSection.test.tsx`
Expected: FAIL — no "+ dimension" control, no per-box remove, name not focused.

- [ ] **Step 3: Rewrite `RoomSection.tsx`**

Replace the file with the version below. Changes vs. the current file: import `roomSegments` + `RoomSegment`; seed state normalized to segments; a `focusId` state + callback ref for auto-focus; per-box `updateSegment`/`addSegment`/`removeSegment`; the Dimensions block becomes a box stack with a conditional Room total; `addRoom` seeds one empty box and sets `focusId`.

```tsx
"use client";

import { useCallback, useState } from "react";
import type { SiteMeasure } from "@/lib/hooks/useSiteMeasures";
import type { RoomItem, RoomSegment } from "@/lib/utils";
import { roomSegments, roomSqft } from "@/lib/utils";

interface Props {
  siteMeasure: SiteMeasure;
  onSave: (items: RoomItem[]) => Promise<void>;
}

let _nextId = Date.now();
function tempId() {
  return ++_nextId;
}

/** Normalize a persisted room to the segments representation the editor uses:
 *  legacy w/l become a single box, and the scalar w/l are cleared. */
function toSegmentRoom(item: RoomItem): RoomItem {
  if (item.type !== "room") return item;
  return { ...item, segments: roomSegments(item), w: null, l: null };
}

function segmentSqft(seg: RoomSegment): number {
  const w = typeof seg.w === "number" ? seg.w : Number(seg.w);
  const l = typeof seg.l === "number" ? seg.l : Number(seg.l);
  if (!Number.isFinite(w) || !Number.isFinite(l)) return 0;
  return w * l;
}

export function RoomSection({ siteMeasure, onSave }: Props) {
  const [items, setItems] = useState<RoomItem[]>(() =>
    (siteMeasure.items ?? []).map(toSegmentRoom)
  );
  // Id of a just-added room whose name input should grab focus once.
  const [focusId, setFocusId] = useState<number | null>(null);

  const save = useCallback(
    async (newItems: RoomItem[]) => {
      await onSave(newItems);
    },
    [onSave]
  );

  function commit(newItems: RoomItem[]) {
    setItems(newItems);
    save(newItems);
  }

  function addRoom() {
    const id = tempId();
    commit([
      ...items,
      {
        id,
        type: "room",
        name: "New Room",
        shape: "rect",
        w: null,
        l: null,
        segments: [{ w: null, l: null }],
        note: "",
      },
    ]);
    setFocusId(id);
  }

  function removeItem(id: number) {
    commit(items.filter((i) => i.id !== id));
  }

  function updateRoom(id: number, patch: Partial<RoomItem>) {
    commit(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateSegment(room: RoomItem, idx: number, patch: Partial<RoomSegment>) {
    const segments = roomSegments(room).map((s, i) =>
      i === idx ? { ...s, ...patch } : s
    );
    updateRoom(room.id, { segments, w: null, l: null });
  }

  function addSegment(room: RoomItem) {
    updateRoom(room.id, {
      segments: [...roomSegments(room), { w: null, l: null }],
      w: null,
      l: null,
    });
  }

  function removeSegment(room: RoomItem, idx: number) {
    const segments = roomSegments(room).filter((_, i) => i !== idx);
    updateRoom(room.id, { segments, w: null, l: null });
  }

  const rooms = items.filter((i) => i.type === "room");
  const grossArea = rooms.reduce((s, r) => s + roomSqft(r), 0);

  return (
    <div className="space-y-2.5 mb-3.5">
      {items.length === 0 && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-8 text-center font-[var(--font-mono)] text-[12px] text-[var(--muted)]">
          No rooms yet — add one to begin measuring.
        </div>
      )}

      {items.map((item) =>
        item.type === "room" ? (
          <div
            key={item.id}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-[18px_20px] transition-colors duration-150"
          >
            {/* Room header */}
            <div className="flex items-center gap-2.5 mb-3.5">
              <input
                type="text"
                value={item.name ?? ""}
                ref={(el) => {
                  if (el && focusId === item.id) {
                    el.focus();
                    el.select();
                    setFocusId(null);
                  }
                }}
                onChange={(e) => updateRoom(item.id, { name: e.target.value })}
                placeholder="Room name"
                className="flex-1 text-[15px] font-[600] tracking-[-0.01em] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="font-[var(--font-mono)] text-[10px] px-2.5 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[4px] cursor-pointer transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Remove
              </button>
            </div>

            {/* Dimensions — one row per box; areas sum to the room total */}
            <div className="space-y-2 mb-3">
              {roomSegments(item).map((seg, idx) => {
                const boxes = roomSegments(item);
                const sqft = segmentSqft(seg);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5"
                  >
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[80px] tracking-[.04em]">
                      {idx === 0 ? "Dimensions" : ""}
                    </span>
                    <input
                      type="number"
                      value={seg.l ?? ""}
                      onChange={(e) =>
                        updateSegment(item, idx, {
                          l: parseFloat(e.target.value) || undefined,
                        })
                      }
                      placeholder="L"
                      className="w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[14px] text-[var(--muted)]">×</span>
                    <input
                      type="number"
                      value={seg.w ?? ""}
                      onChange={(e) =>
                        updateSegment(item, idx, {
                          w: parseFloat(e.target.value) || undefined,
                        })
                      }
                      placeholder="W"
                      className="w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                      ft
                    </span>
                    <div className="ml-auto text-[15px] font-[700] tracking-[-0.02em]">
                      {sqft > 0 ? (
                        `${Math.round(sqft)} sqft`
                      ) : (
                        <span className="text-[var(--muted)] font-[400]">—</span>
                      )}
                    </div>
                    {boxes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSegment(item, idx)}
                        aria-label="Remove dimension"
                        className="text-[var(--muted)] hover:text-[var(--accent)] text-sm leading-none shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-3 pl-[90px]">
                <button
                  type="button"
                  onClick={() => addSegment(item)}
                  className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] bg-transparent border-none p-0 cursor-pointer hover:text-[var(--ink)]"
                >
                  + dimension
                </button>
                {roomSegments(item).length > 1 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em]">
                      Room total
                    </span>
                    <span className="text-[18px] font-[700] tracking-[-0.02em]">
                      {roomSqft(item) > 0 ? `${Math.round(roomSqft(item))} sqft` : "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Note */}
            <input
              type="text"
              value={item.note ?? ""}
              onChange={(e) => updateRoom(item.id, { note: e.target.value })}
              placeholder="Add note about this room…"
              className="w-full text-[13px] text-[var(--ink-2)] bg-[var(--surface)] border border-[var(--line)] rounded-[5px] px-2.5 py-2 italic focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150 placeholder:text-[var(--muted)]"
            />
          </div>
        ) : (
          <div
            key={item.id}
            className="flex items-start gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--gold)] rounded-lg"
          >
            <textarea
              rows={2}
              value={item.text ?? ""}
              onChange={(e) => updateRoom(item.id, { text: e.target.value })}
              placeholder="Field note…"
              className="flex-1 font-[var(--font-mono)] text-[11px] text-[var(--ink)] bg-transparent focus:outline-none resize-none italic"
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-[var(--muted)] hover:text-[var(--accent)] text-sm leading-none mt-0.5 shrink-0"
              aria-label="Remove note"
            >
              ✕
            </button>
          </div>
        )
      )}

      {/* Add buttons */}
      <div className="flex gap-2 mt-3.5">
        <button
          type="button"
          onClick={addRoom}
          className="flex-1 py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          + Add Room
        </button>
        <button
          type="button"
          onClick={() =>
            commit([...items, { id: tempId(), type: "note", text: "" }])
          }
          className="flex-1 py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          + Add Note
        </button>
      </div>

      {/* Summary bar */}
      {rooms.length > 0 && (
        <div className="bg-[var(--ink)] text-[var(--bg)] p-[20px_24px] rounded-lg flex flex-wrap items-center justify-between gap-3.5 mt-3.5 [html[data-theme=dark]_&]:bg-[var(--surface-2)] [html[data-theme=dark]_&]:border [html[data-theme=dark]_&]:border-[var(--line)]">
          <div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1">
              Gross area
            </div>
            <div className="text-[28px] font-[700] tracking-[-0.025em]">
              {grossArea > 0 ? `${Math.round(grossArea)} sqft` : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests**

Run: `npx vitest run __tests__/components/siteMeasures/RoomSection.test.tsx`
Expected: PASS — the four new tests **and** every pre-existing RoomSection test (empty state, existing-room sqft, multi-room gross area, add/remove room, edit L/W, edit name, edit note).

- [ ] **Step 5: Commit**

```bash
git add components/siteMeasures/RoomSection.tsx __tests__/components/siteMeasures/RoomSection.test.tsx
git commit -m "feat(site-measure): per-room dimension boxes + name auto-focus"
```

---

## Task 4: Customer-facing display (`RoomsList.tsx` + public map)

**Files:**
- Modify: `components/estimates/public-estimate/RoomsList.tsx`
- Modify: `app/estimate-review/[token]/page.tsx` (item map, ~54-63)
- Test: `__tests__/components/estimates/public-estimate/RoomsList.test.tsx` (create)

**Interfaces:**
- Consumes: `roomSegments`, `roomSqft`, `RoomItem` (Task 1); persisted `segments` (Task 2).
- Produces: customer chip text — single box `w×l · N sqft`; multi-box `M areas · N sqft`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/estimates/public-estimate/RoomsList.test.tsx`:

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomsList } from "@/components/estimates/public-estimate/RoomsList";
import type { RoomItem } from "@/lib/utils";

const rooms = (items: RoomItem[]) => items;

describe("RoomsList", () => {
  it("shows w×l and sqft for a single-box room", () => {
    render(<RoomsList rooms={rooms([{ id: 1, type: "room", name: "Den", shape: "rect", w: 10, l: 12 }])} />);
    expect(screen.getByText("Den")).not.toBeNull();
    expect(screen.getByText(/12×10 · 120 sqft/)).not.toBeNull();
  });

  it("shows the box count and summed sqft for a multi-box room", () => {
    render(
      <RoomsList
        rooms={rooms([
          { id: 1, type: "room", name: "L Room", segments: [{ w: 10, l: 12 }, { w: 4, l: 3 }] },
        ])}
      />
    );
    // 120 + 12 = 132; two boxes.
    expect(screen.getByText(/2 areas · 132 sqft/)).not.toBeNull();
  });
});
```

> Note: the chip renders `l×w` (length first) to match the builder's `L × W` ordering; area is order-independent, so `12×10` for `{ w: 10, l: 12 }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/estimates/public-estimate/RoomsList.test.tsx`
Expected: FAIL — current code renders `10×12` from `r.w×r.l` and has no multi-box branch.

- [ ] **Step 3: Update `RoomsList.tsx`**

Replace the body of `RoomsList` so the dimension text derives from boxes:

```tsx
import { type RoomItem, roomSegments, roomSqft } from "@/lib/utils";

interface Props {
  rooms: RoomItem[];
}

export function RoomsList({ rooms }: Props) {
  if (rooms.length === 0) return null;
  return (
    <>
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-3.5">
        Rooms included
      </div>
      <div className="flex flex-wrap gap-1.5 mb-9">
        {rooms.map((r) => {
          const sqft = Math.round(roomSqft(r));
          const boxes = roomSegments(r);
          const first = boxes[0];
          const dim =
            boxes.length > 1
              ? `${boxes.length} areas`
              : first?.w && first?.l
                ? `${first.l}×${first.w}`
                : "";
          return (
            <span
              key={r.id}
              className="font-[var(--font-mono)] text-[11px] px-3 py-1.5 border border-[var(--line-2)] rounded-full text-[var(--ink-2)] bg-[var(--surface)] inline-flex items-center gap-1.5"
            >
              <strong className="text-[var(--ink)] font-[600]">
                {r.name || "Room"}
              </strong>
              <span className="text-[var(--muted)]">
                {dim ? `${dim} · ` : ""}
                {sqft} sqft
              </span>
            </span>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Map `segments` onto public items**

In `app/estimate-review/[token]/page.tsx`, add `segments` to the item map (the `estimate.siteMeasure.items.map(...)` block, ~54-63):

```ts
    items: estimate.siteMeasure.items.map((i) => ({
      id: i.id,
      type: i.type === "room" ? "room" : "note",
      shape: i.shape === "rect" || i.shape === "tri" ? i.shape : null,
      w: i.w,
      l: i.l,
      segments: (i.segments as { w?: number | null; l?: number | null }[] | null) ?? undefined,
      name: i.name,
      note: i.note,
      text: i.text,
    })),
```

- [ ] **Step 5: Run the RoomsList test + typecheck**

Run: `npx vitest run __tests__/components/estimates/public-estimate/RoomsList.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/estimates/public-estimate/RoomsList.tsx "app/estimate-review/[token]/page.tsx" __tests__/components/estimates/public-estimate/RoomsList.test.tsx
git commit -m "feat(site-measure): show room boxes on the public estimate"
```

---

## Task 5: Docs + full verification

**Files:**
- Modify: `CONTEXT.md` (Site Measure section, ~66-72)

- [ ] **Step 1: Update `CONTEXT.md`**

Replace the Site Measure section's first sentence so it reflects box-decomposed rooms. Change:

```
The measurement record for a location: a set of room measurements
(`SiteMeasureItem` rows — rect rooms with width/length, or text notes) plus a
`siteMeasureNumber`. It carries no pricing.
```

to:

```
The measurement record for a location: a set of room measurements
(`SiteMeasureItem` rows) plus a `siteMeasureNumber`; it carries no pricing. A
room is a set of L×W **boxes** (`segments` JSON — a non-rectangular room is
entered as several boxes that sum), or a legacy single box from the scalar
`w`/`l`. Square footage and perimeter are the single source of truth in
`roomSqft` / `roomPerimeter` (`lib/utils.ts`), which sum the boxes (perimeter
sums each box, over-ordering trim rather than modeling shared walls); linked
line quantities read those. Items can also be text notes.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS. (DB-backed suites gated on `VITEST_DB_AVAILABLE` may skip/fail to load locally without a DB — that is the known worktree limitation, not a regression from this change. The suites this plan adds/edits are pure/jsdom/Zod and must pass.)

- [ ] **Step 3: Lint + typecheck (must pass before handoff)**

Run: `npm run lint:ci`
Expected: PASS (no Biome errors). If it reports fixable issues, run `npm run lint:fix` and re-run.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(context): rooms are box-decomposed in site measures"
```

---

## Self-Review

**Spec coverage**
- Boxes-only multiple dimensions → Task 1 (math) + Task 2 (persistence) + Task 3 (UI). ✓
- `segments` JSON column, nullable, no backfill → Task 2. ✓
- `roomSqft`/`roomPerimeter` sum boxes w/ legacy fallback; perimeter = Σ box perimeter → Task 1. ✓
- Linked-area/perimeter + gross area update automatically → verified by relying on `roomSqft`/`roomPerimeter` (no change needed in `compute.ts`); covered indirectly by Task 1 unit tests. ✓
- Zod validation + repo passthrough → Task 2. ✓
- Builder dimension stack (add/remove box, room total, single-box unchanged) → Task 3. ✓
- Name auto-focus on Add Room → Task 3. ✓
- Customer chip from boxes + public item map → Task 4. ✓
- Backward compat (legacy w/l rooms) → Task 1 fallback tests + Task 3 seed normalization + Task 4 single-box test. ✓
- Docs (`CONTEXT.md`) → Task 5. ✓
- No per-box labels / no snapshot work / `RoomCanvas` untouched → out of scope, honored. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The migration dir timestamp `20260630000000` is a concrete value.

**Type consistency:** `RoomSegment { w?: number | null; l?: number | null }`, `roomSegments(room): RoomSegment[]`, `RoomItem.segments?: RoomSegment[] | null` are defined in Task 1 and consumed with the same names/shapes in Tasks 3–4. Zod segment shape (`{ w, l }` nullish) matches. `SiteMeasureItemInput` overrides `segments` to the same `{ w, l }[]` shape (keeping `import type { Prisma }`), with a `Prisma.InputJsonValue` cast at the `createMany` seam. The public map coerces Prisma `JsonValue` to the same `{ w, l }[]` shape.

**Note on the L×W ⇄ w/l mapping:** the builder binds the **L** input to `segment.l` and **W** to `segment.w` (matching the current file's ordering); `RoomsList` prints `l×w` for parity. Area/perimeter are order-independent, so this is cosmetic only.
