# QuickBooks Online Sync — Implementation Plan

**Date:** 2026-07-23 · **Status:** proposed (no code yet)
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
(`sandbox | production` — selects base URL + matches key mode, same
dev/prod-split invariant as Stripe), `QBO_TOKEN_ENC_KEY`, `CRON_SECRET`.
Like Stripe, the integration is invisible when env is absent.

## 9. API error codes (CONTEXT.md additions)

- `QBO_NOT_CONNECTED` (409) — manual sync requested but the org has no
  active QBO connection. Thrown by `/api/invoices/[id]/qbo-sync`.
- `QBO_AUTH_EXPIRED` (409) — connection exists but is `disconnected`;
  remedy is reconnecting in `/settings/integrations`.

Background sync failures are **not** API errors — they land in
`QboSyncTask.lastError` and the sync-health UI.

## 10. Testing

- **Pure layers get the deep tests:** `mapping.ts` builders
  (snapshot→Invoice incl. tax override, folded lines, DocNumber fallback)
  and the ensure-op state machine against an in-memory fake QBO port — same
  pattern as the send-pipeline tests (no network, no DB at the seam). The
  fake simulates: duplicate DisplayName, stale SyncToken, 401 mid-batch,
  timeout-after-create (invariant 2), rotation race (§8).
- **Repo tests:** enqueue-in-transaction (invariant 3), task upsert dedupe,
  claim/backoff arithmetic.
- **Sandbox smoke script** (`scripts/qboSandboxSmoke.ts`): connect a sandbox
  realm, push a seeded customer→invoice→payment→void chain, assert via QBO
  reads. Run manually before each release touching `lib/qbo/` — Intuit
  sandboxes are free and instant.
- E2E: settings page connect-button render + status states only (OAuth
  itself can't run headless against Intuit).

## 11. Milestones

| # | Deliverable | Contents |
|---|---|---|
| **M0** | Sales tax (separate P0 project) | Blocks M2's invoice mapping only — M1 can proceed in parallel. Contract in §2. |
| **M1** | Connect | Prisma models + migration, OAuth connect/callback/disconnect/refresh (single-flight, encryption), `/settings/integrations` page, sandbox app + keys. |
| **M2** | Invoices flow | `mapping.ts` + ensure-ops for customer/invoice, enqueue-on-send, `after()` attempt, `InvoiceDetail` badge + manual Sync now, AST-override sandbox spike. |
| **M3** | Money + reliability | Payment + void ops, cron sweeper + backoff, sync-health panel, `paused_auth`/reconnect flow, sandbox smoke script. |
| **M4** | Production | Intuit app assessment (start early — review lead time), prod keys, optional mappings (income/deposit account, item name), bulk "sync existing sent invoices" action, docs/marketing ("QuickBooks sync included"). |

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
