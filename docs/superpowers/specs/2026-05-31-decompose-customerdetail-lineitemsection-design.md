# Decompose `CustomerDetail` and `LineItemSection`

**Date:** 2026-05-31
**Status:** Approved — ready for implementation plan

## Problem

Two React components have grown into god files that mix data fetching, state,
business logic, and rendering in one place:

- `components/customers/CustomerDetail.tsx` — 602 lines
- `components/estimates/LineItemSection.tsx` — 576 lines

Both are hard to read, hold in context, and edit reliably. Each is used in
exactly one place, so extractions are low-blast-radius.

## Goal

Break each file into focused, single-purpose units behind well-defined props.
This is a **pure structural refactor**: identical JSX, classNames, props, and
handlers — code is relocated, not changed. The one allowed behaviour-adjacent
change is promoting a local date helper to a shared util (identical output).

Out of scope: the other code smells from the audit (status-check dedup, color
maps, pagination, type assertions, etc.). This work is limited to these two
files plus the test coverage that protects them.

## Existing test coverage (baseline)

The seams with the most logic are already protected; the simpler presentational
seams have **no** UI coverage today.

**`CustomerDetail` — thin.** `customers.spec.ts` is mostly API-level. UI:
- `locations.spec.ts 16.1.1` renders the page and asserts location addresses,
  but seeds locations via the **API**, not the add-location form.
- `customers.spec.ts 10.2.2` checks navigation *to* `/customers/:id` only.
- No coverage of the editable info card, stat strip, pipeline rows, the
  add-location form, or the `startSiteMeasure` branching.
- (`customers-pagination.spec.ts` is the **list** page, not the detail page.)

**`LineItemSection` — one path covered.** `estimate-builder.spec.ts 4.1.1–4.1.5`
thoroughly exercise the room-link picker / linked-quantity path. Not covered:
plain row edits (name/desc/qty/rate, subtotal back-calc, template apply,
add/remove) and the entire totals section (fee/markup/deposit/margin).
`estimate-lockdown.spec.ts` covers the lock banner + API 409, not the
line-item read-only UI.

**Conclusion:** the fully-uncovered seams (`CustomerStatStrip`,
`CustomerInfoCard`, `EstimateTotals`, the locations add-form, the pipeline rows)
are exactly the ones where a prop-wiring mistake would slip past tests. Hence
Phase 1.

## Test harness facts (for Phase 1)

- Login: `loginAsWorkerOrg`, `loginAsFreshOrg`, `loginAsSecondaryOrg`
  (`tests/e2e/fixtures/org.ts`).
- Seed helpers (`tests/e2e/fixtures/seed.ts`): `createCustomer`,
  `createLocation`, `createSiteMeasure`, `createCustomerAndEstimate`,
  `createEstimate`, `seedEstimateWithLineItem`, `seedEstimateWithRooms`,
  `seedApprovedEstimate`, `seedDeclinedEstimate`, `reloadFresh`.
- Pattern: seed state via the API, drive the real UI, assert both rendered
  output and persisted shape via `GET /api/...`.
- **Run E2E with `--workers=1`** to match CI and avoid the known parallel
  flakiness.

---

## Phase 1 — Add E2E coverage, verified green against current code

Add focused new spec files. Each test seeds via API, drives the UI, and asserts
rendered output and (where it mutates) persisted shape.

### `tests/e2e/customer-detail.spec.ts`

- **InfoCard** — edit name/phone/email/source/notes via blur → intercept the
  PATCH, assert it fires with the right value and persists on `reloadFresh`.
- **StatStrip** — seed a customer with site measures + estimates in known
  statuses (open / approved / declined) → assert Site-Measures, Open, Accepted
  (+ declined hint), and Last-activity values render.
- **Pipeline / SiteMeasureRow** — seed a site measure + estimates → assert rows
  render `E#`, status pills, and line-item counts; clicking a site-measure row
  navigates to `/site-measures/:id`, clicking an estimate to `/estimates/:id`.
- **LocationsCard add-form** — click "+ Add location", fill address + label,
  Save → row appears and persists (the form path the API-seeded test skips).
- **startSiteMeasure branching** — single-location customer → "+ Start first
  site measure" navigates to a new site measure; zero-location customer → shows
  the "Add a location first" toast.

### `tests/e2e/line-item-section.spec.ts`

- Add line item → row appears and persists.
- Edit name / qty / rate via blur/commit → persists via PATCH.
- Subtotal back-calc — enter a subtotal on a line with qty → rate recomputes so
  `qty × rate` equals the entered subtotal.
