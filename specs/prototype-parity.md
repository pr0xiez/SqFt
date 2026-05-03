# Prototype Parity Plan

Remaining gaps between the live app and the two reference prototypes:
- `SqFt - Login.html` — login page
- `SqFt - Quiet.html` — full app

Gaps that require a new data model (invoice tracking, revenue, outstanding balances) are
flagged as **deferred** and excluded from this plan.

---

## 1 — Login page

**File:** `app/(auth)/login/page.tsx` + `app/(auth)/layout.tsx`

The prototype login is a full-page layout, not a centered card with a logo block above it.

### 1a — Auth layout: add a topbar

The auth layout (`app/(auth)/layout.tsx`) currently just centers its children with no chrome.
The prototype has a minimal topbar (brand + theme toggle) and a page footer.

Change the layout to:

```
<div class="min-h-screen flex flex-col">
  <header>                          ← brand + theme toggle, padding 20px 28px
  <main class="flex-1 flex items-center justify-center p-6 pb-20">
    {children}
  <footer>                          ← "© 2025 SqFt · v0.9", mono 10px muted
```

The theme toggle in the topbar is the same `☾ Dark / ☀ Light` button as in AppNav.
Extract the toggle into a shared `<ThemeToggle />` component (or duplicate the minimal
inline version) so auth pages can use it without importing AppNav.

### 1b — Login page content

Replace the current "logo-above-card" layout with the prototype's bare `.card` layout:

| Element | Spec |
|---|---|
| Wrapper | `max-width: 380px`, no background/border/shadow |
| Eyebrow | Mono 11px muted `.04em` tracking: **"Welcome back"** |
| h1 | Display 34px 700 `-.025em`: **"Sign in to "** + `<span>` SqFt in `--ink-2` 400 |
| Sub | Mono 12px muted: **"Flooring estimates, jobs, and crews."** |
| Label | Mono 10px muted uppercase `.06em` |
| Input | Display 15px, `border-[var(--line)]`, focus → `border-[var(--ink-2)]` (not accent) |
| Password field | Wrap in `position:relative`; add **"Show"/"Hide" peek button** inside right edge |
| Submit | `bg-[var(--ink)] text-[var(--bg)]`, full width, sentence case **"Sign in →"** with arrow |
| Footer | Hairline divider above, then mono 11px: **"New to SqFt?"** + link **"Request access"** |

The password peek button:
- Absolute positioned right:8px, vertically centered
- Mono 10px uppercase tracking `.04em`, muted text, no border
- Toggles `input.type` between `password` and `text`
- Label flips "Show" → "Hide"

The footer link can remain pointing to `/signup` but use the prototype's copy.

---

## 2 — Dashboard

**File:** `components/dashboard/DashboardView.tsx`

### 2a — Personalized header

The prototype shows: eyebrow = today's date, h1 = greeting + user's first name, sub = live counts.

The session `user.name` is available via `useSession()` from `next-auth/react`. Split on
space and use the first word as the display name.

```tsx
// eyebrow
{new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" })}

// h1
{getGreeting()}, <span className="font-[400] text-[var(--ink-2)]">{firstName}</span>

// sub (derive from live data)
`${inProgress.length} active · ${quotes.length} quotes pending`
```

`DashboardView` is a client component so `useSession()` works directly.

### 2b — Header action buttons

Add two buttons to the right slot of the header, matching the prototype:

```
+ New Customer   (default variant)
+ New Estimate   (primary variant)
```

"+ New Customer" opens the `SlidePanel` from `CustomerList` — but that panel lives inside
`CustomerList`. The cleanest approach: extract `NewCustomerPanel` into its own component
importable by both `CustomerList` and `DashboardView`.

"+ New Estimate" navigates to `/estimates/new` (or triggers the existing create flow in
`EstimateList`). Until extraction is done, route to `/customers` with a `?new=1` query param
that `CustomerList` reads to auto-open the panel. **Or** lift the creation logic to a shared
hook. Either approach is fine; pick whichever avoids duplicating form state.

### 2c — Pipeline card details

The prototype pipeline card shows three lines:

```
[Customer name]            ← 13px 600
[sub: date · crew]         ← mono 10px muted
[$X,XXX]                   ← mono 11px 600, sage if paid, accent if late
```

The estimate total is computed from `lineItems`. Add a `computeTotal(estimate)` utility
(or reuse the existing one in `QuoteSummary`) that returns `null` when there are no line
items and a formatted dollar string when there are.

