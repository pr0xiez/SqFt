# SqFt — Current Functionality

Snapshot of all implemented features, routes, components, data models, and behaviors as of the current codebase.

---

## Overview

SqFt is a multi-tenant SaaS application for flooring contractors to create estimates, manage customers, track jobs, and schedule installations.

**Tech stack:**
- Next.js 16 (App Router) · React 19 · TypeScript
- PostgreSQL + Prisma 7 (PrismaPg adapter)
- NextAuth v5 (Credentials + JWT)
- TanStack React Query v5 (with localStorage persistence)
- Tailwind CSS v4 · CSS variables design tokens
- Chart.js v4 · next-pwa (Workbox)

---

## Routes

### Route groups

```
(auth)   — unauthenticated layout (centered card, theme toggle, no nav)
(app)    — protected layout (AppNav, Providers wrapper)
```

### Auth pages

| Route | Purpose |
|---|---|
| `/login` | Email + password sign-in. Error banner on failure. Redirects to `/` on success. |

Self-service signup and onboarding have been removed; users and organizations are provisioned out-of-band (e.g. via the seed script).

### App pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `DashboardView` | KPI metrics, alerts, job pipeline kanban, 6-month revenue chart, today's schedule. |
| `/customers` | `CustomerListView` | Filterable table/card list of all customers. Opens `NewCustomerPanel` slide panel. |
| `/customers/[id]` | `CustomerDetailView` | Editable customer fields, source badge, list of estimates, "+ New estimate" action. |
| `/estimates` | `EstimateListView` | Table/card list of all estimates with status badges and calculated sqft. |
| `/estimates/[id]` | `EstimateBuilderView` | Full estimate editor: rooms, line items, quote summary with auto-save. |
| `/schedule` | `ScheduleView` (CalendarGrid) | Week-view calendar with event creation and editing via click. |

---

## API Routes

All routes:
- Require authentication (session checked via `getOrgId()`)
- Are scoped to the authenticated user's organization
- Are wrapped with `withLogging()` middleware (structured JSON logs to stdout)
- Return JSON

### Authentication

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/auth/[...nextauth]` | NextAuth handlers (JWT session, credentials provider). |

### Customers

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/customers` | All customers for org, ordered by `createdAt` DESC. Includes `_count.estimates`. |
| `POST` | `/api/customers` | Create customer. Required: `name`. Optional: `phone`, `email`, `address`, `source`, `notes`. |
| `GET` | `/api/customers/[id]` | Single customer with full estimates array + count. |
| `PATCH` | `/api/customers/[id]` | Partial update of any customer field. |
| `DELETE` | `/api/customers/[id]` | Delete customer (cascades to estimates). |

### Estimates

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/estimates` | All estimates for org, ordered by `createdAt` DESC. Includes customer info and item count. |
| `POST` | `/api/estimates` | Create blank estimate. Required: `customerId`. Optional: `taxRate`, `markupPct`, `depositPct`. |
| `GET` | `/api/estimates/[id]` | Single estimate with all items and line items. |
| `PATCH` | `/api/estimates/[id]` | Update estimate fields and/or replace items/lineItems arrays (delete-and-recreate strategy). |
| `DELETE` | `/api/estimates/[id]` | Delete estimate (cascades). |

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/events` | All events for org, ordered by date + startTime. Includes customer info. |
| `POST` | `/api/events` | Create event. Required: `type`, `title`, `date` (YYYY-MM-DD), `startTime`, `endTime` (HH:MM). |
| `PATCH` | `/api/events/[id]` | Partial update of any event field. |
| `DELETE` | `/api/events/[id]` | Delete event. |

---

## Data Models (Prisma)

### Organization
| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `name` | String | |
| `slug` | String | Unique |
| `plan` | String | `"free"` \| `"pro"`, default `"free"` |
| `createdAt` | DateTime | |

### User
| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `name` | String | |
| `email` | String | Unique |
| `password` | String | bcrypt hash |
| `role` | String | `"owner"` \| `"admin"` \| `"member"`, default `"member"` |
| `orgId` | String | FK → Organization (cascade delete) |