- Apply template (seed one line-item template) → name / rate / unit populate.
- Remove line item → row gone and persists.
- **EstimateTotals** — set fee% / markup% / deposit% → assert fee, markup,
  total, deposit, and margin render the expected dollar values and persist.

### Phase 1 gate

Run both new specs with `--workers=1` against the **un-refactored** code → all
green. Do not begin Phase 2 until they pass. Green here proves the tests assert
real current behaviour, not the refactored shape.

---

## Phase 2 — The decomposition

Re-run the Phase 1 specs (plus existing `estimate-builder`, `estimate-lockdown`,
`locations`) after the refactor — they must stay green. After each extracted
file: `tsc` + `biome ci .`.

### `CustomerDetail.tsx` (602 → ~150-line orchestrator + 5 children)

`CustomerDetailView` keeps all smart parts: data hooks (`useCustomer`,
mutations), the `useMemo` derivations (`locations`, `siteMeasures`, `stats`),
all handlers (`handleField`, `handleNewSiteMeasure`, `startSiteMeasure`,
`handleAddLocation`), and the loading / not-found guards. It composes pure
presentational children that receive data + callbacks only.

New flat files in `components/customers/`:

| File | Extracted from (current lines) | Props |
|------|--------------------------------|-------|
| `CustomerHeader.tsx` | header block (217–237) | `customer`, `locations`, `onBack` |
| `CustomerStatStrip.tsx` | `Stat` + stat strip (55–91, 240–265) | `stats` |
| `CustomerInfoCard.tsx` | editable card (268–329) | `customer`, `onField(field, value)` |
| `LocationsCard.tsx` | locations list + add-form (331–442) | `locations`, `onAddLocation(addr, label)`, `onStartSiteMeasure(id)`, `isPendingCreate`; owns its own form-open/input local state; keeps `id="locations-card"` so the orchestrator's scroll still works |
| `CustomerPipeline.tsx` | pipeline card + `SiteMeasureRow` + `StatusPill` (444–602) | `siteMeasures`, `openCount`, `onStartSiteMeasure`, `onOpenSiteMeasure`, `onOpenEstimate` |

- `StatusPill` is used only by `SiteMeasureRow` → co-locate in
  `CustomerPipeline.tsx`.
- Shared cleanup serving the split: promote `formatShortDate` into `lib/utils`
  once (the children all need it) rather than copying the local helper into each
  new file. Identical output. (Note: `lib/utils` has `fmtDayHead` but **no**
  existing `formatShortDate`, so this is a new export, not a reuse.)

### `LineItemSection.tsx` (576 → ~230-line orchestrator + 2 children)

`LineItemSection` keeps all state (`items`, `feePct`, `markupPct`,
`depositPctState`, `picker`), the `computeEstimateView` memo + `lineById` map,
every mutator (`save`, `addItem`, `removeItem`, `updateItem`, `applyTemplate`,
`commitSubtotal`), the `RoomLinkPicker` invocation, the room-summary line, and
the add-button. `EstimateSavePatch` export and `tempLiId` stay here
(`EstimateSavePatch` is only used inside this file; `EstimateBuilder` builds
`onSave` inline).

New flat files in `components/estimates/`:

| File | Extracted from (current lines) | Props |
|------|--------------------------------|-------|
| `LineItemRow.tsx` | per-row block (204–405) + `normalizeUnit` helper | `li`, `lineView` (effectiveQty / subtotal), `rooms`, `templates`, `readOnly`, `onUpdate(patch)`, `onRemove`, `onCommitSubtotal(next)`, `onSaveBlur`, `onOpenPicker(rect)`, `onApplyTemplate(id)` |
| `EstimateTotals.tsx` | calc section (409–478) + `PctRow` + `PctInline` | `subtotal`, `feePct`, `markupPct`, `depositPct`, `feeAmt`, `markupAmt`, `total`, `deposit`, `margin`, `readOnly`, `onCommitFee`, `onCommitMarkup`, `onCommitDeposit` |

The row stays a controlled, stateless component — all edits flow up through
callbacks exactly as today, preserving the save-on-change / save-on-blur
behaviour byte-for-byte.

## Verification summary

- Phase 1: new specs green against current code (`--workers=1`).
- Phase 2: per-file `tsc` + `biome ci .`; final run of Phase 1 + existing
  `estimate-builder`, `estimate-lockdown`, `locations` specs green
  (`--workers=1`).
- Definition of done: both files reduced to focused orchestrators + the child
  files above; full lint clean (`biome ci .`); all tests pass.
