# Multiple dimensions per room (non-rectangular rooms) + auto-focus new room

**Date:** 2026-06-30
**Status:** Approved (design)
**Domain:** Site Measure

## Summary

Two changes to the site-measure builder:

1. **Multiple dimensions per room.** A room can be broken into a list of L×W
   *boxes* whose areas sum to the room's total square footage. This lets a
   contractor measure a non-rectangular room (L-shape, alcove, bump-out) by
   "breaking it into boxes" the way they already do on paper. A plain
   rectangular room is simply one box.
2. **Auto-focus the room-name input** when a room is added, so the user can
   type the name immediately without tapping/clicking into the field.

### Decisions (confirmed)

- **Boxes only.** Each dimension is a rectangle (`{ w, l }`); the room's sqft is
  the sum of its boxes. No per-box triangle/subtract modes.
- **No per-box labels.** Each box shows its own sqft; the room shows the total.
  Keeps a mobile in-the-field UI uncluttered.
- **Perimeter of a multi-box room = sum of each box's perimeter.** We store no
  box *positions*, so a true outer perimeter is uncomputable. Summing
  over-counts shared interior edges, which *over*-orders trim — safe, since it
  never under-buys. Single-box rooms are unchanged (`2(w+l)`). Only affects
  `linked_perimeter` line items (shoe mold / quarter-round / transitions).

## Data model

Approach chosen: **a nullable `segments` JSON column on `SiteMeasureItem`.**
A room's boxes live in one place, travel with the row through the existing
delete-all-then-`createMany` save, and require **no data migration** (nullable
column — safe on the populated Neon PR DB). A legacy room that has only `w`/`l`
and no `segments` reads as a single implicit box. Links are unchanged:
`LineItem.linkedRoomIds` still points at the room row, not at boxes.

