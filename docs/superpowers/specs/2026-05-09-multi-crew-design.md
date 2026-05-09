# Multi-crew per event + crew filter bar

**Date:** 2026-05-09
**Roadmap items:** Tier 2 #5 (multi-crew per event) and #6 (crew filter bar). Shipped together in one PR.
**Parent roadmap:** [`2026-05-09-design-gap-roadmap-design.md`](2026-05-09-design-gap-roadmap-design.md)
**Source design:** `design/SqFt - App.html` (`crew-toggles`, `crew-bar`, `cal-evt-crew`)

## Problem

`Event.crew` is a single nullable string. Real flooring contractors routinely send 2 crew members (e.g. installer + helper) to one job — today's model can't represent it. Once multi-crew exists, the calendar gets noisy with 3+ crews active in a week, so a sticky filter bar is needed to focus on one crew at a time.

## Decisions

These were settled during brainstorming and are load-bearing for the rest of the spec.

1. **Schema: Option B — `CrewMember` model + many-to-many to `Event`.** Renames are O(1), role is first-class, sets up future per-crew features. The roadmap explicitly flagged this as the design's main fork.
2. **Roster admin UI ships in this PR.** A small `/crew` page with name/role editing + archive. Without it, the only way to add a crew member is to edit the seed script.
3. **No per-crew color.** All avatar dots/circles render with one neutral fill (`var(--ink-2)`). Initials distinguish. The user explicitly rejected the rainbow-of-colors approach from the prototype.
4. **No manual ordering.** Crew members sort alphabetically by `name` everywhere (roster page, form toggles, filter bar). No `sortOrder` field, no drag handles.
5. **Filter bar is single-select** — matches design HTML exactly, simplest state.
6. **Soft-delete via `archived: boolean`.** Hard-delete is permitted only when the crew member has zero events, otherwise archiving hides them from form toggles and filter bar but preserves historical event assignments.

## Schema

```prisma
model CrewMember {
  id        Int          @id @default(autoincrement())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  role      String       @default("")
  archived  Boolean      @default(false)
  createdAt DateTime     @default(now())

  events    Event[]      // implicit M:N → Prisma generates _CrewMemberToEvent

  @@index([orgId, archived])
}

model Event {
  // ...existing fields, MINUS:
  // crew String?  ← removed
  crewMembers CrewMember[]
}

model Organization {
  // ...
  crewMembers CrewMember[]
}
```

**Why implicit M:N over an explicit `EventCrew` join model:** no per-assignment metadata is needed. Prisma manages the join table, queries stay clean (`event.crewMembers`). If we later need per-assignment fields (e.g. `hoursPlanned`), promote it to an explicit model then.

## Migration

Single Prisma migration:

1. Create `CrewMember` table and `_CrewMemberToEvent` join table.
2. Per-org backfill: insert one `CrewMember` row per distinct non-null `Event.crew` value within that org.
   ```sql
   INSERT INTO "CrewMember" ("orgId", "name")
   SELECT DISTINCT "orgId", "crew" FROM "Event"
   WHERE "crew" IS NOT NULL AND "crew" <> '';
   ```
3. Backfill `_CrewMemberToEvent` by joining `Event.crew` ↔ `CrewMember.name` within each org.
4. Drop `Event.crew`.

`prisma/seed.ts` updated: create the four design-roster crew members per org (Mike — Owner / Sales, Carlos — Lead Installer, Dave — Installer, Sarah — Showroom). Existing seed events that reference `crew: "Carlos"` etc. switch to connecting by `crewMemberIds`.

## API

### New endpoints

- `GET /api/crew-members` — returns active (non-archived) crew for current org, ordered by `name`. Optional `?includeArchived=1` for the roster page.
- `POST /api/crew-members` — body `{ name: string, role?: string }` → creates and returns the row.
- `PATCH /api/crew-members/[id]` — partial update (`name`, `role`, `archived`).
- `DELETE /api/crew-members/[id]` — hard-delete only if `events` count is 0; otherwise returns `409 Conflict` with a message hinting at archiving instead.

All endpoints scoped by current `orgId` from the session — same pattern as `/api/customers`.

### Changed endpoints

