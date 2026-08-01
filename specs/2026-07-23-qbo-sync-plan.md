# QuickBooks Online Sync — Implementation Plan

**Date:** 2026-07-23 · **Revised:** 2026-07-24 (full test architecture, §10)
· **Status:** proposed (no code yet)
**Serves:** Ship priority **P1** in `2026-07-23-competitive-market-research.md` —
"QuickBooks Online sync, included & reliable." The market evidence: QBO
integration is the #1 demanded integration in flooring communities and the
#1-broken feature at every competitor (Jobber sync breakage, Joist's +$9.99/mo
gate, FloorZap's "not smooth"). The differentiator is **reliability + included
in base price**, not feature breadth.

---

## 1. Product scope

**v1 is a one-way push: SqFt → QBO.** SqFt stays the source of truth; QBO is
the bookkeeping mirror. Nothing in SqFt ever blocks on QBO being reachable —
sync is asynchronous, with per-record status the user can see and retry.

What syncs:

| SqFt record | QBO entity | When |
|---|---|---|
| Customer | `Customer` | On demand, as a dependency of the first invoice that needs it; sparse-updated when the SqFt customer is edited and a link exists |
| Invoice (sent) | `Invoice` | When the invoice is **sent** (snapshot frozen) — never drafts |
| Invoice void | `Invoice` void operation | When voided in SqFt |
| Payment (manual + Stripe) | `Payment` linked to the invoice | When recorded in the ledger |
| Sales tax | `TxnTaxDetail` on the invoice | With the invoice (see §3) |

**Non-goals for v1** (each is a deliberate cut, revisit after launch):
two-way sync / QBO-edit import; estimates as QBO Estimates; expense/fee
booking (Stripe processing fees stay un-mirrored); QuickBooks Desktop;
per-line-item product mapping (v1 uses one service item, §6); historical
backfill beyond a manual per-invoice "Sync now"; Intuit webhooks/CDC (only
needed for two-way).

## 2. Hard prerequisite: sales tax (P0)

The schema has **no tax handling at all** — no rate, no tax amount, nothing on
`Organization`, `Estimate`, `Invoice`, or the snapshots. A US QBO invoice
without tax representation produces wrong books, and retrofitting tax after
QBO links exist means re-syncing every document.