(Rejected: a child `RoomSegment` table — heavier persistence and extra includes
with no upside, since links target the room. Rejected: keeping `w`/`l` as
"box 0" plus a separate array — splits every reader into "first box vs the
rest".)

### Schema change — `prisma/schema.prisma`

```prisma
model SiteMeasureItem {
  // …existing fields…
  name  String?
  shape String? // rect | tri  (legacy single-box rooms only)
  w     Float?
  l     Float?
  note  String?

  // Box decomposition of a (possibly non-rectangular) room.
  // JSON array of { w, l } in feet; room sqft = Σ w*l. Null / empty means
  // a legacy single box described by the scalar w/l above.
  segments Json?

  text String?
}
```

New migration (added on top, never squashed):
`prisma/migrations/<ts>_add_room_segments/migration.sql`
→ `ALTER TABLE "SiteMeasureItem" ADD COLUMN "segments" JSONB;`
Nullable, no backfill, no NOT NULL — safe on the populated PR branch.

## Math — one read boundary in `lib/utils.ts`

The `RoomItem` type gains an optional `segments` field, and a normalizer
centralizes the "segments or legacy" decision:

```ts
export interface RoomSegment {
  w?: number | null;
  l?: number | null;
}

export interface RoomItem {
  // …existing…
  segments?: RoomSegment[] | null;
}

/** Boxes making up a room: its segments if present, else the legacy single
 *  box from w/l. Used for display and box-count; roomSqft/roomPerimeter remain
 *  the authoritative area/length. */
export function roomSegments(room: RoomItem): RoomSegment[] {
  if (room.segments && room.segments.length > 0) return room.segments;
  return [{ w: parsef(room.w), l: parsef(room.l) }]; // coerce legacy string|number
}
```

`roomSqft` and `roomPerimeter` branch segments-first, falling back to the exact
legacy behavior (including the legacy `tri` halving) when there are no segments:

```ts
export function roomSqft(room: RoomItem): number {
  if (room.type !== "room") return 0;
  if (room.segments && room.segments.length > 0) {
    return room.segments.reduce((sum, s) => {
      const w = parsef(s.w); const l = parsef(s.l);
      return w === null || l === null ? sum : sum + w * l;
    }, 0);
  }
  const w = parsef(room.w); const l = parsef(room.l);
  if (w === null || l === null) return 0;
  if ((room.shape || "rect") === "tri") return (w * l) / 2;
  return w * l;
}

// roomPerimeter mirrors this: segments → Σ 2(w+l); legacy → existing
// 2(w+l) / tri (w + l + hypot(w,l)) branch.
```

Because `resolveQty` (`lib/estimateView/compute.ts`) and the builder's
gross-area total already call `roomSqft` / `roomPerimeter`, **linked-area and
linked-perimeter line quantities and the gross-area total update
automatically** — no change in the estimate-math layer.

## Validation + persistence

- **`lib/siteMeasures/schema.ts`** — extend `itemSchema`:
  ```ts
  segments: z
    .array(z.object({ w: z.number().nullish(), l: z.number().nullish() }))
    .nullish(),
  ```
- **`lib/repositories/siteMeasureRepo.ts`** — no logic change. `saveSiteMeasure`
  already spreads item fields into `createMany`; `segments` (a Json column)
  rides along once it exists on the model, and `SiteMeasureItemInput` picks it
  up from the generated Prisma type.

## Builder UI — `components/siteMeasures/RoomSection.tsx`

- **Seed state normalized to segments.** When seeding local state from
  `siteMeasure.items`, map each room to have `segments` (legacy `w`/`l` →
  `[{ w, l }]`). The editor then always deals in a `segments` array. The DB is
  untouched until the user edits; the first edit persists `segments` and clears
  the scalar `w`/`l` (progressive migration).
- **Dimensions become a stack of box rows.** Replace the single L×W row with one
  row per box: `L × W`, that box's sqft, and a small `✕` to remove the box
  (hidden/disabled when only one box remains). Below the stack, a compact
  **"+ dimension"** control appends `{ w: null, l: null }`. The room's **total**
  sqft (Σ boxes) shows where the single sqft shows today.
- **Add Room** initializes `segments: [{ w: null, l: null }]`, `w: null`,
  `l: null`, keeps `name: "New Room"`.
- **Auto-focus.** Track the id of the just-added room; a callback ref on the
  name `<input>` calls `.focus()` (and selects the text so "New Room" is
  overwritten on first keystroke) when the rendered room matches that id, then
  clears the pending-focus id so re-renders don't steal focus.
- Edits still save the whole items array on change (unchanged save cadence).

## Customer-facing display — `components/estimates/public-estimate/RoomsList.tsx`

- Render sqft from `roomSqft` (authoritative). For the dimension text: a
  single-box room shows `w×l` as today; a multi-box room shows a compact
  `N areas` hint instead of one WxL. Chip stays one line.
- Add `segments` to the item map in
  `app/estimate-review/[token]/page.tsx` (coerce the Prisma `JsonValue` to
  `{ w, l }[]`), so live rooms carry boxes to the public page. (Rooms there are
  live, not snapshotted, so no snapshot work.)

## Backward compatibility

- Legacy rooms (scalar `w`/`l`, `segments = null`) render, compute, and display
  exactly as before via the fallback branch.
- No existing estimate/invoice snapshot stores raw room `w`/`l`; snapshots hold
  computed line totals, and linked-area qty is resolved to `effectiveQty` at
  compute time — so segments only need to feed `roomSqft`/`roomPerimeter`.

## Testing

- **`__tests__/lib/utils.test.ts`** — `roomSqft` sums segments; legacy
  `w`/`l` fallback unchanged; legacy `tri` unchanged; `roomPerimeter` sums
  segment perimeters; `roomSegments` returns segments when present and the
  legacy single box otherwise.
- **`__tests__/components/siteMeasures/RoomSection.test.tsx`** — adding a
  dimension appends a box and updates the room total; removing a box updates the
  total; the last box can't be removed; **the name input is focused after
  Add Room**.
- **Round-trip** — segments survive a site-measure PATCH (extend the existing
  repo/API save coverage).
- E2E (`tests/e2e/site-measure-builder.spec.ts`): optional multi-box case;
  run `--workers=1` locally.

## Docs to update in the same change

- **`CONTEXT.md`** → *Site Measure*: rooms are boxes-summed, not just
  "rect rooms with width/length"; note the `segments` field and that
  `roomSqft`/`roomPerimeter` (single source of truth) sum boxes, with a legacy
  `w`/`l` fallback.
- **`AGENTS.md`** — no change (no module moved or added).
- **`prisma/seed.ts`** — optional: give one seeded room multiple boxes to
  demonstrate; not required for correctness (nullable column, existing seed
  stays valid).

## Out of scope (YAGNI)

- Box positions / true outer-perimeter geometry.
- Per-box labels, triangles-per-box, cutout/subtract boxes.
- A visual room canvas (`RoomCanvas.tsx` is dead code).
