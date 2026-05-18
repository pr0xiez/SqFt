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
