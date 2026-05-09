# Room Link Picker — Design Spec

**Date:** 2026-05-09
**Status:** Approved for implementation
**Source:** `design/SqFt - App.html` (room linking mini-panel in the Quote screen)

## Context

A Quote's line items can compute their quantity from selected rooms in the underlying Estimate (`qtyMode: 'linked'`, `linkedRoomIds: Int[]`, `wastePct`). The data model and the linked-state row UI already exist. What's missing is the interactive picker — currently the scope button on a line item just toggles between manual and linked-with-every-room-auto-selected, with no way to choose a subset of rooms or set the waste percentage from the UI.

This change replaces that toggle with the mini-panel picker shown in `design/SqFt - App.html`: a fixed-position 340px popover anchored to the clicked scope button, containing per-room checkboxes, a waste % dropdown, a live total-sqft preview, and Clear / Apply actions.

## Architecture

A new client component `RoomLinkPicker` co-located with the Quote Builder. The current scope-button `onClick` in `LineItemSection.tsx` is rewired to open the picker instead of toggling state. Only one picker instance is mounted at a time; its state lives in `LineItemSection`.

No schema changes. No API changes. Existing `getEffectiveQty()` and `roomSqft()` helpers in `lib/utils.ts` are reused for the live preview.

## Components

### New: `components/quotes/RoomLinkPicker.tsx`

Client component. Props:

```ts
{
  rooms: RoomItem[];
  initialRoomIds: number[];
  initialWastePct: number;
  anchorRect: DOMRect;
  onApply: (roomIds: number[], wastePct: number) => void;
  onClear: () => void;
  onClose: () => void;
}
```

Internal draft state: `roomIds: Set<number>`, `wastePct: number`. Reset from props when `anchorRect` changes (i.e. opened on a different line).

Layout (matches `design/SqFt - App.html` mini-panel):
- `mp-head` — title "Link rooms" + close (✕) button
- `mp-body` — scrollable (`max-h-[280px]`) checkbox list of rooms; each row shows room name + sqft. Clicking the row toggles the checkbox.
- Waste row — `<select>` with options `[0, 5, 10, 15, 20]` (hardcoded to match design). Schema accepts any `Float`, so no migration needed if values change later.
- Preview line — live text: either `"No rooms selected"` or `"<N> room(s) · <base> sqft × <waste>% = <total> sqft"`, computed via `roomSqft()` from `lib/utils.ts`.
- `mp-foot` — `Clear` (ghost) + `Apply` (primary, disabled when zero rooms selected).

Empty case: when `rooms.length === 0`, body shows `"No rooms — add rooms in the estimate to enable room-linked items."` and Apply stays disabled.

Positioning:
- `position: fixed`
- `top: anchorRect.bottom + 6`
- `left: Math.min(anchorRect.left, window.innerWidth - 340 - 12)`

Dismiss behaviour (one `useEffect`, mirrors the dropdown pattern in `components/quotes/QuoteBuilder.tsx:28–40`):
- `mousedown` on `document` outside the panel root → `onClose()`
- `keydown` Escape → `onClose()`

Apply button calls `onApply(Array.from(roomIds), wastePct)` then `onClose()`. Clear calls `onClear()` then `onClose()`. Click-outside / Esc closes without committing draft.

Styling uses existing CSS variables (`--sage`, `--surface`, `--surface-2`, `--line`, `--muted`, `--font-mono`) for visual continuity.

### Modified: `components/estimates/LineItemSection.tsx`

- Add picker state: `const [picker, setPicker] = useState<{ lineId: number; rect: DOMRect } | null>(null);`
- Replace the scope button `onClick` (currently lines 151–175 — the inline toggle that sets `qtyMode` and auto-fills `linkedRoomIds: rooms.map(r => r.id)`) with:
  ```tsx
  onClick={(e) => setPicker({ lineId: li.id, rect: e.currentTarget.getBoundingClientRect() })}
  ```
