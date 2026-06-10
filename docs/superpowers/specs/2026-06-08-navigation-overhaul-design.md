# Navigation Overhaul — Design

**Date:** 2026-06-08
**Status:** Approved (brainstorm) — ready for implementation planning
**Scope:** Navigation *chrome* only (sidebar, mobile bottom bar, drawer, brand,
account controls + the layout file that positions them). No page content
changes.

## Problem

The mobile bottom bar crams up to **7 equal-width cells** (Dashboard,
Customers, Site Measures, Estimates, My Schedule, Schedule Manager, Settings)
into a 375px-wide phone. Long labels like "Site Measures" and "Schedule
Manager" wrap to two lines, so cells change height and the bar visibly shifts
up and down — it looks broken and cramped. The crowding only affects
**lead/admin** (crew sees a single tab, My Schedule).

Desktop uses a 7-item text top bar that works but is a second, unrelated nav
model to maintain and cannot express the natural grouping of the work.

## Goals

- Mobile bottom bar never wraps or shifts — fixed cell count, single-line
  labels.
- One nav mental model across desktop and mobile.
- Frequent destinations reachable in one tap on mobile.
- Navigation defined **once** and consumed by every surface, so adding a
  destination later is a single config edit.
- No regressions to role gating or the crew experience.

## Non-goals (YAGNI)

- No new destinations (Invoices, Reports, search/command palette). The sidebar
  has vertical room when they're wanted; adding one is a config line.
- No changes to any page's content — only the nav shell and the layout file
  that frames it.

## Information architecture — single source of truth

All three surfaces derive from one config. Items are grouped:

| Group        | Items                                   | Visibility            |
|--------------|-----------------------------------------|-----------------------|
| **Overview** | Dashboard (`/`)                         | lead+                 |
| **Pipeline** | Customers, Site Measures, Estimates     | lead+                 |
| **Schedule** | My Schedule, Schedule Manager           | My Schedule = all roles; Schedule Manager = lead+ |
| *(footer)*   | Settings                                | lead+                 |
| *(footer)*   | Account — name, role, theme, sign out   | all roles             |

Role filtering preserves today's behavior exactly (`navItemsFor(role)`):

- **crew** → only My Schedule + Account.
- **lead / admin** → everything above.
- Per-item `minRole` mirrors existing rules: Schedule Manager and Settings are
  `lead+`; My Schedule is unrestricted. This matches
  `lib/auth/permissions.ts` (`ROLE_RANK` crew=0, lead=1, admin=2) and the
  existing Schedule Manager lead+ redirect.

The **mobile bottom-bar shortcuts** are a separate, explicit ordered list (not
all items):

```
Home (Dashboard) · Customers · Estimates · Schedule (→ /my-schedule) · More
```

"Schedule" routes to **My Schedule** (the read-only, mobile-first day view).
Everything not on the bar (Site Measures, Schedule Manager, Settings) lives in
the drawer reached via **More**.

## Surfaces

### Desktop — persistent left sidebar (~208px)

- Layout: brand at top → grouped nav with visible group labels → Settings +
  account block pinned at the bottom.
- Active item: accent left-border + tint; `aria-current="page"`.
- **Collapse** toggle shrinks the sidebar to a **56px icon rail** (icons only,
  tooltips on hover) for full-width estimate/invoice tables.
- Collapsed/expanded state is **remembered per user** via `localStorage`
  (`useSidebarCollapsed` hook). Hydration-safe: render expanded on the server,
  reconcile on mount to avoid a flash.
- Account block at the bottom opens a small **popover** containing the theme
  toggle and sign out (keeps those controls out of the always-visible rail).

### Mobile — fixed bottom bar + drawer

- **Bottom bar:** exactly 5 cells (4 shortcuts + More). Single-line labels,
  fixed height — this is the core fix for wrapping/shifting. Safe-area inset
  padding preserved (`env(safe-area-inset-bottom)`).
- **More** opens a left **drawer** (slide-in, scrim) containing the *same*
  grouped menu as the desktop sidebar + Settings + account block + theme +
  sign out.
