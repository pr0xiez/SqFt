# SqFt — E2E Test Plan

Comprehensive end-to-end test coverage for all current functionality.

---

## Tool: Playwright

Playwright is the right fit: first-class Next.js support, built-in browser isolation, network interception, and a test fixture model that handles auth state cleanly. It integrates well with the existing Vitest unit test setup since they run independently.

**Install:**
```bash
npm install -D @playwright/test
npx playwright install
```

**Config file:** `playwright.config.ts` at project root.

---

## Setup Strategy

### Test database
Run against a dedicated test database (separate `DATABASE_URL_TEST` env var). The `prisma/seed.ts` script (or a leaner e2e-specific seed) populates known fixtures before the suite runs. Each test file that mutates data should clean up after itself or use isolated org accounts.

### Authentication fixture
Create a shared Playwright fixture (`tests/e2e/fixtures/auth.ts`) that:
1. Logs in as the seeded demo user once per worker
2. Stores the session cookie in `storageState`
3. Reuses it across tests in the same file to avoid re-logging-in

For tests that explicitly test the login form, bypass this fixture and start from a fresh page.

### Seed fixtures
Define a small set of known seed records used across tests:
- **1 org** with company name "Test Co"
- **3 customers**: one for each source group (phone, referral, website) with at least one having estimates
- **2 estimates**: one `quote`, one `completed`; estimate #1 has 2 rooms and 2 line items
- **3 events**: one `job` (linked to estimate #1), one `visit`, one `other`

---

## Test Suites

---

### 1. Authentication

**File:** `tests/e2e/auth.spec.ts`

#### 1.1 Login
| # | Test | Steps | Assert |
|---|---|---|---|
| 1.1.1 | Happy path | Enter valid credentials; submit | Redirects to `/` |
| 1.1.2 | Wrong password | Enter correct email, wrong password | Error banner visible; stays on `/login` |
| 1.1.3 | Non-existent email | Enter unknown email | Error banner visible |
| 1.1.4 | Password toggle | Click show/hide icon | Input type toggles between `password` and `text` |

#### 1.2 Auth guards
| # | Test | Steps | Assert |
|---|---|---|---|
| 1.2.1 | Unauthenticated access | Navigate to `/customers` without session | Redirects to `/login` |
| 1.2.2 | Direct API access | Call `GET /api/customers` without session cookie | Returns 401 |

---

### 2. Navigation & Layout

**File:** `tests/e2e/navigation.spec.ts`

| # | Test | Steps | Assert |
|---|---|---|---|
| 2.1 | Desktop nav tabs | At viewport ≥1024px; click each tab (Dashboard, Customers, Estimates, Schedule) | Route changes to `/`, `/customers`, `/estimates`, `/schedule` |
| 2.2 | Active tab highlight | Navigate to `/estimates` | Estimates tab has active/accent underline styling |
| 2.3 | Mobile bottom nav | At viewport 375px; tap each bottom-nav icon | Route changes correctly |
| 2.4 | Theme toggle — light to dark | Click ThemeToggle | `data-theme="dark"` set on `<html>` |
| 2.5 | Theme toggle — persists | Toggle dark; reload page | Still dark on reload (localStorage preserved) |
| 2.6 | Theme toggle — dark to light | Toggle back | `data-theme="light"` |

---

### 3. Dashboard

**File:** `tests/e2e/dashboard.spec.ts`

Seed: 1 completed estimate this month, 1 old quote (>14 days), 1 completed estimate >30 days old, today's events.

| # | Test | Steps | Assert |
|---|---|---|---|
| 3.1 | KPI — Revenue this month | Load dashboard | Revenue card shows sum of this month's completed estimates |
| 3.2 | KPI — Outstanding | Load dashboard | Outstanding card shows sum of all completed estimates |
| 3.3 | KPI — Pipeline | Load dashboard | Pipeline card shows sum of quote + scheduled + in_progress totals |
| 3.4 | KPI — Avg margin | Load dashboard | Avg margin card shows correct percentage |
| 3.5 | Expiring quotes alert | Seed quote >14 days old | Gold alert banner visible |
| 3.6 | Overdue invoice alert | Seed completed estimate >30 days old | Red alert banner visible |
| 3.7 | Job pipeline — columns | Load dashboard | Four columns: Quote, Scheduled, Active, Done are present |
| 3.8 | Job pipeline — cards | Seed estimates of various statuses | Cards appear in correct column with customer name and total |
| 3.9 | Revenue chart renders | Load dashboard | Canvas element is visible; no JS errors |
| 3.10 | Today's schedule | Seed event for today | Event title appears in "Today's Schedule" section |
| 3.11 | No events today | No events seeded for today | "No events today" (or equivalent empty state) shown |
| 3.12 | "New Customer" action | Click "New Customer" on dashboard | NewCustomerPanel slides open |
| 3.13 | "New Estimate" action | Click "New Estimate" on dashboard | Navigates to `/customers` (to pick a customer) or opens customer picker |

---

### 4. Customers

**File:** `tests/e2e/customers.spec.ts`

#### 4.1 Customer list
| # | Test | Steps | Assert |
|---|---|---|---|
| 4.1.1 | All customers visible | Load `/customers` | All seeded customers appear in the list |
| 4.1.2 | Filter by source — phone | Click "Phone" filter | Only phone-source customers shown |
| 4.1.3 | Filter by source — referral | Click "Referral" filter | Only referral-source customers shown |
| 4.1.4 | Filter — All resets | Click a source filter then "All" | All customers visible again |
| 4.1.5 | Empty state | Filter to source with no customers | Empty state message visible |
| 4.1.6 | Row navigation | Click a customer row | Navigates to `/customers/[id]` |

#### 4.2 Create customer
| # | Test | Steps | Assert |
|---|---|---|---|
| 4.2.1 | Open panel | Click "+ New Customer" | SlidePanel opens with form |
| 4.2.2 | Close with Esc | Open panel; press Escape | Panel closes |
| 4.2.3 | Happy path | Fill name "Jane Doe", select source "Online", add phone; submit | Toast "Customer created"; panel closes; Jane appears in list |
| 4.2.4 | Required name | Submit without name | Validation error; no toast |
| 4.2.5 | Invalid email | Enter "bad-email" in email field; submit | Validation error shown |
| 4.2.6 | All source options | Cycle through all 5 source tabs | Each tab is selectable and reflected in submission |

#### 4.3 Customer detail — editing
| # | Test | Steps | Assert |
|---|---|---|---|
| 4.3.1 | Load detail | Navigate to `/customers/[id]` | Customer name, phone, email, address, source, notes displayed |
| 4.3.2 | Inline edit name | Click name field; change text; blur | Auto-save fires; reload page shows updated name |
| 4.3.3 | Inline edit phone | Edit phone field; blur | Auto-save fires; value persists on reload |
| 4.3.4 | Inline edit notes | Edit notes; blur | Persists on reload |
| 4.3.5 | Estimates list | Customer with estimates | Each estimate shown with status badge and link |
| 4.3.6 | "+ New estimate" | Click on customer detail | Creates estimate; navigates to `/estimates/[id]` |
| 4.3.7 | Back button | Click back | Returns to `/customers` list |

---

### 5. Estimates

**File:** `tests/e2e/estimates.spec.ts`

#### 5.1 Estimate list
| # | Test | Steps | Assert |
|---|---|---|---|
| 5.1.1 | All estimates visible | Load `/estimates` | All seeded estimates shown |
| 5.1.2 | Status badges | Seeded estimates have varying statuses | Correct color-coded badges (quote=gold, scheduled=sage, in_progress=accent, completed=muted) |
| 5.1.3 | Row navigation | Click estimate row | Navigates to `/estimates/[id]` |

#### 5.2 Estimate builder — rooms
| # | Test | Steps | Assert |
|---|---|---|---|
| 5.2.1 | Load builder | Navigate to `/estimates/[id]` | Room section, line item section, quote summary all visible |
| 5.2.2 | Add rectangle room | Click "+ Add Room"; enter name "Living Room", shape rect, W=12, L=15 | Room appears in list; area shows 180 ft² |
| 5.2.3 | Running total | Add second room W=10, L=10 | Total sqft shows 280 ft² |
| 5.2.4 | Edit room name | Click room name; change it; blur | Updated name persists on reload |
| 5.2.5 | Edit dimensions | Change W on existing room; blur | Area recalculates; running total updates |
| 5.2.6 | Add L-shape room | Select lshape; enter sections/deductions | Area reflects sections minus deductions |
| 5.2.7 | Add note | Click "+ Add Note"; type text | Note item appears in list |
| 5.2.8 | Remove room | Click delete/remove on a room | Room removed from list; running total decreases |

#### 5.3 Estimate builder — line items
| # | Test | Steps | Assert |
|---|---|---|---|
| 5.3.1 | Add line item (manual) | Click "+ Add Line Item"; name "Labor", qty=100, rate=3.50 | Subtotal shows $350 |
| 5.3.2 | Change qty | Edit qty field to 200; blur | Subtotal updates to $700 |
| 5.3.3 | Change rate | Edit rate; blur | Subtotal recalculates |
| 5.3.4 | Linked qty mode | Toggle line item to "Linked"; select a room | Qty automatically pulls from room sqft |
| 5.3.5 | Waste factor | With linked mode; set waste to +10% | Effective qty = room sqft × 1.10 |
| 5.3.6 | Linked — multiple rooms | Link to 2 rooms | Qty = sum of both room areas × (1 + wastePct) |
| 5.3.7 | Materials total | 2 line items | Total shown at bottom of section = sum of both subtotals |
| 5.3.8 | Remove line item | Delete a line item | Removed from list; total decreases |

#### 5.4 Quote summary
| # | Test | Steps | Assert |
|---|---|---|---|
| 5.4.1 | Default values | Open fresh estimate | Tax rate 8%, deposit 50%, markup 0% shown |
| 5.4.2 | Edit tax rate | Change to 10%; save | Reload shows 10% |
| 5.4.3 | Edit markup | Change to 20%; save | Markup amount displayed; total increases |
| 5.4.4 | Edit deposit | Change to 25%; save | Deposit amount recalculates |
| 5.4.5 | Calculation — subtotal | With line items | Subtotal = sum of line item subtotals |
| 5.4.6 | Calculation — markup amount | 20% markup | Markup amount = subtotal × 0.20 |
| 5.4.7 | Calculation — tax | 8% tax | Tax = (subtotal + markup) × 0.08 |
| 5.4.8 | Calculation — total | All fields set | Total = subtotal + markup + tax |
| 5.4.9 | Calculation — deposit | 50% deposit | Deposit = total × 0.50 |
| 5.4.10 | Margin display | With markup | Margin % shown correctly |

---

### 6. Schedule

**File:** `tests/e2e/schedule.spec.ts`

#### 6.1 Calendar rendering
| # | Test | Steps | Assert |
|---|---|---|---|
| 6.1.1 | Week view loads | Navigate to `/schedule` | 7 days visible on desktop (Mon–Sun) |
| 6.1.2 | Mobile view | At 375px viewport | 3 days visible |
| 6.1.3 | Time slots | Load calendar | Time labels 7 AM–7 PM shown in left gutter |
| 6.1.4 | Week navigation — next | Click "Next" | Calendar advances by 7 days |
| 6.1.5 | Week navigation — prev | Click "Previous" | Calendar moves back 7 days |
| 6.1.6 | Today button | Navigate away then click "Today" | Returns to current week; today's column highlighted |
| 6.1.7 | Seeded events appear | Seed events for current week | Event blocks visible in correct day/time slots |
| 6.1.8 | Event color coding | Job/visit/other events present | Job=accent, visit=gold, other=sage colors applied |

#### 6.2 Create event
| # | Test | Steps | Assert |
|---|---|---|---|
| 6.2.1 | Open form by click | Click empty area in a day column | EventFormPanel slides open with that date pre-filled |
| 6.2.2 | Create "other" event | Type title, set start 10:00/end 11:00, type=other; submit | Event block appears in calendar at correct position |
| 6.2.3 | Create "visit" event | Set type=visit; fill fields; submit | Event created; appears on calendar |
| 6.2.4 | Create "job" event | Set type=job; must select estimate | Estimate dropdown required; selecting estimate enables submit; event created |
| 6.2.5 | Job event without estimate | Set type=job; submit without estimate | Validation error; form not submitted |
| 6.2.6 | Required title | Leave title blank; submit | Validation error |
| 6.2.7 | Crew assignment | Select crew member from dropdown | Saved and displayed in event detail |
| 6.2.8 | Notes | Add event notes; submit | Notes accessible when editing event |
| 6.2.9 | Close panel — Esc | Open panel; press Escape | Panel closes; no event created |

#### 6.3 Edit event
| # | Test | Steps | Assert |
|---|---|---|---|
| 6.3.1 | Open event to edit | Click existing event block | EventFormPanel opens pre-populated with event data |
| 6.3.2 | Change title | Edit title; submit | Event block shows new title |
| 6.3.3 | Change time | Edit start/end time; submit | Event block repositions in calendar |
| 6.3.4 | Change type | Change from visit to other; submit | Event color updates |

#### 6.4 Delete event
| # | Test | Steps | Assert |
|---|---|---|---|
| 6.4.1 | Delete from edit panel | Open event; click delete/remove | Confirmation (if any); event removed from calendar |

---

### 7. Cross-Feature Flows

**File:** `tests/e2e/flows.spec.ts`

Full user journeys that span multiple sections.

| # | Flow | Steps | Assert |
|---|---|---|---|
| 7.1 | New customer → estimate → schedule | Create customer; create estimate from detail; add rooms and line items; schedule a job event linked to that estimate | Estimate total shown; job event visible on calendar for correct date |
| 7.2 | Dashboard pipeline reflects new estimates | Create estimate with status "quote" | Appears in Dashboard "Quote" kanban column with correct total |
| 7.3 | Customer delete cascades | Delete customer with estimates | Customer gone; estimates gone from `/estimates` list |
| 7.4 | Estimate delete removes from list | Delete estimate | Removed from `/estimates`; no longer on customer detail |
| 7.5 | Dashboard revenue reflects completed estimate | Set estimate status to "completed" (or seed one) this month | Revenue KPI increments correctly |
| 7.6 | Today's schedule accuracy | Create event for today | Appears in Dashboard "Today's Schedule" after navigating to dashboard |

---

### 8. Validation & Error States

**File:** `tests/e2e/errors.spec.ts`

| # | Test | Assert |
|---|---|---|
| 8.1 | Toast appears on success | Create customer | Toast "Customer created" appears; auto-dismisses |
| 8.2 | Toast appears on error | Mock/force API error; trigger mutation | Error toast appears |
| 8.3 | SlidePanel scroll lock | Open panel with long form | Body scroll is locked while panel is open |
| 8.4 | Empty estimates list | New account with no estimates | Empty state UI visible (not an error/blank page) |
| 8.5 | Empty customers list | New account with no customers | Empty state UI visible |
| 8.6 | 404 customer | Navigate to `/customers/9999999` | 404 or redirect handled gracefully |
| 8.7 | 404 estimate | Navigate to `/estimates/9999999` | 404 or redirect handled gracefully |

---

## Running Tests

```bash
# Run all e2e tests
npx playwright test

# Run a single spec file
npx playwright test tests/e2e/customers.spec.ts

# Run with UI (headed, interactive)
npx playwright test --ui

# Run against dev server (auto-started)
npx playwright test --headed
```

**Playwright config should:**
- Set `baseURL` to `http://localhost:3000`
- Use `webServer` to start `next dev` before tests run
- Point `storageState` to a fixture file generated by the auth setup
- Set a reasonable `timeout` (e.g., 10 s per action) given Next.js cold starts

---

## Priority Order

Implement in this order to get coverage of the highest-risk paths first:

1. **Auth** — the gate to everything
2. **Cross-feature flows** (7.x) — smoke test of the full stack
3. **Customers** — most mature CRUD
4. **Estimates** — most complex UI and calculation logic
5. **Schedule** — event layout and date math edge cases
6. **Dashboard** — mostly read-only; correctness depends on above
7. **Error states** — polish layer

---

## Notes

- Calculations (rooms, line items, quote summary) are the highest-value tests — a regression here directly affects billing accuracy for users. Prioritize 5.2–5.4.
- The L-shape canvas (RoomCanvas) is interaction-heavy; test the basic add/save flow but don't over-index on pixel-perfect canvas testing.
- React Query's localStorage persistence means stale cached data can bleed between tests. Clear `localStorage` in `beforeEach` or use isolated browser contexts per test file.
- The seed script produces deterministic IDs only if using a clean DB; prefer UUID/CUID-agnostic selectors (text content, roles) over hard-coded IDs in selectors.