- The button's display logic stays as-is: `🔗 N rooms` when linked, `Manual · ft²` when not.
- After the items map, render the picker once when `picker` is non-null:
  ```tsx
  {picker && (
    <RoomLinkPicker
      rooms={rooms}
      initialRoomIds={items.find(i => i.id === picker.lineId)?.linkedRoomIds ?? []}
      initialWastePct={items.find(i => i.id === picker.lineId)?.wastePct ?? 0}
      anchorRect={picker.rect}
      onApply={(linkedRoomIds, wastePct) => {
        updateItem(picker.lineId, { qtyMode: 'linked', linkedRoomIds, wastePct });
      }}
      onClear={() => {
        updateItem(picker.lineId, { qtyMode: 'manual', linkedRoomIds: [], wastePct: 0, qty: null });
      }}
      onClose={() => setPicker(null)}
    />
  )}
  ```

`updateItem` (LineItemSection.tsx:68–74) already calls `setItems(newItems)` + `save(newItems)` internally, so the picker's Apply/Clear callbacks each only need to call `updateItem` once. The existing optimistic + toast flow in `QuoteBuilder.tsx:161–168` continues to work unchanged.

### Unchanged
- `prisma/schema.prisma` — `LineItem` fields already cover everything needed.
- `app/api/quotes/[id]/route.ts` — no payload changes.
- `lib/utils.ts` — `getEffectiveQty`, `roomSqft`, `liSubtotal` reused as-is.
- The room-tag row beneath the line item (`LineItemSection.tsx:237–256`) renders as soon as `linkedRoomIds.length > 0`, so it lights up automatically once Apply is called.

## Data Flow

1. User clicks the scope button on a line item.
2. `LineItemSection` captures `event.currentTarget.getBoundingClientRect()` and sets `picker`.
3. `RoomLinkPicker` mounts with that anchor, rooms, and the line's current `linkedRoomIds` / `wastePct` copied into draft state.
4. User toggles checkboxes / changes waste %. Preview recalculates locally — no API call.
5. **Apply** → `updateItem(...)` + `save(items)` (existing debounced persistence). Picker closes.
6. **Clear** → resets line to `qtyMode: 'manual'`, empty `linkedRoomIds`, `wastePct: 0`, `qty: null`. Picker closes.
7. **Click-outside / Esc** → picker closes; draft state discarded; no save.

## Critical Files

- **New:** `components/quotes/RoomLinkPicker.tsx`
- **Modified:** `components/estimates/LineItemSection.tsx` (lines 151–175 + add picker render)
- **Reference (unchanged):** `lib/utils.ts` (`getEffectiveQty`, `roomSqft`), `prisma/schema.prisma` (`LineItem`)

## Verification

1. **Lint:** `biome ci .` passes with no errors.
2. **Type check:** `tsc --noEmit` (or whatever the project's typecheck script is) passes.
3. **Manual smoke** in `pnpm dev` (or project equivalent):
   - Open a quote whose estimate has ≥ 2 rooms.
   - Click scope button on a manual line item → picker opens anchored beneath the button.
   - Check 2 rooms, set waste to 10% → preview shows `2 rooms · <base> sqft × 10% = <total> sqft`.
   - Click Apply → picker closes, qty cell shows linked sqft in sage, room tags + waste tag appear under the row.
   - Click scope button again → picker reopens with the saved selection pre-checked.
   - Click outside the panel → closes without changes.
   - Press Esc with the picker open → closes without changes.
   - Click Clear → row reverts to manual mode with an empty number input.
   - Open a quote whose estimate has zero rooms → picker shows the empty-state message and Apply is disabled.
   - Resize / scroll: confirm panel positions correctly near the right edge of the viewport (clamp works).
4. **E2E:** extend the existing quote spec under `tests/e2e/` (introduced in commit `a74036f`) with a "room link picker" case covering: open picker, check 2 rooms, apply, assert qty cell + room tags. Run with the project's existing Playwright setup.
