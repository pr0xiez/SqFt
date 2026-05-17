# E2E coverage expansion

**Date:** 2026-05-17
**Status:** Approved (design)

## Goal

Bring Playwright e2e coverage onto the revenue-critical quote lifecycle that shipped over the last few weeks (send → accept/decline → revise → lockdown) and onto tenant-isolation invariants for every mutating endpoint. Today the suite covers auth, the estimate builder, the quote builder's room-link picker, and the public token-rendered view — but nothing for the new lifecycle features in commits `e08af92`..`5a1103c` and the sibling-decline / lockdown / read-only / revision-chain work.

We want the gap closed without ballooning the suite into low-value UI assertion churn, so coverage is tiered by risk.

## Non-goals

- Visual regression / screenshot diffing
- PDF rendering correctness
- Auth-provider integration beyond what `auth.spec.ts` covers
- Performance, load, or mobile-viewport runs
- Replacing existing vitest unit/integration coverage in `tests/api/**`

## Current state

Existing e2e specs (in `tests/e2e/`):

- `auth.spec.ts` — login happy/sad, guard redirects, API 401
- `estimate-builder.spec.ts` — PATCH wire contract + rooms/title UI + cross-org 404
- `quote-builder.spec.ts` — room-link picker only
- `public-quote.spec.ts` — token render, regen, invalid tokens, unauth POST

Helpers (`loginAs`, `createCustomerAndEstimate`, `seedEstimateWithRooms`, `seedQuoteWithLineItem`, `reloadFresh`) are duplicated across files. The auth fixture in `fixtures/auth.ts` provides a worker-scoped storageState pattern that the new specs should adopt where they don't need a fresh login.

## Tiered scope

### P0 — Quote lifecycle (revenue-critical, all new)

These cover features added in the recent batch and have no e2e coverage today.