**Sequence tax first** (it's P0 anyway). This plan only pins the contract QBO
needs from that work — the invoice **snapshot** (and `computeEstimateView` /
`prorateInvoice` upstream of it) must carry:

```
{ taxRate: number,            // e.g. 0.07
  taxableSubtotal: number,    // dollars the rate applied to
  taxAmount: number }         // dollars, exactly what the customer was billed
```

Whether tax is org-level default + per-estimate override, and which lines are
taxable, is the tax project's call — QBO sync only needs those three numbers
frozen in the snapshot.

## 3. External constraints (verified 2026-07-23)

- **OAuth 2.0**, scope `com.intuit.quickbooks.accounting`. Access tokens live
  **1 hour**; refresh tokens **rotate every ~24h** — the old one dies when a
  new one is issued, so the latest pair must be persisted atomically on every
  refresh, and concurrent refreshes can brick the connection (§8).
  ([Intuit token expiration](https://help.developer.intuit.com/s/article/Handling-OAuth-token-expiration),
  [refresh validity policy](https://help.developer.intuit.com/s/article/Validity-of-Refresh-Token))
- **API versioning:** minorversions 1–74 were retired Aug 2025; pin
  `minorversion=75` explicitly on every call.
  ([Intuit announcement](https://medium.com/intuitdev/changes-to-our-accounting-api-that-may-impact-your-application-c330bd1a06f5))
- **Rate limits:** 500 req/min **per realm** (per connected company), max 10
  concurrent — generous for our volume, but the sweeper still processes each
  org serially (§8). ([limits guide](https://satvasolutions.com/blog/quickbooks-online-api-limitations-guide))
- **Production keys require Intuit's app assessment** (security/legal/platform
  questionnaire + review) even for apps not listed in the QBO app store —
  budget lead time in M4; sandbox keys are instant.
  ([production-keys process](https://blogs.intuit.com/2022/02/14/updated-process-to-get-production-keys/))
- **Branding:** Intuit requires their official "Connect to QuickBooks" button
  asset on the connect surface, and apps must handle user-initiated disconnect
  (revoke on our side; tolerate `invalid_grant` when they disconnect from
  Intuit's side).
- **Optimistic concurrency:** QBO updates require the entity's current
  `SyncToken`; a stale token errors — re-read and retry (§8).
- **SDK choice:** no heavyweight SDK. `node-quickbooks` is stale and
  callback-based; the official `intuit-oauth` covers only OAuth. Use a small
  typed fetch client of our own (`lib/qbo/client.ts`) — the surface we need is
  ~6 entities. Fewer dependencies is itself a reliability feature here.

## 4. Architecture

Mirror the Stripe Connect layout — `lib/qbo/` owns everything, routes are thin:

```
lib/qbo/
  client.ts     qboFetch(conn, method, path, body) — base URLs (sandbox/prod),
                minorversion=75 pin, auth header, 401→refresh-once-and-retry,
                Fault-envelope → typed QboApiError
  connect.ts    OAuth: authorize-URL builder (state = signed orgId nonce),
                code exchange, token refresh (single-flight, §8), revoke,
                connection status mapping
  crypto.ts     AES-256-GCM encrypt/decrypt for tokens at rest
                (key from QBO_TOKEN_ENC_KEY env)
  mapping.ts    pure builders: snapshot → QBO Invoice body, Payment row →
                QBO Payment body, Customer row → QBO Customer body
  sync.ts       the engine: ensureCustomerSynced / ensureInvoiceSynced /
                ensurePaymentSynced / ensureInvoiceVoided (idempotent
                "ensure" ops, §7) + task runner with backoff
```

Testability is a structural requirement, not an afterthought: `sync.ts` and
`connect.ts` take their I/O as injected ports (a `QboPort` for the API, a
`SyncStore` for links/tasks/tokens) exactly like `handleStripeEvent(event,
deps)` — the engine never imports Prisma or fetch directly. §10 builds the
whole fast-test pyramid on that seam. A test-only mock realm
(`app/api/qbo-mock/`, mounted only when `QBO_ENVIRONMENT=mock`) stands in
for Intuit in Playwright runs against the Vercel preview.

Routes (all under `apiRoute`, admin-gated except where noted):

```
POST /api/qbo/connect            → { url }  (authorize URL; admin)
GET  /api/qbo/callback           OAuth redirect target (admin session present —
                                 the connecting admin's browser carries the
                                 session cookie, so NOT in publicRoutes)
POST /api/qbo/disconnect         revoke + mark disconnected (admin)
GET  /api/qbo/status             connection + sync-health summary (admin)
POST /api/qbo/sync/run           cron sweeper — CRON_SECRET bearer auth,
                                 allowlisted in lib/publicRoutes.ts
POST /api/invoices/[id]/qbo-sync manual "Sync now" retry (lead+)
```

UI: new **`/settings/integrations`** page (admin-gated inline, like
`/settings/payments`) hosting the QuickBooks card — Intuit connect button,
connected-company name, sync-health counts (synced / pending / failed), and a
reconnect banner when auth dies. Per-invoice sync status renders on
`InvoiceDetail` as a small badge (`Synced to QuickBooks ✓` / `Sync pending` /
`Sync failed — Retry`), wired through `lib/hooks/useQbo.ts`.

## 5. Data model (Prisma)

Three new models + one field. All org-scoped; **no NOT NULL on populated
tables** (all-new tables, so the Neon gotcha doesn't bite).

```prisma
/// One connected QBO company per org.
model QboConnection {
  id                    String   @id @default(cuid())
  orgId                 String   @unique
  org                   Organization @relation(...)
  realmId               String   @unique      // QBO company id
  accessTokenEnc        String                // AES-256-GCM, lib/qbo/crypto.ts
  refreshTokenEnc       String
  accessTokenExpiresAt  DateTime
  refreshTokenExpiresAt DateTime
  status                String   @default("active") // active | disconnected
  companyName           String?               // display only
  qboItemId             String?               // the one service item (§6)
  qboItemName           String   @default("Flooring services")
  connectedAt           DateTime @default(now())
  lastSyncedAt          DateTime?
}

/// SqFt record ↔ QBO entity link. One row per synced record.
model QboLink {
  id         Int      @id @default(autoincrement())
  orgId      String
  entityType String   // customer | invoice | payment
  entityId   Int      // SqFt id
  qboId      String   // QBO entity id
  syncToken  String   // QBO optimistic-concurrency token, updated on write
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([orgId, entityType, entityId])
  @@index([orgId])
}

/// Durable outbox: one row per pending sync intent (§7).
model QboSyncTask {
  id            Int      @id @default(autoincrement())
  orgId         String
  kind          String   // sync_customer | sync_invoice | sync_payment | void_invoice
  entityId      Int
  status        String   @default("pending") // pending | done | failed | paused_auth
  attempts      Int      @default(0)
  nextAttemptAt DateTime @default(now())
  lastError     String?  // human-readable, shown in sync health
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([orgId, kind, entityId]) // enqueue is upsert — no duplicate work
  @@index([status, nextAttemptAt])
}
```

Tasks reference live rows by id, not payload copies — the task says *what* to
ensure, the ensure-op reads current state when it runs (§7). `QboLink` rows
persist across disconnect/reconnect to the **same** realm; connecting a
**different** realm deletes the org's links (stale ids from another company's
books must not be written to).

## 6. Entity mapping

Owned by pure builders in `lib/qbo/mapping.ts` (unit-testable, no I/O).

**Customer → QBO Customer.** `DisplayName` = SqFt customer name; QBO requires
uniqueness across customers/vendors/employees. Strategy: query QBO for an
exact `DisplayName` match first and **adopt** it (link, don't create) — most
target orgs already have their customers in QBO, and duplicating their
customer list is the fastest way to lose trust. No match → create. Duplicate
error on create (name collides with a vendor/employee) → retry once with
`"{name} (SqFt)"` suffix. Also maps email/phone and the primary location as
the billing address.

**Invoice → QBO Invoice.** Built **from the frozen snapshot** — the same
document the customer saw, never recomputed (the snapshot invariant from
CONTEXT.md extends to the books). Lines = the snapshot's prorated,
markup-folded lines: each becomes a `SalesItemLineDetail` on the org's single
service item (`qboItemId`, auto-created at connect time as a Service item
named "Flooring services" under the default income account), with the line's
name+description as the description and the folded dollar amount as the
amount. No markup row, no unresolved lines — the snapshot already guarantees
both. `DocNumber` = SqFt `invoiceNumber` (matches the customer-facing doc;
QBO tolerates duplicates unless the company enables duplicate-checking — on
that rejection, fall back to `SQFT-{n}` and record it in `lastError` as a
warning). `TxnDate` = invoice date, `DueDate` = dueDate, customer ref from
the customer's `QboLink`.

**Tax.** Send `TxnTaxDetail` with SqFt's computed `taxAmount` as an
**override** so the books equal what the customer was actually billed —
letting QBO's Automated Sales Tax recompute risks a ±cents divergence between
books and the customer document, which is exactly the "duplicated/wrong
entries" failure users flee Jobber over. Risk: AST override behavior has API
quirks; M2 includes a sandbox spike to validate override round-trips, with
fallback = attach tax as `TaxLineDetail` against a named agency rate.

**Payment → QBO Payment.** `TotalAmt` = payment amount, `LinkedTxn` to the
invoice's QBO id, `TxnDate` = paidAt, deposited to **Undeposited Funds**
(QBO default; a mapped deposit account is an M4 option). Stripe payments post
**gross** — fee booking is a non-goal (§1), documented in the settings UI so
bookkeepers know to record the Stripe fee from their statement.

**Void.** SqFt void → QBO invoice void operation (keeps the audit trail in
both systems). A payment on a voided-then-anomalous invoice (the `orphaned` /
`overpaid` Stripe cases) is **not** pushed — it's already flagged
`refundNeeded` in SqFt and should be resolved there first.

## 7. Sync semantics — the reliability invariants

Numbered like the Stripe invariants in CONTEXT.md; these are the contract
tests are written against.

1. **Ensure-ops, not raw API calls.** Every task is an idempotent
   "ensure synced": `ensureInvoiceSynced` first ensures the customer link
   (creating it if absent), then the invoice. `ensurePaymentSynced` ensures
   the invoice first. This makes task ordering irrelevant — any task can run
   any time and converges — which eliminates the dependency-ordering bugs
   that plague competitor syncs.
2. **Create-once via QboLink + query-before-create.** A create only fires
   when no `QboLink` exists. On an ambiguous failure (timeout after a create
   POST), the retry **queries QBO first** (invoice by DocNumber+customer,
   payment by LinkedTxn+amount+date, customer by DisplayName) and adopts the
   found entity instead of re-creating. Duplicated entries are the #1
   competitor sync complaint; this is the guard.
3. **Enqueue in the same transaction as the domain write.** The
   `QboSyncTask` upsert happens inside the repo transaction that sends the
   invoice / records the payment / voids — a synced org can never have a
   domain write that silently produced no sync intent. Enqueue when
   connection status is `active`; orgs without a connection enqueue nothing.
4. **Sync never blocks or fails the user's action.** The task is attempted
   opportunistically via `after()` (the hook `apiRoute` already imports)
   post-response; failure just leaves the task `pending` for the sweeper. No
   user-facing mutation ever returns a QBO error.
5. **The sweeper is the guarantee, `after()` is the latency optimization.**
   A Vercel cron (`vercel.json` → `POST /api/qbo/sync/run`, every 5 min on
   the current plan; the route is idempotent so frequency is safety-neutral)
   claims due tasks (`status=pending, nextAttemptAt<=now`), processes
   **serially per org** (rate-limit + refresh-safety), exponential backoff
   `2^attempts` minutes capped at 6h. After 10 attempts a task goes `failed`
   and surfaces in sync health with `lastError`; "Retry" re-arms it.
6. **Auth death pauses, never drops.** `invalid_grant` on refresh (user
   disconnected from Intuit's side, password change, rotation race) marks the
   connection `disconnected` and flips that org's pending tasks to
   `paused_auth`. Reconnecting to the same realm re-arms them — no sync
   intent is ever lost to an auth outage.
7. **Stale SyncToken → re-read and retry once.** On QBO's stale-object error,
   fetch the entity, store the fresh `syncToken` on the link, retry. A second
   failure follows normal backoff.

## 8. Token lifecycle (the part everyone gets wrong)

Refresh tokens **rotate**: when a refresh succeeds, the old refresh token is
dead. Two concurrent refreshes = one wins, the other's stored token is
garbage, connection bricked. Guards:

- **Single-flight refresh** via `SELECT … FOR UPDATE` on the `QboConnection`
  row inside the refresh transaction: the second caller blocks, then re-reads
  and finds a fresh access token, skipping its own refresh.
- Persist the **new access + refresh pair atomically** in that same
  transaction before releasing the lock.
- Refresh proactively when the access token is within 5 min of expiry, and
  reactively on a 401 (once, then surface).
- Tokens are AES-256-GCM encrypted at rest (`lib/qbo/crypto.ts`, key from
  `QBO_TOKEN_ENC_KEY`); never logged (scrub from `logError` context).

Env: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`
(`sandbox | production | mock` — selects the OAuth + API base URLs and must
match key mode, same dev/prod-split invariant as Stripe), `QBO_TOKEN_ENC_KEY`,
`CRON_SECRET`. Like Stripe, the integration is invisible when env is absent.
`mock` points both base URLs at the app's own test-only mock realm
(§10 Tier E) and is refused at boot when `VERCEL_ENV=production`.

## 9. API error codes (CONTEXT.md additions)

- `QBO_NOT_CONNECTED` (409) — manual sync requested but the org has no
  active QBO connection. Thrown by `/api/invoices/[id]/qbo-sync`.
- `QBO_AUTH_EXPIRED` (409) — connection exists but is `disconnected`;
  remedy is reconnecting in `/settings/integrations`.

Background sync failures are **not** API errors — they land in
`QboSyncTask.lastError` and the sync-health UI.

## 10. Test architecture — quality enforced by CI, not vigilance

The design rule that makes all of this cheap: **no module in `lib/qbo/`
touches the network or Prisma directly except through an injected port** —
the same dependency-injection shape as `handleStripeEvent(event, deps)` and
the send pipeline. `sync.ts` receives a `QboPort` (the API surface) and a
`SyncStore` (links + tasks); `connect.ts` receives a token store. Everything
below Tier D runs with fakes, fast, on every PR, in the existing CI jobs —
no new workflow is needed.

Tiers map onto the repo's existing test layout:

| Tier | Where | Runs | Infra |
|---|---|---|---|
| A — pure unit | `__tests__/lib/qbo/` | every PR (`npm test`, DB-less CI job) | none |
| B — engine vs fake QBO | `__tests__/lib/qbo/sync.test.ts` | every PR | `FakeQbo` in-memory |
| C — routes | `__tests__/api/qbo-*.test.ts` | every PR | `_helpers.ts` makeRequest |
| D — repo integration | `__tests__/repositories/qbo*.test.ts` | locally + preview DB (`describe.skipIf(!VITEST_DB_AVAILABLE)`) | real Postgres |
| E — UI end-to-end | `tests/e2e/qbo-*.spec.ts` | every PR (Playwright vs Vercel preview) | in-app mock realm |
| F — live contract | `scripts/qboSandboxSmoke.ts` | manual, release-gating | Intuit sandbox |

**Tier A — pure units.** `mapping.test.ts`: snapshot→QBO Invoice body
(folded lines, no markup row, tax override block, DocNumber fallback,
address mapping), payment and customer builders — table-driven over snapshot
fixtures. `client.test.ts`: Fault-envelope → typed `QboApiError`
(duplicate-name, stale-token, auth, throttle classifications), minorversion
pin present on every URL. `crypto.test.ts`: encrypt/decrypt round-trip,
tamper detection. `backoff.test.ts`: `2^attempts` capped at 6h, failed after
10. `connect.test.ts`: status mapping, authorize-URL state signing.

**Tier B — the reliability invariants, each pinned to a named test.**
`FakeQbo` (`__tests__/lib/qbo/fakeQbo.ts`) is a stateful in-memory realm:
entities get ids + SyncTokens, queries work, and failures inject per-call
(`failNext("timeout" | "duplicate_name" | "stale_token" | "401" | "429")`).
The traceability matrix — CI fails if an invariant regresses:

| §7 invariant | Test |
|---|---|
| 1 ensure-ops converge in any order | `payment task before invoice task → both synced, no dangling refs` |
| 2 query-before-create | `timeout after create POST → retry adopts, realm has exactly one invoice` |
| 3 enqueue-in-transaction | Tier D (`qboEnqueue.test.ts`) — DB rollback leaves no task; commit always leaves one |
| 4 sync never blocks the action | Tier C — send route succeeds while `FakeQbo` is hard-down |
| 5 sweeper converges | `N failing-then-healthy tasks → all done; attempts/backoff recorded` |
| 6 auth death pauses, never drops | `invalid_grant → tasks paused_auth; reconnect same realm → re-armed and synced` |
| 7 stale SyncToken retry | `sparse update with stale token → one re-read, then success` |
| §8 rotation single-flight | Tier D — two concurrent refreshes → one token call, connection still valid |

**Tier C — routes.** Through the `apiRoute` wrapper via
`__tests__/api/_helpers.ts`: role gates (admin for connect/disconnect/status,
lead+ for sync-now), `QBO_NOT_CONNECTED` / `QBO_AUTH_EXPIRED` envelopes,
callback state-signature rejection, cron route rejects a missing/wrong
`CRON_SECRET` bearer.

**Tier D — repo integration** (real DB, skip-gated like
`recordStripePayment.test.ts`): enqueue-in-transaction atomicity, task upsert
dedupe (`@@unique([orgId, kind, entityId])`), due-task claim query,
single-flight refresh under real row locking, link wipe on connecting a
different realm.

**Tier E — UI tests.** Two layers, matching the repo's split:

- *Component (jsdom/testing-library)* — `__tests__/components/settings/`
  `QuickBooksCard.test.tsx`: hidden without env, connect button
  (Intuit-branded asset), connected state with company name + health counts,
  reconnect banner on `disconnected`, disconnect confirm. `SyncHealthPanel.
  test.tsx`: failed rows show `lastError` + working Retry. And in
  `__tests__/components/invoices/InvoiceDetail.test.tsx`: badge states
  (none / pending / synced / failed+Retry) driven by the invoice payload.
- *End-to-end (Playwright vs the Vercel preview)* — CI's E2E job runs
  against the deployed preview, so the mock must live **inside the app**: a
  test-only route group `app/api/qbo-mock/` implementing the handful of
  OAuth + entity endpoints against the preview's own DB (a `QboMockEntity`
  table is unnecessary — an in-memory map per instance is too flaky on
  serverless, so the mock persists to a JSON blob keyed by realm in
  Postgres). It mounts **only when `QBO_ENVIRONMENT=mock`** (the preview's
  env setting) and refuses in production (§8). Specs:
  `qbo-connect.spec.ts` — full OAuth loop against the mock authorize page,
  lands connected with company name shown; `qbo-invoice-sync.spec.ts` —
  send an invoice, badge reaches "Synced", and the mock realm's stored
  invoice body carries the snapshot's folded totals + tax override;
  `qbo-failure-retry.spec.ts` — mock armed to fail once → badge "failed"
  with error text → Retry → "Synced"; role checks (crew sees no
  integrations page). These are the tests that catch UI/wiring regressions
  a refactor of hooks or routes would introduce.

**Tier F — live contract (the only tier that talks to Intuit).**
`scripts/qboSandboxSmoke.ts` connects a sandbox realm and pushes a seeded
customer→invoice→payment→void chain, asserting via QBO reads. Manual and
release-gating for changes under `lib/qbo/`, plus a monthly calendar run to
catch Intuit-side drift. It is deliberately **not** a scheduled CI job:
refresh tokens rotate every ~24h, so credentials stored in CI secrets
self-invalidate between runs; a secret-write-back hack exists but is a
flakiness generator, and drift Intuit ships is announced years out
(minorversion sunset) — a monthly manual run is the honest cost/benefit.
Sandbox responses captured during smoke runs are checked in as fixtures
(`__tests__/lib/qbo/fixtures/*.json`) and replayed by Tier A's Fault-parsing
tests, so the fake stays anchored to real wire shapes.

**CI wiring.** Tiers A–C run in the existing DB-less `Tests` job; Tier D
runs locally and anywhere `DATABASE_URL` is live; Tier E rides the existing
Playwright-vs-preview job — the only infra change is setting
`QBO_ENVIRONMENT=mock` + mock-safe `QBO_*` values in the Vercel
preview environment. No new workflows, no new services.

## 11. Milestones

Tests ship **inside** each milestone — a milestone without its tier rows
below is not done. (The fake port lands first, in M1, so every later
milestone develops against it.)

| # | Deliverable | Contents | Tests landing with it |
|---|---|---|---|
| **M0** | Sales tax (separate P0 project) | Blocks M2's invoice mapping only — M1 can proceed in parallel. Contract in §2. | (owned by the tax project; must freeze §2's fields into snapshot fixtures) |
| **M1** | Connect | Prisma models + migration, OAuth connect/callback/disconnect/refresh (single-flight, encryption), `/settings/integrations` page, sandbox app + keys. | Tier A crypto/connect/client + `FakeQbo` itself; Tier C connect/callback/disconnect/status; Tier D refresh single-flight + realm-switch link wipe; `QuickBooksCard` component states; `qbo-connect.spec.ts` + the in-app mock realm it needs. |
| **M2** | Invoices flow | `mapping.ts` + ensure-ops for customer/invoice, enqueue-on-send, `after()` attempt, `InvoiceDetail` badge + manual Sync now, AST-override sandbox spike. | Tier A mapping tables; Tier B invariants 1, 2, 4; Tier C sync-now + error codes; Tier D enqueue-in-transaction; `InvoiceDetail` badge component states; `qbo-invoice-sync.spec.ts`. |
| **M3** | Money + reliability | Payment + void ops, cron sweeper + backoff, sync-health panel, `paused_auth`/reconnect flow, sandbox smoke script. | Tier A backoff; Tier B invariants 5, 6, 7 + payment/void ops; Tier C cron auth; Tier D claim/dedupe; `SyncHealthPanel` component; `qbo-failure-retry.spec.ts`; Tier F smoke script + first captured fixtures. |
| **M4** | Production | Intuit app assessment (start early — review lead time), prod keys, optional mappings (income/deposit account, item name), bulk "sync existing sent invoices" action, docs/marketing ("QuickBooks sync included"). | Mapping-options component + Tier C coverage; bulk-sync Tier B test (N invoices, one converged realm); monthly Tier F cadence starts. |

Each milestone updates `CONTEXT.md`/`AGENTS.md` in the same change (new
module, error codes, gotchas: token rotation single-flight, links-per-realm).

## 12. Open questions (decide before the milestone that needs them)

1. **M2 — AST tax override:** confirmed by the sandbox spike, or fall back to
   agency-rate `TaxLineDetail`? (Decision gate inside M2.)
2. **M4 — existing-books adoption depth:** v1 adopts customers by exact
   DisplayName only. Is a manual "link to existing QBO customer" picker
   needed, or does exact-match cover real usage? Decide from beta feedback.
3. **M4 — cron cadence vs plan:** 5-min crons require a paid Vercel plan;
   confirm the project's plan or fall back to invocation-driven sweeps
   (piggyback on `/api/qbo/status` polling) + daily cron.
4. **Post-v1 — estimates in QBO?** Some bookkeepers want Estimates mirrored
   for A/R forecasting. Zero evidence in the research corpus; don't build
   speculatively.
