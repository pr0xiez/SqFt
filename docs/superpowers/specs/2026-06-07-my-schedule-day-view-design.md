# My Schedule — mobile-first day view

**Date:** 2026-06-07
**Status:** Design approved, ready for implementation planning

## Goal

A new, mobile-first page where a logged-in user can see their schedule one
day at a time, move backward/forward through days, and jump back to today.
It opens on the **current day on the user's device**. It is **read-only**: its
job is to let someone glance at what's on, then tap straight into the details
(customer, directions, estimate). Tapping an event opens a **job card** that is
deliberately built to grow into a richer job view later.

This is a *field* tool (glanceable, personal, phone). It does **not** replace
the existing `/schedule` grid, which remains the *planning* tool (org-wide week
calendar, create/edit, leads+).

## Non-goals (v1)

- No event creation/editing/deletion here. Editing stays on `/schedule`.
- No drag-to-reschedule, no time-grid/hour-axis layout, no swimlanes.
- No richer job-card features yet (status, photos, checklist, materials) —
  the card just leaves room for them.
- No desktop-specific multi-column layout.

## The core idea: one list, four filters

There is exactly **one** layout — a vertical, scrollable agenda of event cards
grouped under date section headers. The "four views" are not four layouts; they
are two independent filters over the same renderer:

|            | **Day** (range)              | **Week** (range)                 |
| ---------- | ---------------------------- | -------------------------------- |
| **My**     | my events, the focused day   | my events, the focused week      |
| **Team**   | all org events, focused day  | all org events, focused week     |

- **Range** (`Day` / `Week`): Day renders one date section; Week renders the
  seven date sections of the focused week.
- **Scope** (`My` / `Team`): My = events where the current user is an
  assignee. Team = all org events (read-only visibility for everyone).

No per-view branching beyond `filter()` + how many date sections to render.
Same card, same section header everywhere.

### Section header

Just the date, e.g. **`Mon · Jun 8`**. Today's section is accent-colored. No
event count. In Day range there is one header; in Week range there is one per
day (including empty days, which show the header with an empty state).

### Event card (identical in all four)

- Time column: `8:00a` / `–11a` (start / end).
- Left accent bar colored by type (job / visit / other) — reuse the existing
  `EVENT_BG` palette from `CalendarGrid`.
- Title.
- Type pill + customer name.
- Address line (📍) when derivable (see Data).
- Assignee avatars (reuse `CrewAvatar`). Shown in both My and Team — Team just
  has more cards; the card gets no special treatment.
- The whole card is a button → opens the job card.

## Header / navigation

Top bar, sticky, identical on every view:

1. Two segmented controls side by side: **`My | Team`** (scope) and
   **`Day | Week`** (range).
2. A nav row: `‹` prev, a centered **● Today** button, `›` next.
   - In Day range, prev/next move by one day.
   - In Week range, prev/next move by one week.
   - **Today** returns to the device's current day (and, in Week range, the
     week containing today).

All four views are at most two taps apart, and only the list body changes.

## Default landing

`My · Day · today`. "Today" is the **current date on the user's device** —
computed client-side via `todayStr()` (local time), never the server's date.

## Data & filtering

- Reuse the existing `useEvents()` hook (`GET /api/events`, returns all
  org events with `customer` + `assignees`). Event volume is small; filter
  client-side by date range and (for My) by `assignees.some(id === me)`.
  - If volume becomes a concern later, add `from`/`to`/`mine` query params to
    the events route — out of scope for v1.
- The current user's id comes from the session; pass it from the server
  component (`requireSession`) into the client view, or expose via an existing
  session hook if one is used elsewhere.
- **Multi-day events** (`endDate` set): an event appears under **each** date
  in its span that falls within the visible range. (Most jobs are single-day;
  this just avoids dropping spanning events.)
- Sorting within a day: by `startTime` (matches `listEvents` ordering).

### Job-card address derivation

`Event` has no direct address. Resolve in this order, first hit wins:

1. Linked estimate → `estimate.siteMeasure.location.address`
   (job-type events always have an estimate).
