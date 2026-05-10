# Quote → Email → Signature Flow — Design

**Date:** 2026-05-10
**Status:** Approved (awaiting plan)
**Related:** [specs/floorzap-competitor-roadmap.md](../../../specs/floorzap-competitor-roadmap.md) §1.2 + §1.3

## Goal

Close the gap between a built quote and a customer-signed quote. Today, "Send to customer" only copies a share link. After this work, the org user emails the customer a link to a redesigned public quote viewer; the customer signs in-browser; the org owners are notified and a tamper-evident legal record is preserved.

## Non-goals (deferred)

- PDF attachment on the customer email (link-only for v1)
- Quote expiry (`expiresAt`) and expiry enforcement
- Per-quote terms section (Payment / Schedule / Warranty / Validity)
- Project summary grid (3 cells: total area / material order / install days)
- Line item description sub-line ("3 rooms · whitewashed oak · 7\" plank")
- "Ask a question" button on the public viewer
- DocuSign / external e-signature vendor
- SMS delivery
- Per-org verified sending domains

## Decisions

1. **Signature mechanism: in-browser canvas signature pad** (per `design/SqFt - Quote Viewer.html`). ESIGN/UETA-compliant when paired with name+email+IP+UA+timestamp+consent disclosure.
2. **Email provider: Resend** with `react-email` for templates. Shared sender domain (`quotes@sqft.app`), `Reply-To` set to the sending org user's email.
3. **Signature image storage: base64 PNG in a `QuoteSignature.signatureData` column.** Tiny payload (~5–30 KB), kept off the hot Quote query path by living on a separate row.
4. **Audit trail: append-only `QuoteEvent` table** for every lifecycle event (sent, viewed, accepted, declined, link_rotated, resent). No FKs to User — actor identity stored as denormalized `actorEmail` + `actorName` so deleting a user doesn't break the legal record.
5. **Owner notification recipients: all org users where `role = "owner"`.**
6. **MVP scope:** send email, sign with name+email+sig, status pill flips to accepted, owner notification, decline button with optional reason, view tracking. Everything else in `design/SqFt - Quote Viewer.html` is deferred.

## Architecture

### Lifecycle state machine

```
draft ──[Send]──▶ sent ──[customer opens link]──▶ viewed
                   │                                │
                   │                                ├──[Accept+Sign]──▶ accepted ✓ (terminal)
                   │                                │
                   │                                └──[Decline]──▶ declined ✗ (terminal)
                   │
                   └──[Resend / Regenerate token]──▶ sent (back to start of customer side)
```

- `viewed` is a new status between `sent` and `accepted`/`declined`.
- Once `accepted`, no further state changes; regenerating the link is blocked. The `quoteSnapshot` is the legal record.
- Once `declined`, the org can compose a new quote (not a re-send of this one).

### File map (new files in **bold**)

```
app/
  api/
    quotes/[id]/
      approval-token/route.ts         existing — keep
      send/route.ts                   NEW — POST: send customer email + log
    q/[token]/
      accept/route.ts                 NEW — POST: write signature, notify owners
      decline/route.ts                NEW — POST: decline + reason
  q/[token]/
    page.tsx                          UPDATED — view tracking on render
  (app)/quotes/[id]/
    page.tsx                          existing
    signed/page.tsx                   NEW — org-side audit view of QuoteSignature
components/
  estimates/
    PublicQuoteView.tsx               REWRITE — match design HTML (MVP cut)
    PublicQuoteAcceptBlock.tsx        NEW (client) — sig pad, name/email, consent, decline modal
    PublicQuoteSignedView.tsx         NEW — post-acceptance display
    SignaturePad.tsx                  NEW (client) — canvas wrapper
  quotes/
    QuoteBuilder.tsx                  UPDATED — primary Send button + secondary actions menu
    SendQuoteDialog.tsx               NEW (client) — email send form
lib/
  email/
    client.ts                         NEW — Resend wrapper with test-mode no-op
    sendQuoteEmail.ts                 NEW — customer email template + send
    sendSignedNotification.ts         NEW — owner notification template + send
  signature/
    snapshot.ts                       NEW — canonical JSON serializer + SHA-256 hash
  repositories/
    quoteRepo.ts                      EXTENDED — markSent, recordView, acceptQuote, declineQuote
    quoteSignatureRepo.ts             NEW
    quoteEventRepo.ts                 NEW
prisma/
  migrations/<date>_quote_signing/    NEW
  schema.prisma                       UPDATED
  seed.ts                             UPDATED — sent + accepted fixtures
```

