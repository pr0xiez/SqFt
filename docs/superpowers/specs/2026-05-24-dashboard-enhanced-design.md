# Dashboard Enhanced — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Overview

Replace the basic dashboard (greeting + raw counts + estimate list) with the full layout from `design/dashboard-enhanced.html`: KPI pipeline strip, today's schedule, revenue card, crew card, and a styled estimates table.

The attention inbox is **excluded** from this iteration.

---

## Data Layer

### New API routes

**`GET /api/dashboard/kpis`**

Returns pipeline stats for the current org:

```ts
{
  estimatesTotal: number        // all non-archived estimates
  estimatesDelta: number        // delta vs prior 7 days (positive = up)
  quotesSentTotal: number       // quotes with status != 'draft', last 7 days
  awaitingSignature: number     // quotes with status 'sent' | 'viewed'
  winRate30d: number            // accepted / (accepted + declined) last 30d, 0–100
  winRateDelta: number          // delta vs prior 30d period (percentage points)
  bookedRevenueMtd: number      // sum of accepted quote totals this calendar month
  bookedRevenueDelta: number    // delta vs same period last month (dollar amount)
}
```

Quote total formula: `Σ(lineItem.qty × lineItem.unitPrice) × (1 + markupPct / 100) + convenienceFee`

**`GET /api/dashboard/revenue`**

```ts
{
  mtdTotal: number
  monthGoal: number             // hardcoded 65000 for now
  daysLeft: number              // calendar days remaining in current month
  weeks: Array<{
    label: string               // e.g. "May 1–7"
    amount: number
    isCurrent: boolean
    isFuture: boolean
  }>
}
```

### Reused API routes (no changes)

| Route | Used for |
|---|---|
| `GET /api/events?date=<today>` | Timeline + crew card |
| `GET /api/estimates?limit=8` | Estimates table |

### New hooks (`lib/hooks/`)

- `useDashboardKPIs()` — calls `/api/dashboard/kpis`, standard TanStack Query pattern
- `useDashboardRevenue()` — calls `/api/dashboard/revenue`

---

## Component Structure

```
components/dashboard/
  DashboardView.tsx       ← orchestrator; fires all hooks in parallel, composes panels
  KpiPipeline.tsx         ← 5-cell pipeline strip
  ScheduleCard.tsx        ← today's event timeline
  RevenueCard.tsx         ← MTD total, goal bar, weekly breakdown
  CrewCard.tsx            ← dispatched crew derived from today's events
  EstimatesTable.tsx      ← recent 8 estimates (extracted from current DashboardView)
```

**Page layout:**
1. Full-width `KpiPipeline`
2. Two-column grid: `ScheduleCard` (left, wider) | right column empty (attention inbox removed — right column is dropped, schedule goes full-width or takes 60% width)
3. Two-column ops row: `RevenueCard` (left, wider) + `CrewCard` (right)
4. Full-width `EstimatesTable`

---

## Panel Specs

### KPI Pipeline

- 5 cells in a horizontal strip, separated by borders (no chevron arrows)
- Each cell: label (mono uppercase), large value, delta line (↑/↓/— with sage/accent/muted color), 7-bar static decorative sparkline
- Sparkline bars are hardcoded heights (purely visual, not data-driven)
- On cell hover: sparkline bars turn accent color
- Cells: Estimates · Quotes Sent · Awaiting Signature · Win Rate (30d) · Booked Revenue (MTD)

### Timeline (ScheduleCard)

- Today's events from `useEvents()`, filtered and sorted by start time ascending
- Events in the past (start time before now): title has strikethrough, muted text, dot filled green (completed style)
- No "now" line — just chronological ordering
- Each event row: time label (mono), type dot (job=accent, visit=gold, measure=sage), title, tag badge, crew initials stack, address
- Empty state: "No events scheduled today"

### Revenue Card

- Left: MTD total in large type, "Booked revenue · month-to-date" label
- Right: "Target $X · Y% of goal · N days left"
- Goal progress bar: filled width = `mtdTotal / monthGoal * 100%`, capped at 100%
- Pace marker: vertical line at `daysElapsed / totalDaysInMonth * 100%`
- Axis labels below bar: "$X booked" · "of $Y goal"
- Weekly breakdown grid (4 cells): label, amount, mini horizontal bar
  - Current week: accent color label + bar
  - Future week: muted amount + hatched bar fill
  - Past weeks: ink-2 bar fill

### Crew Card

- Source: today's events; collect all unique crew members from event assignments
- Each row: initials avatar (no status dot), name, job/task description + time range
- If multiple events for same crew member, show first event of the day
- Empty state: "No crew assigned today"

### Estimates Table

- Columns: # | Customer | Quote | Amount | Age
- Customer cell: name (bold) + address + material type sub-line (mono, muted)
- Quote cell: status badge (sent=gold, viewed=sage, accepted=accent filled, declined=strikethrough muted) + version count if >1; "No quote yet" placeholder if no quote
- Amount cell: mono, right-aligned; em dash if no quote
- Age cell: mono, right-aligned; accent color if >10 days (overdue signal)
- Row click navigates to `/estimates/[id]`

---

## Out of Scope

- Attention inbox (deferred)
- Monthly revenue goal as an editable org setting (hardcoded $65,000)
- Real sparkline data (decorative only)
- Concurrent event grouping in timeline (chronological list only)
- "Now" line in timeline