### Customer
| Field | Type | Notes |
|---|---|---|
| `id` | Int (autoincrement) | PK |
| `orgId` | String | FK → Organization |
| `name` | String | |
| `phone` | String? | |
| `email` | String? | |
| `address` | String? | |
| `source` | String | `"phone"` \| `"online"` \| `"referral"` \| `"walkin"` \| `"website"`, default `"phone"` |
| `notes` | String? | |
| `createdAt` | DateTime | |

### Estimate
| Field | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `orgId` | String | FK → Organization |
| `customerId` | Int | FK → Customer (cascade delete) |
| `status` | String | `"quote"` \| `"scheduled"` \| `"in_progress"` \| `"completed"`, default `"quote"` |
| `date` | DateTime | |
| `taxRate` | Float | Default 0.08 |
| `markupPct` | Float | Default 0 |
| `depositPct` | Float | Default 0.50 |
| `createdAt` | DateTime | |

### EstimateItem (room or note)
| Field | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `estimateId` | Int | FK → Estimate (cascade delete) |
| `type` | String | `"room"` \| `"note"` |
| `sortOrder` | Int | |
| `name` | String? | Room name |
| `shape` | String? | `"rect"` \| `"tri"` \| `"lshape"` |
| `w`, `l` | Float? | Dimensions |
| `lshapeData` | Json? | `{ sections: [{w,l}], deductions: [{w,l,label}] }` |
| `text` | String? | Note text |

### LineItem (material or labor)
| Field | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `estimateId` | Int | FK → Estimate (cascade delete) |
| `name` | String | |
| `rate` | Float | Price per unit, default 0 |
| `qtyMode` | String | `"manual"` \| `"linked"`, default `"manual"` |
| `qty` | Float? | Used when mode is manual |
| `wastePct` | Float | Default 0 |
| `unitLabel` | String | Default `"ft²"` |
| `linkedRoomIds` | Int[] | EstimateItem IDs used when mode is linked |
| `sortOrder` | Int | |

### Event
| Field | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `orgId` | String | FK → Organization |
| `type` | String | `"job"` \| `"visit"` \| `"other"` |
| `title` | String | |
| `customerId` | Int? | FK → Customer (set null on delete) |
| `estimateId` | Int? | FK → Estimate (set null on delete) |
| `date` | DateTime | |
| `startTime` | String | `"HH:MM"` |
| `endTime` | String | `"HH:MM"` |
| `crew` | String? | |
| `notes` | String? | |
| `createdAt` | DateTime | |

---

## Components

### Layout & Navigation

**`AppNav`** — Main nav bar. Desktop: top sticky tabs with accent underline. Mobile: fixed bottom 4-column grid. Tabs: Dashboard, Customers, Estimates, Schedule. Includes theme toggle and initials avatar placeholder.

**`Providers`** — Composes `SessionProvider` (NextAuth), `PersistQueryClientProvider` (React Query + localStorage), and `ToastProvider`.

### UI Primitives

**`Button`** — Polymorphic button with variants: `default`, `primary`, `accent`, `sage`, `gold`, `ghost`. Sizes: `sm`, `md`, `lg`.

**`Card`** — Container with optional `title` and `sub` props.

**`SlidePanel`** — Modal side panel. Right-slide on desktop, bottom-sheet on mobile. Supports Esc to close, body scroll lock, backdrop blur, and mobile drag handle.

**`Toast` / `ToastProvider` / `useToast()`** — Context-based toast queue. `showToast(message, duration?)` displays a bottom-center toast that auto-dismisses after 3.2 s.

**`ThemeToggle`** — Persists `light` / `dark` to `localStorage.theme` and updates `document.documentElement.dataset.theme`.

**`SourceBadge`** — Color-coded badge for customer lead source. Exports `sourceName()` to translate source code → display text.

### Dashboard (`components/dashboard/`)