### Tenant boundary

- Public routes (`GET /q/[token]`, `POST /api/q/[token]/accept`, `POST /api/q/[token]/decline`) bypass `getOrgId()`. The token is the auth.
- Org-side routes (`POST /api/quotes/[id]/send`, etc.) use the existing `getOrgId()` pattern.
- `QuoteSignature` and `QuoteEvent` carry no `orgId` column — they are scoped via `Quote.orgId` and all reads must join through `Quote`.

## Schema

### `Quote` — added fields

```prisma
model Quote {
  // existing fields unchanged
  status         String    @default("draft")  // draft|sent|viewed|accepted|declined
  sentAt         DateTime?
  sentToEmail    String?
  sentByEmail    String?
  sentByName     String?
  viewedAt       DateTime?
  acceptedAt     DateTime?
  declinedAt     DateTime?
  declineReason  String?

  signature      QuoteSignature?
  events         QuoteEvent[]
}
```

### `QuoteSignature` — new (1:1 with Quote when accepted)

```prisma
model QuoteSignature {
  id              Int      @id @default(autoincrement())
  quoteId         Int      @unique
  quote           Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  signedByName    String
  signedByEmail   String
  signatureData   String   // base64 PNG data URL, ~5–30KB
  signedAt        DateTime @default(now())
  signedIp        String
  signedUserAgent String
  consentText     String   // exact disclosure text shown
  quoteSnapshot   Json     // full rendered quote at time of signing
  snapshotHash    String   // SHA-256 of canonical snapshot JSON — tamper evidence
}
```

### `QuoteEvent` — new (append-only audit log)

```prisma
model QuoteEvent {
  id          Int      @id @default(autoincrement())
  quoteId     Int
  quote       Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  type        String   // sent | viewed | accepted | declined | link_rotated | resent
  actorEmail  String?  // org user (sent/rotated/resent) or customer (accepted/declined)
  actorName   String?  // denormalized for display
  ip          String?
  userAgent   String?
  metadata    Json?    // type-specific extras (e.g., { to, subject } on sent)
  createdAt   DateTime @default(now())

  @@index([quoteId, createdAt])
}
```

### Snapshot canonicalization

`lib/signature/snapshot.ts` produces a deterministic JSON string with sorted keys, then `sha256(canonical)` for `snapshotHash`. The snapshot includes everything that affects the legal record:

```typescript
{
  quoteNumber, date, taxRate, markupPct, depositPct,
  customer: { name, address, email, phone },
  org:      { name, address, phone, licenseNumber, logo },
  items:    [room/note rows in sortOrder],
  lineItems:[line items in sortOrder],
  totals:   { subtotal, markup, tax, total, deposit }
}
```

### Seed updates

Add two fixtures:
- One Quote in status `sent` with `approvalToken`, `sentAt`, `sentToEmail`, `sentByEmail`/`sentByName`, plus a `QuoteEvent(type=sent)` row.
- One Quote in status `accepted` with full `QuoteSignature` row (sig PNG, snapshot, hash) and `QuoteEvent` rows for sent + viewed + accepted.

## Public viewer page (rewrite)

### Component split