- `POST /api/events`, `PATCH /api/events/[id]`:
  - Drop `crew: string` field from zod schema and request handler.
  - Add `crewMemberIds: number[]` (zod `z.array(z.number().int()).max(20)`, optional with default `[]`).
  - Validate every ID belongs to the current org before connecting.
  - Use `crewMembers: { set: ids.map(id => ({ id })) }` on update so it acts as full replacement.
- `GET /api/events*`: include `crewMembers: { id, name, role }[]` in the response, sorted by `name`.

### Hooks

- `lib/hooks/useEvents.ts` — `EventDTO.crew` removed, `crewMembers: CrewMemberSummary[]` added; `EventInput.crew` removed, `crewMemberIds?: number[]` added.
- `lib/hooks/useCrewMembers.ts` — new. Mirrors the shape of `useCustomers`: list query + create/update/delete mutations.

## UI

### Event form panel — multi-crew toggle grid

`EventFormPanel` is currently inlined in `components/schedule/CalendarGrid.tsx` and the file has grown past ~700 lines. **Extract** it to `components/schedule/EventFormPanel.tsx` as part of this work — the new toggle grid + roster fetching pushes it further and the file is already doing too much.

Toggle grid replaces the existing `<select>`:

- 2-column grid (matches design `crew-toggles`).
- Each toggle: small neutral avatar circle (10–12px, `var(--ink-2)` background, white initial) + name on the left, checkmark on the right when active.
- Active toggle inverts: ink background, bg-color text — matches `.crew-toggle.active` in design.
- Clicking toggles membership in a `Set<number>` of `crewMemberIds`.
- Below the grid, `evp-crew-meta` line shows "X assigned" when ≥1, or "No crew assigned" when 0.
- Roster fetched via `useCrewMembers()`. Loading state: skeleton row of 4 disabled toggles.
- Empty state (org has no crew): inline link "Add crew members →" pointing to `/crew`.

### Calendar event chip

In `CalendarGrid.tsx`, replace the single text crew line with a row of avatar dots:

- Each dot: 10×10 colored circle with `var(--ink-2)` background, white initial, tiny `var(--font-mono)` font.
- Followed by names joined by `·` if there's room. CSS `text-overflow: ellipsis` on overflow.
- Caps at 3 dots, then `+N` (e.g. `MC·D +2`).
- Only render if chip height > 46 (existing threshold).
- When event has no crew assigned: render nothing (current behavior is `&& ev.crew` truthy check).

### Crew filter bar

New component `components/schedule/CrewFilterBar.tsx`, rendered inside the schedule page above `CalendarGrid`:

