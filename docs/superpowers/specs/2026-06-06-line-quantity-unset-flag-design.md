# Per-line "Quantity unset" flag for unresolved estimate lines

- **Date:** 2026-06-06
- **Branch / PR:** `claude/brave-sutherland-19dc4a` — [PR #100](https://github.com/pr0xiez/SqFt/pull/100)
- **Status:** Approved design, ready for implementation plan

## Problem

An estimate line whose quantity can't be resolved produces a `null` subtotal
(`lib/estimateView/compute.ts:19`, `resolveQty:43`). Today `LineItemRow` renders
that line with quantity `—` and subtotal **`$0.00`** — visually identical to a
deliberate "free" ($0) line. The line is silently dropped from the estimate
total and (post-PR-#100) omitted from invoices, so the builder can send or get an
estimate approved with a line that will never be billed and no clear signal which
line is the problem.

The current mitigation — a section-level banner in `InvoicesSection`
("N line items have no price yet…") — was deemed the wrong approach: it names a
count, not the offending line, and it sits far from the line in the invoicing
block rather than at the point of action during estimate creation.

Once an estimate is approved or declined it is locked; approval also writes a
frozen snapshot (`approve/route.ts`). So the signal must land **on the line,
during creation/editing, before send/approval.**

## Goals

- Flag each unresolved line **in place** so the builder sees exactly which line
  needs action, while editing.
- Keep deliberate `$0` "free" lines visually unflagged.
- Stop a freshly-added line from flashing the flag before it's been touched.
- Remove the superseded section-level warning.

## Non-goals

- No change to estimate math, the snapshot, the approve/decline flow, or invoice
  proration (`lib/invoices/compute.ts` stays — that's billing correctness).
- No flag on the customer-facing public estimate view (snapshot-backed).
- No guard preventing room deletion from un-resolving a linked line.

## Trigger rule

A line is **unresolved** when its computed `subtotal` is `null`
(equivalently `effectiveQty === null`). Two real causes:

1. **Manual line** with an empty quantity (`qty == null`).
2. **Room-linked line** whose `linkedRoomIds` no longer match any existing room
   (`resolveQty` returns `null` when `linked.length === 0`) — i.e. the linked
   room was deleted.

A line at quantity `0` has `subtotal === 0`, **not** `null` — it is a deliberate
free line and is **not** flagged. This is the existing system's semantics
(prorate omits `null`, never `0`) and is what makes the new-line default (below)
silence the false alarm.

## UI treatment — `components/estimates/LineItemRow.tsx`

Chosen look (brainstorm Option A), driven entirely off the `subtotal` /
`effectiveQty` props the row already receives — **no new plumbing**.

Derive once: `const unresolved = subtotal === null;`

- **Left rail + tint:** when `unresolved`, gold rail
  `border-l-[3px] border-l-[var(--gold)]` plus a faint `rgba(176,122,26,0.06)`
  background tint. This **overrides** the existing sage linked-rail
  (`border-l-[var(--sage)]`, current line ~60): the missing-quantity signal wins
  over the linked signal when both apply (the room-deleted case is both linked
  and unresolved).
- **Subtotal cell:** the misleading `$0.00` rendered in the non-editable `else`
  branch (current lines ~197–206) becomes an amber chip **`⚠ Quantity unset`**
  when `unresolved`. The editable-subtotal branch (qty > 0) is unchanged; the
  deliberate-`$0` case (effectiveQty `0`) still shows plain `$0.00`.
  - Chip style: mono, `text-[10px]`, `font-[600]`, `text-[var(--gold)]`,
    `bg-[rgba(176,122,26,0.12)]`, `border border-[var(--gold)]`,
    `rounded-[4px]`, `px-2 py-0.5`, `whitespace-nowrap`. The leading `⚠` plus the
    word "unset" mean the signal is **not color-only** (accessible).
- **Quantity cell:** the linked `—` (current line ~135) tinted gold when
  `unresolved` (minor polish; manual unresolved lines keep their empty input).

**Single label for all causes:** "Quantity unset" is declarative, so it reads
correctly for both the manual and room-deleted cases and on locked estimates —
no cause-specific wording branch.

**Locked / read-only:** the treatment renders identically when `readOnly` is
true (it is purely presentational). Per decision, the flag is shown on locked
(approved/declined) estimates as well as editable ones.

## New-line default — `lib/estimateDraft/reduce.ts`

In the `addLineItem` case, change the seeded line from `qty: null` to `qty: 0`
(current line ~24). A new line then resolves to `effectiveQty 0 → subtotal 0`,
rendering as a calm `$0.00` rather than immediately tripping the flag. No other
reducer behavior changes (`commitSubtotal` already no-ops when `effectiveQty` is
`0`).

## Remove the superseded section warning

- `components/invoices/InvoicesSection.tsx`: remove the `unresolvedLineCount`
  prop (and its default/JSDoc) and the `role="alert"` banner block added in PR #100.
- `components/estimates/EstimateBuilder.tsx`: remove the `unresolvedLineCount={…}`
  prop passed to `InvoicesSection` (current lines ~165–167).
- `__tests__/components/invoices/InvoicesSection.test.tsx`: remove the
  "warns (without blocking) when the estimate has unresolved line items" test.
- **Keep** `lib/invoices/compute.ts` and its `compute.test.ts` cases unchanged.

## Edge cases & known limitations

- **Both linked and unresolved** (room deleted): gold rail + chip; sage rail
  suppressed. The scope button still reads "🔗 N rooms" with stale ids — out of
  scope to reconcile here; the chip is the actionable signal.
- **Live recompute vs. snapshot divergence (accepted):** the builder recomputes
  the view live from current rooms even when locked, and never reads the approval
  snapshot. So on an **approved** estimate where a room was deleted *after*
  approval, a line that was priced in the frozen snapshot will now display
  "Quantity unset." This is a display-only divergence — the snapshot (the
  customer-approved artifact) and any issued invoices are unaffected. Showing the
  flag on locked estimates was an explicit choice; this limitation is accepted and
  recorded here.
- **Transient empty qty while editing** a manual line: the chip may appear
  between clearing the input and committing a new value. Acceptable — it
  disappears on commit.

## Testing plan

- `__tests__/components/estimates/LineItemRow.test.tsx` (new or extended):
  - manual line, `subtotal=null` → renders `⚠ Quantity unset`, no `$0.00`.
  - room-linked line with no resolvable rooms, `subtotal=null` → renders the chip.
  - deliberate free line (`effectiveQty` resolved, `subtotal=0`) → renders plain
    `$0.00`, **no** chip.
  - priced line (`subtotal>0`) → unchanged.
  - `readOnly` + `subtotal=null` → chip still rendered (always-show).
- `__tests__/lib/estimateDraft/*` (reducer): `addLineItem` yields `qty: 0`, and
  the resulting line computes a non-null subtotal (not flagged).
- Remove the obsolete `InvoicesSection` warning test (above).

## Files touched

| File | Change |
| --- | --- |
| `components/estimates/LineItemRow.tsx` | Add `unresolved` rail/tint + "Quantity unset" chip; gold-tint linked `—` |
| `lib/estimateDraft/reduce.ts` | `addLineItem` default `qty: null → 0` |
| `components/invoices/InvoicesSection.tsx` | Remove `unresolvedLineCount` prop + warning banner |
| `components/estimates/EstimateBuilder.tsx` | Remove `unresolvedLineCount` prop pass-through |
| `__tests__/components/invoices/InvoicesSection.test.tsx` | Remove obsolete warning test |
| `__tests__/components/estimates/LineItemRow.test.tsx` | New/extended chip + read-only tests |
| `__tests__/lib/estimateDraft/*` | New `qty: 0` default test |

## Done criteria

- `biome ci .` passes.
- Full test suite passes (new tests included).
- No schema change → no seed-script update needed.