```
PublicQuoteView (server component, in /q/[token]/page.tsx)
├── PublicQuoteHeader              brand, biz, print button
├── PublicQuoteStatusBar           pill + meta line (sent/viewed/accepted/declined)
├── PublicQuotePaper               the "paper" container
│   ├── Letterhead                 eyebrow / "Quote" / Q-#### / org block (right)
│   ├── PartiesBlock               Prepared for | Project (title)
│   ├── RoomsList                  chips with name + dimension label
│   ├── LineItemsTable             desc / qty / rate / subtotal
│   └── TotalsBlock                subtotal, tax, markup, total, deposit
├── PublicQuoteAcceptBlock         (client) status ∈ {sent, viewed} → render
│   ├── name + email inputs
│   ├── consent disclosure paragraph
│   ├── SignaturePad
│   ├── [Accept & Sign] [Decline] buttons
│   └── DeclineModal
└── PublicQuoteSignedView          status = accepted → render
    ├── signed-banner (sage)
    └── signed-display (signature image, name, signed-at)
```

### Behavioral details

- **Page-load tracking.** In `app/q/[token]/page.tsx` after `getQuoteByToken()`:
  - status=sent → call `markQuoteViewed()` (flips to `viewed`, sets `viewedAt`, writes `QuoteEvent(viewed)`)
  - status=viewed → just append a `QuoteEvent(viewed)` (no status change)
  - status ∈ {accepted, declined} → no log (snapshot view is what they see)
- **Accept block visibility:**
  - `status ∈ {draft, sent, viewed}` → render `PublicQuoteAcceptBlock`
  - `status = accepted` → render `PublicQuoteSignedView`
  - `status = declined` → render "this quote was declined on <date>" message
- **Print.** Port the design HTML's `@media print` rules to Tailwind `print:` variants.
- **Mobile.** Port design HTML's 640px breakpoint to Tailwind responsive classes.
- **Robots.** Keep existing `robots: { index: false, follow: false }`.

### Consent disclosure (stored verbatim in `QuoteSignature.consentText`)

> By typing my name and signing below, I consent to use an electronic signature, and agree this signature has the same legal effect as a handwritten signature on this quote.

## Send flow (org side)

### `QuoteBuilder.tsx` change

Replace the current "Send to customer →" dropdown with:
- **Primary:** `[Send to customer →]` — opens `SendQuoteDialog`
- **Secondary `[ ⋮ ]` menu:** `Copy share link` / `Regenerate link` (existing behavior preserved)

### `SendQuoteDialog`

Form fields:
- `to` — email, required, prefilled from `Customer.email`. If null, field is empty + checkbox "Save this email to <Customer Name>" appears (default on).
- `subject` — text, prefilled `Quote #{quoteNumber} from {orgName}`, editable.
- `message` — textarea, optional, no default. Goes into the email body above the link.
- `regenerateLink` — checkbox, only shown when `quote.approvalToken` already exists. Default off.

State machine: `idle → editing → sending → sent | error`. Send disabled until `to` is a valid email.

### `POST /api/quotes/[id]/send`

```
auth: getOrgId() — org-scoped
body: { to: string, subject: string, message?: string, regenerateLink?: boolean }
flow:
  1. Load quote with org info; 404 if not in org
  2. If quote.status ∈ {accepted, declined} → 409 ("can't re-send a {accepted|declined} quote")
  3. If regenerateLink || !quote.approvalToken → rotateApprovalToken()
     - if rotated, write QuoteEvent(type=link_rotated, actorEmail=session.user.email)
  4. Build public URL: `${PUBLIC_BASE_URL}/q/${token}`
  5. Get session user (email + name) for actorEmail/actorName + sentBy fields
  6. Call sendQuoteEmail({ to, subject, message, publicUrl, quote, org })
     - throws if Resend rejects → return 500 with friendly message; no DB writes
  7. On success, in a transaction:
     - Update Quote: status=sent (only if currently draft|sent|viewed),
                     sentAt=now, sentToEmail=to,
                     sentByEmail=user.email, sentByName=user.name
     - Write QuoteEvent(type = sentAt was previously null ? "sent" : "resent",
                        actorEmail=user.email, actorName=user.name,
                        metadata={to, subject})
  8. If `to` differs from Customer.email and form requested save → update Customer.email
  9. Return { ok: true }
```

### Customer email (Resend + react-email)