**1. `tests/e2e/quote-send.spec.ts`** — POST `/api/quotes/[id]/send`
- 200 happy path: Resend is mocked (intercept HTTP at the network boundary, or stub via a test-only env flag — pick whichever the route's transport allows cleanly); assert `sentAt` is set on the quote and a `QuoteEvent` row is written with `source: "user"`.
- 401 unauth.
- 404 cross-org.
- Lockdown: sending an already-accepted or already-declined quote returns 4xx (no email goes out).

**2. `tests/e2e/quote-accept-decline.spec.ts`** — public `/q/[token]` accept and decline
- Accept flow: load `/q/[token]`, click Accept, assert UI transitions to accepted state, assert `acceptedAt` set + `QuoteEvent` with `source: "customer"` (or whatever the route writes) + status transition.
- Decline flow: same as above plus assert the "builder contact" block appears on the declined page (the feature in commit `ed47e23`).
- Bad-token 404 on accept and decline endpoints.
- Idempotency: a second accept on an already-accepted quote does not double-write events or revert state.

**3. `tests/e2e/quote-revise.spec.ts`** — POST `/api/quotes/[id]/revise`
- Revise an accepted (or declined) quote: 201, response points to a new draft quote, line items + scope cloned, revision chain links back.
- UI: Revise button is **only** present on locked quotes (not drafts/sent); revision badge appears in the quote list for revised quotes; revision-chain links render on the new quote's builder page.
- Cross-org 404, unauth 401.

**4. `tests/e2e/quote-sibling-decline.spec.ts`** — accept-cascades-decline
- Setup: two open quotes on the same estimate.
- Accept one → the sibling auto-declines; sibling's `QuoteEvent` has `source: "system"`.
- A quote on a *different* estimate is untouched.

**5. `tests/e2e/quote-lockdown.spec.ts`** — read-only mode on terminal quotes
- PATCH `/api/quotes/[id]` returns 4xx on accepted or declined quotes (the `saveQuote` guard).
- Builder UI on an accepted quote shows the accepted banner, hides edit controls, and line-item inputs are disabled / not rendered.
- Same for declined.

### P1 — Supporting CRUD & tenant isolation

**6. `tests/e2e/customers.spec.ts`**
- List page renders and shows seeded customers.
- Create via UI; edit and delete via API; assert UI reflects.
- Open button on a list row navigates to the customer detail page (regression for `0543641`).
- Cross-org 404 on GET/PATCH/DELETE; unauth 401.

**7. `tests/e2e/crew.spec.ts`**
- Crew member CRUD smoke (POST/PATCH/DELETE `/api/crew-members`).
- Cross-org 404, unauth 401.

**8. `tests/e2e/org-settings.spec.ts`**
- PATCH `/api/org` persists name + contact fields.
- Unauth 401.
- Cross-org: another user's PATCH cannot affect this org (verify by GET as the other user shows their own org unchanged).

**9. `tests/e2e/quotes-list.spec.ts`**
- List page renders all quotes for the org.
- Revision badge appears on quotes that have been revised (regression for `5a1103c`).
- Cross-org isolation: another org's quotes don't appear.

### P2 — Polish & gaps

**10. `tests/e2e/schedule.spec.ts`** — events CRUD smoke (POST/PATCH/DELETE `/api/events`), cross-org 404, unauth 401.

**11. `tests/e2e/estimates-list.spec.ts`** — list page smoke + cross-org isolation.

## Shared infrastructure

### New file: `tests/e2e/fixtures/seed.ts`

Extract the helpers duplicated across specs today. Exports:

- `loginAs(ctx, email, password)` and `loginAsDemo(ctx)` / `loginAsOtherDemo(ctx)`
- `reloadFresh(page)` — the localStorage-clear + reload pattern
- `createCustomer(request, { name?, source? })` → `{ id }`
- `createEstimate(request, { customerId, items? })` → `{ id }`
- `seedEstimateWithRooms(request)` → `{ estimateId, kitchenId, diningId }` (current shape)
- `seedQuoteWithLineItem(request, estimateId)` → `{ quoteId, lineItemId }` (current shape)
- `seedAcceptedQuote(request, estimateId)` → `{ quoteId, approvalToken }` — drives the accept endpoint internally so lockdown/revise tests don't reimplement the flow
- `seedDeclinedQuote(...)` — same, decline variant
- `seedQuoteWithApprovalToken(request, estimateId)` → `{ quoteId, approvalToken }`

The existing inline copies in `quote-builder.spec.ts`, `estimate-builder.spec.ts`, and `public-quote.spec.ts` get replaced by imports — that's part of P0 work, not a separate refactor.

### Resend mocking

Pick the cleanest of:

- HTTP intercept via `page.route('**/api.resend.com/**', ...)` for UI-driven sends.
- For API-driven sends (POST /api/quotes/[id]/send) use a test-only env flag (e.g. `RESEND_DRY_RUN=1`) that the route already honors, or add it as part of this work if not present.

Decision deferred to the plan: inspect `app/api/quotes/[id]/send/route.ts` and `lib/email/*` first; if a dry-run flag already exists, use it; otherwise add one (single env var checked at the call site).

### Test-only seed shortcut for terminal states

Reaching "accepted" state requires: estimate → quote → approval token → public accept. P0 spec #5 (lockdown) and #3 (revise) both need terminal-state quotes as a precondition, not as the thing under test. Pay the cost once in `seedAcceptedQuote` rather than per-test.

## Conventions

- Keep numbered test naming (`5.1.1`, `5.1.2`, …) so the suite reads as a spec catalog.
- API seed + UI assertion split (already used in `estimate-builder.spec.ts`) is the default.
- Use `reloadFresh` for any reload-after-mutation assertion.
- Use the worker-scoped `authedPage` fixture in `fixtures/auth.ts` for read-only specs that don't need a fresh context; use a fresh `browser.newContext()` for specs that need their own seeded data lifecycle.
- One `test.describe.serial` block per spec when tests share seeded state; independent tests stay parallel.
- Cross-org assertions use `DEMO_OTHER_EMAIL` / `DEMO_OTHER_PASSWORD` from the auth fixture.

## Delivery

Each numbered spec ships as its own PR so the suite grows incrementally and reviews stay small:

- PR 1: `fixtures/seed.ts` extraction + replace inline copies (no behavior change).
- PR 2–6: P0 specs (one PR each, in order #1 → #5).
- PR 7–10: P1 specs.
- PR 11–12: P2 specs.

Before each PR: `biome ci .` clean, full `npm run test:e2e` green locally, no `.only` / `.skip`.

## Risks

- **Email mocking choice** — if the send route hits Resend before a feature flag check, we'll need to add the flag as part of PR 3. Confirm during planning.
- **Lockdown UI shape** — the read-only banner and disabled-input assertions need to target actual DOM. Confirm selectors against the current builder when writing the spec.
- **Approval-token accept endpoint shape** — `seedAcceptedQuote` needs to call the right endpoint with the right body. Confirm against `app/api/q/[token]/accept/route.ts` during planning.