Until financial status (paid/late) is tracked, always render in default `--ink` color.

### 2d — Today's schedule row style

Match the prototype's `.today` row layout:

```
[time mono 11px muted, min-w-50px]  [dot 6px circle]  [name 13px 600 / sub mono 10px muted]  [tag mono 10px muted]
```

Dot color: job = `--sage`, visit = `--gold`, other/any = `--muted`.
Right tag: show `ev.type` label (job / visit / other).

---

## 3 — Calendar: time-based absolute positioning

**File:** `components/schedule/CalendarGrid.tsx`

The current grid renders one `<div>` row per hour with events as blocks inside that row.
The prototype uses a **scrollable body with absolutely-positioned events**, which allows
events to span multiple hours and be placed precisely by minute.

### Layout model

```
.cal (border rounded)
  .cal-nav  (Today / ← / → / + Add Event — already exists)
  .cal-header  (grid: 52px time gutter + N×1fr day headers, each showing day name + date number)
  .cal-body  (flex row, height 680px, overflow-y: auto)
    .cal-time-col  (52px, relative)
      — one .cal-hour-label per hour, positioned absolutely
    .cal-days  (grid: N×1fr, position:relative)
      — one .cal-day-col per day (position:relative, min-height 680px)
        — .cal-hour-line per hour (position:absolute, left:0, right:0, border-top 1px)
        — .cal-half-line per half-hour (dashed, opacity .5)
        — .cal-event per event (position:absolute)
```

### Pixel math

Visible range: 7 am–7 pm = 720 minutes. Body height: 680px.
`pixelsPerMinute = 680 / 720 ≈ 0.944`

For each event:
```
top    = (startMinutes - 7*60) * pixelsPerMinute
height = max(durationMinutes * pixelsPerMinute, 20)   ← 20px minimum
```

### Event colors

Prototype uses **solid filled** blocks (not tinted):

| Type | Background | Text |
|---|---|---|
| `job` | `var(--accent)` | `#fff` |
| `visit` | `var(--gold)` | `#fff` |
| `other` | `var(--sage)` | `#fff` |

Switch from the current tinted/outline style to these solid colors.

### Day header

Show the large day number (18px 600) below the short day name (mono 9px uppercase).
Today: day number in `--accent`.

### Add Event button

Add `+ Add Event` (primary variant) to the header actions slot alongside the nav arrows.

---

## 4 — Minor polish across remaining views

### 4a — All list-view headers: add sub count

Each list view (Customers, Estimates, Schedule) should show a sub-line with the live count,
matching the prototype pattern.

| View | Eyebrow | Sub |
|---|---|---|
| Customers | "All clients" (already exists) | `"${customers.length} customers"` |
| Estimates | "All jobs" (already exists) | `"${estimates.length} estimates"` |
| Schedule | "Week of …" (already exists) | — (week range is sufficient) |

**Files:** `CustomerList.tsx` (sub already missing), `EstimateList.tsx` (sub already missing)

### 4b — Estimates list: add "+ New Estimate" to header

The prototype estimate list has a `+ New Estimate` primary button. Currently the list has no
CTA; creating an estimate requires going through a customer first. Add the button and route
to `/customers` with a query flag, or implement a customer-picker-first flow in a SlidePanel.

**File:** `EstimateList.tsx`

### 4c — Schedule: add "+ Add Event" button to header

The prototype schedule header has `← · Today · → · + Add Event`. The current `ScheduleView`
already has a `+ Add Event` equivalent (clicking a cell opens the panel) but no explicit
header button. Add one that opens the panel with today's date pre-filled.

**File:** `CalendarGrid.tsx`

---

## 5 — Deferred (requires new data)

These gaps exist in the prototype but depend on schema additions not yet built:

| Gap | What's needed |
|---|---|
| Dashboard alerts strip | Invoice + payment tables; overdue detection query |
| Dashboard financial metrics | `revenue` (sum paid), `outstanding` (sum unpaid), `margin` |
| Pipeline card paid/late color | Invoice status per estimate |
| Quote "Send to customer" button | Email delivery + sent-state tracking |

---

## Implementation order

1. **Login page** (1a + 1b) — self-contained, no data dependencies
2. **Dashboard header + schedule rows** (2a + 2d) — session hook + small UI changes
3. **Dashboard actions + pipeline details** (2b + 2c) — moderate, involves component extraction
4. **Sub counts on list views + estimates CTA** (4a + 4b + 4c) — quick
5. **Calendar refactor** (step 3) — largest change, do last so it doesn't block other work