```
Subject: <user-edited; default: "Quote #{quoteNumber} from {orgName}">
From:    "SqFt Quotes <quotes@sqft.app>"  (env EMAIL_FROM)
Reply-To: <session user's email>
Body:
  - Org header with name + logo (if set)
  - "Hi {customer.name},"
  - Optional message paragraph from sender (rendered as plain text)
  - Quote summary card: "Quote #{quoteNumber}" · "Total {fmtDollar(total)}"
  - Big primary button: "View & sign quote" → publicUrl
  - Plaintext fallback URL beneath button
  - Footer: "From {org.name} · {org.phone} · Powered by SqFt"
```

Plain-text alternative auto-generated by react-email.

## Sign / decline flow (customer side)

### `POST /api/q/[token]/accept`

```
public — token is auth
body: { name: string, email: string, signatureDataUrl: string, consentText: string }
flow:
  1. Look up quote by token; 404 if not found
  2. Reject if status ∈ {accepted, declined} → 409
  3. Validate signatureDataUrl: starts with "data:image/png;base64,"; decoded length ≤ 100KB
  4. Capture: ip = req.headers["x-forwarded-for"] || req.ip
              userAgent = req.headers["user-agent"]
  5. In a transaction:
     a. Build canonical snapshot from current Quote state (lib/signature/snapshot.ts)
     b. snapshotHash = sha256(canonical)
     c. Create QuoteSignature row (unique on quoteId — concurrent accept fails → 409)
     d. Update Quote: status=accepted, acceptedAt=now
     e. Write QuoteEvent(type=accepted, actorEmail=email, actorName=name, ip, userAgent)
  6. After commit, fire-and-forget: notify all org owners (role="owner" in quote.orgId)
     - Failures logged but not surfaced (signing already succeeded)
  7. Return { ok: true }
client UX:
  - 200 → router.refresh() so server renders SignedView
  - 409 → inline error + refresh (renders SignedView)
  - 5xx / network → inline retry
```

### `POST /api/q/[token]/decline`

```
public
body: { reason?: string }   // optional; max 1000 chars
flow:
  1. Look up by token; 404 if not found
  2. Reject if status ∈ {accepted, declined} → 409
  3. Update Quote: status=declined, declinedAt=now, declineReason=reason ?? null
  4. Write QuoteEvent(type=declined, actorEmail=null, actorName=null, ip, userAgent,
                      metadata={reason})
  5. Fire-and-forget owner notification
client UX:
  - DeclineModal closes → router.refresh() → renders "Quote was declined on <date>"
```

### Owner notification email

```
To:      <comma-joined org owner emails>
From:    "SqFt Quotes <quotes@sqft.app>"
Subject: "✓ {customer.name} signed Quote #{quoteNumber}"
         (decline variant: "Quote #{quoteNumber} was declined")
Body (react-email):
  - "Quote #{quoteNumber} was signed by {signedByName}."
  - "Signed at: {signedAt}"
  - "Customer email: {signedByEmail}"
  - "Total: {fmtDollar(total)} · Deposit due: {fmtDollar(deposit)}"
  - Primary button: "View signed quote" → /quotes/{id}/signed
  - "What's next: contact {firstName} to schedule and send the deposit invoice."
```

### Builder-side audit view: `/quotes/[id]/signed`

Read-only render of `QuoteSignature.quoteSnapshot` (not live Quote state) showing the exact document at signing, plus signature image, signed-by name + email, timestamp, IP, user agent, and `snapshotHash`. Linked from `QuoteBuilder` when `status === "accepted"`.

## Email infrastructure

- **New deps:** `resend`, `react-email`, `@react-email/components`
- **New env vars:**
  - `RESEND_API_KEY` — required at runtime when sending
  - `EMAIL_FROM` — e.g. `"SqFt Quotes <quotes@sqft.app>"`
  - `PUBLIC_BASE_URL` — e.g. `"https://app.sqft.app"`, used to build `/q/<token>` links