**`DashboardView`**
- **Metrics grid:** Revenue (current month, completed estimates), Outstanding (all completed), Pipeline value (quote + scheduled + in_progress), Avg margin (average markupPct).
- **Alerts:** Red banner if any completed estimate is 30+ days old (overdue). Gold banner if any quote is 14+ days old (expiring).
- **Pipeline kanban:** 4 columns (Quote, Scheduled, Active, Done) showing top 5 estimates per status with customer name and total.
- **Revenue chart:** 6-month line chart (Chart.js).
- **Today's events:** Chronological list of events for today with type color indicators.
- **Actions:** "New Customer" and "New Estimate" buttons.

**`RevenueChart`** — Chart.js line chart loaded async (avoids SSR). Gradient fill, currency Y-axis, reads `--accent` CSS variable for line color. Destroys instance on unmount.

### Customers (`components/customers/`)

**`CustomerListView`** — Filterable list. Filter by source (all, phone, online, referral, walkin, website). Desktop table (Name, Phone, Source, Added, Estimate count); mobile card layout. Row click navigates to detail.

**`CustomerDetailView`** — All customer fields editable inline. Auto-saves on blur via PATCH. Source badge (read-only). "+ New estimate" creates estimate and navigates to builder.

**`NewCustomerPanel`** — SlidePanel form. Fields: source tabs (radio-style), name (required), phone, email, address, notes. Calls `useCreateCustomer()`, closes panel and shows success toast on completion.

### Estimates (`components/estimates/`)

**`EstimateListView`** — Table/card list. Status badges color-coded (quote=gold, scheduled=sage, in_progress=accent, completed=muted). Shows calculated total sqft.

**`EstimateBuilderView`** — Layout shell with breadcrumb. Composes three independent sections, each with its own save action and toast.

**`RoomSection`** — Add/remove rooms (rect, tri, lshape) and text notes. Edit name, shape, dimensions. L-shape visual editor via `RoomCanvas` (HTML5 canvas). Shows running total sqft. Auto-saves on any change.

**`RoomCanvas`** — Interactive HTML5 canvas editor for L-shaped rooms with sections and deductions.

**`LineItemSection`** — Add/remove line items. Fields: name, rate, qty, waste %, unit label, qty mode toggle (manual vs. linked to rooms). Linked mode automatically sums sqft from selected rooms + applies waste factor. Shows per-item subtotal and materials total.

**`QuoteSummary`** — Editable tax rate, markup %, deposit %. Read-only computed display: subtotal, markup amount, tax amount, total, deposit amount, margin %. Save button patches estimate.

### Schedule (`components/schedule/`)

**`ScheduleView` (CalendarGrid)** — Week-view calendar. Desktop: 6-day grid; mobile: 3-day grid (via `useIsMobile()`). Time span 7 am–7 pm with pixel-per-minute event positioning. Click empty day area to create event. Click event box to edit. Week navigation: Previous, Today, Next.

---

## Business Logic (`lib/utils.ts`)

### Room area calculations
- `roomSqft(room)` — Rectangle: `w × l`. Triangle: `(w × l) / 2`. L-shape: sum of sections minus sum of deductions.
- `lshapeNet(data)` — L-shape specific helper.
- `estTotalArea(items)` — Sum of all room sqft across all items.

### Line item calculations
- `getEffectiveQty(li, rooms)` — Manual mode: returns `qty`. Linked mode: sums sqft of linked rooms and applies waste factor `× (1 + wastePct / 100)`.
- `liSubtotal(li, rooms)` — `effectiveQty × rate`.
- `computeEstimateTotal(est)` — Subtotal → apply markup → apply tax. Returns formatted currency string, or null if no line items.

### Dashboard metric calculations
Derived from estimate arrays at render time (no server aggregation):
- **Revenue:** Sum of completed estimates created in the current calendar month.
- **Outstanding:** Sum of all completed estimates (all time).
- **Pipeline:** Sum of quote + scheduled + in_progress estimate totals.
- **Avg margin:** Mean of `markupPct` across all estimates.
- **Overdue alert:** Oldest completed estimate where `createdAt` > 30 days ago.
- **Expiring alert:** Oldest quote where `createdAt` > 14 days ago.

