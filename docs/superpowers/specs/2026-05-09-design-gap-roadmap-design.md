# Design Gap Roadmap

**Date:** 2026-05-09
**Source design:** `design/SqFt - App.html`
**Lens:** user-flow completeness — gaps that prevent or impede a real flooring contractor's work, ranked first.

## Purpose

Catalog every functional gap between the prototype design (`design/SqFt - App.html`) and the current Next.js app, grouped into tiers. This document is a roadmap, not a per-feature design — each Tier 1/2 entry is sized to become its own spec + plan + implementation cycle.

## Scope

**In scope:** UI/UX gaps that work with today's Prisma schema, plus targeted schema changes where the gap is small and isolated (e.g. multi-crew on `Event`).

**Out of scope:** dashboard analytics features that require new business-metrics data (invoices, payments, job lifecycle, line-item cost). These are stubbed in Tier 3 and deferred to a sibling spec.

## Tier 1 — Flow-breaking gaps

These prevent or significantly block a normal task with today's schema. Ship in this order; (1) is a prerequisite for Tier 2 item (7).

### 1. `/quotes` index route + Quotes nav tab

**Problem:** there's `/quotes/[id]` but no global list. Users can only reach a quote via its parent estimate, so a quote whose estimate they don't remember is effectively lost.

**Design reference:** `screen-quote-list` in design HTML — table with columns `# | Customer | Estimate | Total | Status | Date`, search input, status filter chips (All / Draft / Sent / Accepted).

**Includes:**
- New page at `app/(app)/quotes/page.tsx` rendering a `QuoteListView` component.
- New `useQuotes()` hook (or extend existing) returning the list with `customer`, `estimate`, `lineItems` aggregated for total.
- Add `Quotes` tab to `components/ui/AppNav.tsx` desktop top nav.
- Add `Quotes` tab to mobile bottom nav (5 tabs total — adjust grid from `grid-cols-4` to `grid-cols-5`, add icon).
- Search by quote `#`, customer name, or estimate `#`. Status filter chips with hidden-count when filter is active.

**Schema:** none.

### 2. Search on Customers list

**Problem:** filter chips by source exist but no text search. At >~20 customers, finding by name becomes unusable.

**Design reference:** `screen-customers` filter bar in design HTML — search input with magnifier icon and clear button, placed before the filter chips.

**Includes:**
- Search input in `components/customers/CustomerList.tsx` filter bar (left of source chips).
- Match against `name`, `phone`, `email`, `address` (case-insensitive substring).
- Search and source filter compose (both apply).
- Clear-button (`×`) when input has content.

**Schema:** none.

### 3. Search + filters on Estimates list

**Problem:** neither search nor filters exist. Same scaling problem as Customers, plus no way to narrow to estimates that are still drafts or already quoted.

**Design reference:** `screen-estlist` in design HTML.

**Includes:**
- Search input in `components/estimates/EstimateList.tsx` matching estimate `#` and customer name.
- Filter chips: All / No rooms / Measured / Quoted. State derivable from existing data:
  - **No rooms:** `items` has no `type === "room"` entries.
  - **Measured:** has rooms but no `quotes`.
  - **Quoted:** has at least one related `Quote`.
- Hidden-count when filtered.

**Schema:** none.

### 4. "Change customer" on estimate builder

**Problem:** design has both **View** and **Change** buttons on the customer bar; the app has only **View**. If a customer was mis-attached at creation, the only fix is to recreate the estimate.

**Design reference:** `cust-bar` actions on `screen-estimates` plus `cp-panel` mini-picker.

**Includes:**
- Add **Change** button next to View on the customer bar in `components/estimates/EstimateBuilder.tsx`.
- Reuse the customer-picker pattern (mini-panel with search). If a generic version doesn't exist, extract one from any existing usage and reuse.
- On select, `useUpdateEstimate` with the new `customerId`.

**Schema:** none (Estimate already has `customerId`).

## Tier 2 — Flow rough edges

Significant frustrations or fidelity gaps. Numbering is continuous from Tier 1 to keep references stable.

### 5. Multi-crew per event

**Problem:** `Event.crew` is a single string. Real flooring contractors routinely send 2 crew members (e.g. installer + helper) to one job. Today's model can't represent it.