- **DNS work (out of scope here):** Resend account setup, verify sending domain `sqft.app` (SPF/DKIM/DMARC). Document as ops task in implementation plan.
- **Test-mode no-op:** `lib/email/client.ts` exports `sendEmail()`. When `NODE_ENV === "test"` or `RESEND_API_KEY` is unset, it short-circuits to a no-op that records the call into an in-memory array exposed via a test helper, so tests can assert what was sent without hitting the network.

## Testing

| Layer | What | Where |
|---|---|---|
| Unit | Snapshot canonicalization + hash determinism | `__tests__/lib/snapshot.test.ts` |
| Unit | sendQuoteEmail / sendSignedNotification render correct subject + body | `__tests__/lib/email.test.ts` |
| Repo | accept flow: writes QuoteSignature + updates Quote + writes QuoteEvent in one txn; double-accept fails with 409 | `__tests__/repositories/quoteSignatureRepo.test.ts` |
| Repo | decline; view tracking; markSent | extend `__tests__/repositories/quoteRepo.test.ts` |
| API | `POST /api/quotes/[id]/send` happy path + 409 (accepted) + 401 (cross-org) | `__tests__/api/quotes.[id].send.test.ts` |
| API | `POST /api/q/[token]/accept` happy path + 409 (double-sign) + 404 (bad token) | `__tests__/api/q.[token].accept.test.ts` |
| API | `POST /api/q/[token]/decline` happy path + 409 (already accepted) | `__tests__/api/q.[token].decline.test.ts` |
| E2E | Extend `tests/e2e/public-quote.spec.ts`: send (status=sent), view (status=viewed), sign with mocked Resend (status=accepted, signature persisted, owner notification recorded) | same file |

## Implementation slices

Ordered by dependency. Each slice ends with passing tests + lint clean.

| # | Slice | Touches | Depends on |
|---|---|---|---|
| 1 | **Schema migration + seed fixtures** — Quote columns, QuoteSignature + QuoteEvent models, migration, seed updates (sent + accepted fixtures). Migration smoke-tested via seed run; repo function bodies arrive in later slices that need them | prisma, prisma/seed.ts, lib/repositories | — |
| 2 | **Snapshot + hash utility** — `lib/signature/snapshot.ts` with canonical JSON + sha256, full unit coverage | lib/signature | — |
| 3 | **Email infra + Resend wrapper** — install deps, `lib/email/client.ts` with test-mode no-op, `.env.example` updates | lib/email, package.json, .env.example | — |
| 4 | **Customer email template + send API** — `sendQuoteEmail.ts`, `POST /api/quotes/[id]/send`, repo `markQuoteSent` | lib/email, app/api/quotes/[id]/send | 1, 3 |
| 5 | **SendQuoteDialog + builder integration** — primary Send button + secondary actions menu in QuoteBuilder; new dialog component | components/quotes | 4 |
| 6 | **Public viewer rewrite (read-only parts)** — port design HTML letterhead / parties / rooms / line-items / totals / status bar, no acceptance UI yet | components/estimates | 1 |
| 7 | **View tracking** — server-side `markQuoteViewed` + event log on page load | app/q/[token]/page.tsx, lib/repositories | 1, 6 |
| 8 | **Signature pad + accept API + signed view + owner notification** — `SignaturePad`, `PublicQuoteAcceptBlock`, `PublicQuoteSignedView`, `POST /api/q/[token]/accept`, `quoteSignatureRepo`, `sendSignedNotification` | components/estimates, app/api/q/[token]/accept, lib/email | 1, 2, 3, 6 |
| 9 | **Decline modal + decline API** | components/estimates, app/api/q/[token]/decline | 6, 8 |
| 10 | **Builder-side `/quotes/[id]/signed` audit view** — read-only render of `QuoteSignature.quoteSnapshot` | app/(app)/quotes/[id]/signed | 1, 8 |

## Open ops items (outside this codebase)

- Verify `sqft.app` sending domain in Resend (SPF/DKIM/DMARC records)
- `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_BASE_URL` already added to Vercel + local `.env` files