---

## Data Fetching (React Query Hooks, `lib/hooks/`)

Stale time: 60 s. GC time: ∞. Persisted to localStorage (max age 24 h). Retry: 1.

| Hook | Method | Invalidates |
|---|---|---|
| `useCustomers()` | GET /api/customers | — |
| `useCustomer(id)` | GET /api/customers/:id | — |
| `useCreateCustomer()` | POST /api/customers | `["customers"]` |
| `useUpdateCustomer(id)` | PATCH /api/customers/:id | `["customers"]`, `["customers", id]` |
| `useDeleteCustomer()` | DELETE /api/customers/:id | `["customers"]` |
| `useEstimates()` | GET /api/estimates | — |
| `useEstimate(id)` | GET /api/estimates/:id | — |
| `useCreateEstimate()` | POST /api/estimates | `["estimates"]` |
| `useUpdateEstimate(id)` | PATCH /api/estimates/:id | `["estimates"]`, `["estimates", id]` |
| `useDeleteEstimate()` | DELETE /api/estimates/:id | `["estimates"]` |
| `useEvents()` | GET /api/events | — |
| `useCreateEvent()` | POST /api/events | `["events"]` |
| `useUpdateEvent(id)` | PATCH /api/events/:id | `["events"]` |
| `useDeleteEvent()` | DELETE /api/events/:id | `["events"]` |

---

## Authentication & Multi-Tenancy

**Strategy:** NextAuth v5 credentials provider + JWT session. No OAuth providers.

**Session claims:** `orgId`, `role` attached to JWT token and surfaced on `session.user`.

**Multi-tenancy:** Every API route calls `getOrgId()` (from `lib/tenant.ts`) to extract the org from the session. All database queries include an `orgId` where clause, preventing cross-org data access.

**User roles:** `owner`, `admin`, `member` — stored on User but not yet enforced at the API level beyond authentication.

---

## Server-Side Validation (Zod)

| Endpoint | Key rules |
|---|---|
| Signup | name 1–100, email valid, password 8–100 |
| Org setup | name 1–200 |
| Customer | name required 1–200, email valid or empty, source enum, notes ≤2000 |
| Estimate | customerId positive int, taxRate/depositPct 0–1, markupPct ≥0 |
| EstimateItem | type enum, shape enum, lshapeData structure |
| LineItem | qtyMode enum, linkedRoomIds int array |
| Event | type enum, title 1–200, date YYYY-MM-DD, startTime/endTime HH:MM, notes ≤2000 |

**Error responses:** 400 (validation), 401 (unauthenticated), 404 (not found in org scope), 409 (conflict, e.g. duplicate email), 500 (unhandled).

---

## Design System

**Tokens (CSS variables):** `--ink`, `--surface`, `--accent` (vermilion), `--sage`, `--gold`, `--muted`, `--line`, `--shadow-*`

**Typography:** Inter Tight (display) + JetBrains Mono (monospace), loaded via `@fontsource-variable`.

**Theme:** Light/dark via `data-theme` attribute on `<html>`. Flash-of-unstyled-theme prevented by inline script in root layout that reads `localStorage.theme` before React hydrates.

**Status badge colors:** quote=gold, scheduled=sage, in_progress=accent, completed=muted.

**Event type colors:** job=accent, visit=gold, other=sage.

---

## Other Infrastructure

**PWA:** `@ducanh2912/next-pwa` with Workbox. Service worker caches navigation. Disabled in dev. Reloads on reconnect.

**Logging:** `withLogging()` middleware wraps all API routes. Emits structured JSON to stdout: request duration, mutation type, errors, orgId context.

**Prisma singleton:** Connection pool managed via singleton pattern to prevent leaks during dev hot-reload.

**Seed script:** `prisma/seed.ts`, runnable via `npm run seed`.

**Testing:** Vitest configured (`vitest.config.ts`). No test files identified in this audit.

**Linting:** Biome (`biome ci .`).

**Environment variables required:** `DATABASE_URL`, `NEXTAUTH_SECRET`, `NODE_ENV`.