- The drawer is a proper modal dialog: focus-trapped, `Esc` to close, scrim
  click to close, `aria-expanded` on the More trigger, body scroll locked while
  open (reuse the patterns already in `MobileSessionSheet`).
- **Active state:** the cell for the current route is active; when the current
  route is a drawer-only destination (e.g. Site Measures), the **More** cell is
  shown active instead.
- The floating avatar "seal" above the old bar is **removed** — account now
  lives in the drawer. `MobileSessionSheet` is absorbed into the drawer (its
  identity/theme/sign-out content moves into the drawer footer).

### Crew on mobile

Crew has a single destination, so a bottom bar is pointless. Crew gets a slim
**top app bar** (brand + avatar) where the avatar opens the account drawer
(My Schedule link + account controls). No bottom shortcut bar for crew.

## Components & files

New / changed (all under the nav chrome):

- `lib/nav/items.ts` — grouped nav config, the ordered bottom-bar shortcut
  list, icon ids, and `navItemsFor(role)`. **The single source of truth.**
- `components/ui/nav-icons.tsx` — nav icons keyed by a stable **icon id**.
  (Today `AppNav` keys icons by visible label, which breaks if a label
  changes; switch to ids.)
- `components/ui/NavMenu.tsx` — the canonical grouped item list, shared by the
  desktop sidebar and the mobile drawer.
- `components/ui/SideNav.tsx` — desktop sidebar + icon rail + collapse toggle;
  uses `useSidebarCollapsed`.
- `components/ui/MobileTabBar.tsx` — the 5-cell bottom bar.
- `components/ui/NavDrawer.tsx` — modal drawer wrapping `NavMenu` + account
  footer.
- `components/ui/AppNav.tsx` — thin orchestrator: renders `SideNav` at `md+`,
  `MobileTabBar` + `NavDrawer` below `md` (or the crew top bar for crew).
- `components/ui/MobileSessionSheet.tsx` — removed; content folded into
  `NavDrawer`.
- `app/(app)/layout.tsx` — flips to a **row** layout at `md+` (sidebar + main),
  keeps a bottom-bar offset below `md`. The page content container inside
  `main` is unchanged.

## Accessibility

- `nav` landmarks on sidebar, bottom bar, and drawer.
- `aria-current="page"` on the active item.
- Drawer: `role="dialog"`, `aria-modal`, focus trap, `Esc` + scrim close,
  `aria-expanded`/`aria-haspopup` on the More trigger.
- Icon-rail items expose accessible names via tooltip/`aria-label`.
- Safe-area insets preserved on the bottom bar.

## Testing

- **Unit:** `navItemsFor(role)` returns the correct items per role
  (crew → My Schedule only; lead/admin → full set; Schedule Manager + Settings
  gated to lead+). Bottom-bar active-cell logic, including "More is active when
  the route is a drawer-only destination."
- **Component:** `SideNav` renders groups and persists collapse state;
  `NavDrawer` opens/closes and traps focus; `MobileTabBar` highlights the
  correct cell.
- **E2E:** crew still redirects to `/my-schedule`; a lead sees the sidebar on
  desktop; tapping More opens the drawer on mobile. Update any existing e2e
  that asserts on the old nav structure.

## Docs to update in the same change

- `AGENTS.md` — note that navigation is defined once in `lib/nav/items.ts` and
  rendered by `SideNav` (desktop) / `MobileTabBar` + `NavDrawer` (mobile) via
  `AppNav`; `MobileSessionSheet` is gone.
- Re-check the `app/(app)` description in `AGENTS.md` for any nav wording that
  changes.

## Risks

- **Layout regressions:** changing `app/(app)/layout.tsx` from column to row is
  the only content-adjacent edit. Verify scroll behavior and the
  `max-w-[1200px]` content container at both breakpoints.
- **Hydration flash** on the remembered collapse state — mitigated by
  server-rendering expanded and reconciling on mount.
- **E2E selectors** tied to the old bar/labels will need updating.