- Sticky chip row inside a bordered surface (matches `.crew-bar` styles).
- Chips: `All` first, then one per active crew member (alphabetical).
- Each crew chip: small avatar circle + name + count of events for the visible week (e.g. "Carlos · 4"). The `All` chip omits the avatar.
- Active chip: filled (ink background, bg-color text). Single-select. Clicking the active chip leaves it active (doesn't deselect — must click another to switch; "All" is the way to clear).
- Right-aligned meta text:
  - When `All` active: "Showing **all crews** · *N* events this week"
  - When a crew is active: "Filtered to **Carlos** · *N* events this week"
- Filter state is component-local (`useState`). No URL persistence, no sessionStorage. Switching weeks preserves the active filter.

The schedule page (which renders `CalendarGrid`) lifts crew-filter state up so it can pass:
- a `dimUnmatched: boolean` prop into `CalendarGrid`, which adds `crew-focus` class to the calendar root,
- and a `match` flag onto each rendered event chip (added directly in the grid based on the active filter).

CSS for `.cal.crew-focus .cal-event { opacity: .18; filter: saturate(.4) }` and `.cal.crew-focus .cal-event.crew-match { opacity: 1; filter: none }` ports straight from the design HTML into the grid component's local CSS module / Tailwind classes.

### Roster page (`/crew`)

There is no `/settings` infrastructure today (top nav has 5 tabs: Dashboard, Customers, Estimates, Quotes, Schedule), so this PR doesn't invent one. The roster lives at `app/(app)/crew/page.tsx` rendering a `CrewRosterView` component (`components/crew/CrewRosterView.tsx`). It does **not** get a top-nav tab — it's reached via two affordances:

1. A small **gear-icon button** at the right edge of `CrewFilterBar`, linking to `/crew`.
2. The empty-state link in `EventFormPanel` ("Add crew members →") when the org has no crew yet.

**Layout:**
- Page header: "Crew" + `+ Add crew member` button.
- Active members list (alphabetical):
  - Each row: neutral avatar circle, name (inline editable on click), role text (inline editable), `Archive` button on the right.
  - Edits commit on blur or Enter; Esc cancels.
- "Archived" collapsible section at the bottom (collapsed by default). Each archived row has a `Restore` button. If 0 archived, the section isn't rendered.

**Add flow:**
- `+ Add crew member` button reveals an inline row at the top of the list with a name input (required), role input (optional), Save / Cancel.
- On save, `POST /api/crew-members`, then re-query.

**Delete flow:**
- Archive is the primary action. There is no UI affordance for hard-delete in this PR — soft-delete handles every realistic case, and hard-delete-when-zero-events is rare enough to defer.


### Dashboard

`components/dashboard/DashboardView.tsx` currently composes the event subtitle from `ev.crew` (single string) + first line of customer address. Update to:
- Render the same row of neutral avatar dots used on calendar chips, followed by names (joined by `·`).
- Address fragment continues to follow.
- If no crew assigned, fall back to just the address.

## Where the work lands

| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, new migration under `prisma/migrations/`, `prisma/seed.ts` |
| API — crew | `app/api/crew-members/route.ts`, `app/api/crew-members/[id]/route.ts` |
| API — events | `app/api/events/route.ts`, `app/api/events/[id]/route.ts` |
| Hooks | `lib/hooks/useEvents.ts` (modified), `lib/hooks/useCrewMembers.ts` (new) |
| Schedule UI | `components/schedule/CalendarGrid.tsx` (modified), `components/schedule/EventFormPanel.tsx` (new, extracted), `components/schedule/CrewFilterBar.tsx` (new) |
| Schedule page | `app/(app)/schedule/page.tsx` and `ScheduleView` in `components/schedule/CalendarGrid.tsx` — lift filter state to `ScheduleView`, render `CrewFilterBar` above `CalendarGrid` |
| Roster | `app/(app)/crew/page.tsx`, `components/crew/CrewRosterView.tsx` |
| Dashboard | `components/dashboard/DashboardView.tsx` |

## Testing

- **Unit:**
  - `filterEventsByCrew(events, crewMemberId | "all")` helper.
  - `formatCrewSubtitle(crewMembers, address)` for dashboard list.
  - `weekCrewCounts(events, weekStart)` returning `{ [crewMemberId]: count }` for the filter bar.
- **API:**
  - `events` POST/PATCH with valid `crewMemberIds`, with empty array, with cross-org IDs (must reject with 400).
  - `crew-members` CRUD: create, update name/role, archive, restore, delete-with-events (409), delete-without-events (200).
- **Component:**
  - `CrewFilterBar` renders chips with correct counts and applies `crew-focus` class on the parent when non-`All` active.
  - `EventFormPanel` toggles set state and submits the right `crewMemberIds`.
  - `CrewRosterView` renders archived/active sections, inline-edit commits on blur.
- **Migration:**
  - Run on a copy of seed-populated DB. Verify: existing `Event.crew` strings became `CrewMember` rows per org, every event has the right `_CrewMemberToEvent` row, `Event.crew` column is gone, no orphans.

## Out of scope

- Per-crew availability or scheduling-conflict detection.
- Crew login / per-user crew identity.
- Drag-and-drop reordering on the roster (no `sortOrder` field exists; alphabetical only).
- URL persistence of crew-filter state.
- Mobile-specific crew toggle layout — the 2-column grid works on both.
- Bulk-import of crew (manual add only).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration data-loss if backfill SQL is wrong | Migration runs in a transaction; backfill verified by an assertion query (`SELECT COUNT(*) FROM "Event" WHERE "crew" IS NOT NULL` must equal `_CrewMemberToEvent` row count after backfill). |
| Cross-org `crewMemberIds` injection | Server validates every ID belongs to the session's `orgId` before `connect`. |
| `EventFormPanel` extraction breaks existing event create/edit | Extraction is a pure refactor with no behavior change in the same commit; multi-crew change is a separate commit on top. |
| Roster page is unreachable if the user hasn't opened the schedule | The form panel's empty-state link to `/crew` provides a second entry point. If both surfaces feel hidden, a future settings/menu pass can add a top-level entry. |