**Design reference:** `evp-crew-toggles` (multi-select grid with avatars) in event panel; `cal-evt-crew` showing a row of avatar dots on each event chip.

**Includes:**
- Schema change: replace `Event.crew: String?` with one of:
  - **Option A (cheap):** `Event.crewMembers: String[]` — Postgres native string array. Lowest churn.
  - **Option B (proper):** introduce a `CrewMember` model and an `EventCrew` join table. Lets crew be its own first-class entity (avatars, colors, availability) and unlocks future features. Decide during this gap's own spec.
- Migrate existing `crew` values into the new shape; update seed script.
- Replace the single `<select>` in `EventFormPanel` with the toggle grid pattern from design (`crew-toggles`).
- Render avatar dots on calendar event chips.

**Schema:** yes — choice between A and B is the main design decision for this gap's spec.

### 6. Crew filter bar above calendar

**Problem:** when 3+ crews are scheduled, the calendar gets noisy. Design has a sticky chip bar that lets you focus on one crew (or "all"), dimming non-matching events.

**Design reference:** `crew-bar` and `.cal.crew-focus` styling in design HTML.

**Includes:**
- Chip row above the calendar: one chip per crew member + an "All" chip, with a count of events for the current week per crew.
- Active chip dims unmatched events to opacity 0.18 (matches design).
- Pure view-state; no persistence required.

**Schema:** none. **Depends on #5** — without the multi-crew model, the filter bar can only filter by the single `crew` string.

### 7. "Tie to estimate" picker for new quote

**Problem:** when creating a quote from a context that doesn't already specify an estimate (specifically, the `+ New Quote` button on the global Quotes list), the user must pick which estimate to attach.

**Design reference:** `ep-panel` mini-picker in design HTML — modal-ish list with a search and "required, pick one" hint.

**Includes:**
- Mini-panel reusing the existing picker pattern.
- Search across customer name and estimate `#`.
- On select, calls `useCreateQuote({ estimateId })` and navigates to the new `/quotes/[id]`.

**Schema:** none. **Depends on #1** — there's currently no UI surface that needs this picker.

## Tier 3 — Deferred (sibling spec)

These are functional in the design but require business-metrics data the schema doesn't have. They will be addressed in a follow-up spec — provisional name **`business-metrics-data-model`** — once the Tier 1/2 contractor-flow items are solid.

- **Dashboard alerts row** (overdue invoice, quote expiring) — needs an invoice/payment model and a `Quote.expiresAt` field with expiration logic.
- **4 KPI metrics** (Revenue this month / Outstanding / Pipeline value / Average margin) — needs invoice history and line-item cost (for margin).
- **Job pipeline board** (Estimates / Scheduled / Active / Done) — needs an explicit job-lifecycle state machine on a `Job` entity (currently estimates and quotes are not linked to a job-state concept).
- **Revenue chart** (last 6 months) — needs invoice history.

The current dashboard's "Recent Estimates" + "Today's Schedule" widgets stay as-is until that spec lands.

## Dependencies

```
#1 Quotes list ──► #7 Tie-to-estimate picker
#5 Multi-crew schema ──► #6 Crew filter bar
```

Everything else is independent and can be implemented in any order.

## Suggested sequencing

1. **#2, #3** (search + filters) — smallest, highest immediate quality-of-life lift, no schema work.
2. **#4** (change-customer wiring) — small, fixes a real foot-gun.
3. **#1** (Quotes list + nav) — moderate, unblocks #7 and the natural global-quote-finding flow.
4. **#7** (tie-to-estimate picker) — only meaningful after #1.
5. **#5, #6** (multi-crew + filter) — biggest of the set, schema decision required. Schedule for last so the smaller wins ship first.

## Out of scope

- Visual / styling refinements that aren't functional gaps (typography, color tweaks, etc.).
- Customer detail page comparison — left for a closer pass once Tier 1 is in flight.
- Mobile-specific behaviors beyond adding the Quotes tab to the bottom nav.
- All Tier 3 items.

## Per-gap design specs

Each Tier 1/2 entry above will become its own design spec at
`docs/superpowers/specs/YYYY-MM-DD-<gap-slug>-design.md` before implementation, following the standard brainstorm → spec → plan → implement flow. This roadmap is the parent index that those specs link back to.