2. The customer's first/primary `Location.address`.
3. Omit the address row if neither exists.

Because the list card itself shows the address line, the address must be in the
list payload — not lazily fetched. **Decision:** extend `listEvents`' `include`
(and the `CalEvent` type) so each event carries `customer.phone` and the
resolved address (via the estimate's site-measure location, with the customer's
primary location as fallback). One payload feeds both the card and the job
card; no separate detail endpoint or per-card fetch. Event volume is small, so
the extra joins are cheap. If the derivation grows costly, precompute/denormalize
later — out of scope for v1.

## The job card (tap target)

A bottom sheet over the agenda (read-only). Rows, each a shortcut:

- Title · type · date & time.
- **Customer** → link to the customer record.
- **Address** (📍) → opens device maps for directions (when derivable).
- **Contact** → `tel:` / `sms:` the customer phone (when present).
- **Crew** — all assignees with avatars.
- **Notes** — the event's notes.
- Actions: **View customer** and **View estimate** (when an estimate is
  linked; label may include the estimate total).
- A visually distinct "room to grow" placeholder noting future additions
  (status, photos, checklist, materials) — not implemented in v1.

Dismiss via the grab handle / scrim / ✕.

## Routing, nav, permissions, desktop

- **Route:** new page under the authed group, e.g.
  `app/(app)/my-schedule/page.tsx` (server component: `requireSession`,
  passes `currentUserId` + role into the client view). Final route/nav label
  is adjustable; default nav label **"My Schedule"**.
- **Nav:** add an entry to `components/ui/AppNav.tsx`. The existing
  **Schedule** (grid) entry stays.
- **Permissions:** read-only for everyone. The `My | Team` toggle is available
  to **all roles** (Team is read-only visibility). No edit affordances here.
- **Desktop:** the same single-column list, capped at a comfortable max-width
  and centered. No multi-column layout — keeps a single code path across
  widths.

## Empty states

- A day with no (filtered) events: the section header still renders with a
  light "No jobs" line beneath (especially visible in Week range).
- Day range with nothing all day: a friendly empty state under the header.

## Components & files (anticipated)

New:

- `app/(app)/my-schedule/page.tsx` — server shell.
- `components/schedule/MyScheduleView.tsx` — client view: holds scope/range/
  focused-date state, computes the visible date sections, renders the list.
- `components/schedule/DayAgenda.tsx` (or `EventAgendaList.tsx`) — the
  section-header + card list renderer (the single layout).
- `components/schedule/EventCard.tsx` — the one card.
- `components/schedule/JobCard.tsx` — the bottom-sheet detail.

Reuse:

- `useEvents` (`lib/hooks/useEvents.ts`), `CalEvent` type.
- Date helpers in `lib/utils.ts` (`todayStr`, `getWeekStart`, `addDays`,
  `dateStr`, `timeToMinutes`), `fmtDollar`.
- `CrewAvatar`, type-color palette, `Modal`/sheet primitives from
  `components/ui/`.

Extend:

- `listEvents` / `GET /api/events` payload + `CalEvent` type to include
  `customer.phone` and the derived address (one payload feeds card + job card).

## Testing

- **Unit (pure):** date-section computation (Day → 1 section; Week → 7,
  correct week for an arbitrary focused date; Today resets correctly),
  My-scope assignee filter, multi-day event placement, address-derivation
  precedence.
- **Component:** list renders cards under correct headers; toggles change the
  rendered set without changing layout; tapping a card opens the job card;
  empty-day state.
- Default-day computation uses local `todayStr()` (guard against server-date
  regressions).

## Docs to update on implementation

- `AGENTS.md` — note the new `my-schedule` page in the schedule domain and the
  new `components/schedule/*` pieces.
- `CONTEXT.md` — only if a domain concept/rule changes (this is additive and
  read-only, so likely just a one-line mention that the read-only personal day
  view lives alongside the editable grid).

## Future (explicitly later)

- Richer job card: job status (en route / on site / done), photos, checklist,
  materials.
- Team scope on desktop could gain a denser multi-person view.
- Server-side date/assignee filtering if event volume grows.
