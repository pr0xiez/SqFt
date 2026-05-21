# Domain Glossary

Terms that show up in the code and in conversation about it. Keep updated as
concepts are added or sharpened.

## Quote View

The fully-computed read model of a quote: per-line `effectiveQty` and
`subtotal`, plus totals (`subtotal`, `markup`, `convenienceFee`, `total`,
`deposit`) and a `hasUnresolvedLines` flag.

Single source of truth for quote math. Produced by `computeQuoteView` in
`lib/quoteView/`. Every caller — the editor (`LineItemSection`), the
customer-facing public quote page (`PublicQuoteView`), the send-email route,
the quote list endpoint, and the signed snapshot — derives its numbers from
this one function so the labeled breakdown can never diverge across
surfaces.

**Snapshot** = Quote View + identifying metadata (`quoteNumber`, `date`,
`customer`, `org`), serialized via `canonicalize` and hashed via `sha256` to
produce the tamper-evident `snapshotHash` stored on `QuoteSignature`.

Callers map their concrete representation (Prisma row, public quote payload,
editor form state) to `QuoteInput` at the seam. The Prisma adapter lives at
`lib/quoteView/fromPrisma.ts`.

## API Error Codes

Every API route returns errors as `{ error: { code, message, details? } }`.
`code` is the stable machine-readable identifier; clients branch on it.
`message` is human-readable. `details` is present for validation failures and
carries the full list of Zod issues.

Standard codes:

- `UNAUTHORIZED` (401) — no session, or session has no org.
- `VALIDATION_FAILED` (400) — request body failed Zod parse. `details` holds
  the issues array.
- `NOT_FOUND` (404) — resource missing, or not visible to the caller's org.
- `CONFLICT` (409) — generic conflict; prefer a domain code below when one
  applies.
- `INTERNAL` (500) — unexpected error; the underlying cause is logged but not
  surfaced.

Domain codes:

- `QUOTE_LOCKED` (409) — caller tried to mutate a quote whose status is
  `accepted` or `declined`.
- `QUOTE_HAS_EVENTS` (409) — caller tried to delete a quote that still has
  scheduled Events (jobs) referencing it.
- `CREW_MEMBER_IN_USE` (409) — caller tried to delete a crew member who is
  still assigned to one or more Events.
- `EMAIL_FAILED` (502) — upstream email provider rejected the send. Returned
  by the quote-send route when Resend reports a non-OK result.

Codes are produced by throwing an `ApiError` subclass from `lib/api/errors.ts`.
Routes throw; the `apiRoute` wrapper translates to the envelope.

Clients read the envelope via `readApiError(res, fallback)` from the same
module. It returns `{ code, message, details }` with safe fallbacks if the
body isn't JSON. Use it instead of inlining `res.json()` parsing — it keeps
the wire contract in one place and gives the caller access to `code` for
branching.
