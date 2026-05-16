# Quote Terminal-State Behavior — Design

**Date:** 2026-05-16
**Status:** Approved (pending implementation plan)
**Related:** [2026-05-10-quote-email-signature-design.md](2026-05-10-quote-email-signature-design.md)

## Goal

Define what happens after a quote reaches a terminal state (`accepted` or `declined`). Today both terminal states leave the quote fully editable and offer no follow-up affordances — the builder can silently change a signed contract, and a declining customer hits a dead-end with no path to receiving a revised proposal. This design closes both gaps with a small, opinionated set of rules.

## Non-goals (deferred)

- Estimate-level status (won/lost/active). Derivable from quote children; defer until we have a real reporting need.
- Void / unaccept / reopen / restore actions. Mistakes are corrected via Revise.
- Archive or hide for declined quotes in the list view.
- Customer-side "request a revision" form on the decline page.
- Customer confirmation email after accept or decline. (Only the builder is notified.)
- PDF generation of the locked quote.
- Sibling-link redirect that points the customer at the quote they actually accepted. (Stale links render as customer-declined for now.)

## Decisions

1. **Both terminal states are fully locked.** No edits to line items, items, tax, markup, deposit, or customer linkage after a quote reaches `accepted` or `declined`. The only post-terminal action is Revise.
2. **Revise is the only undo.** Available from both `accepted` and `declined`. Clones the quote into a new `draft` with `revisedFromId` pointing back. Original stays as audit history.
3. **Accepting auto-declines open siblings.** When a quote is accepted, all sibling quotes on the same Estimate whose status is `draft`, `sent`, or `viewed` are auto-declined in the same transaction. Already-terminal siblings (`accepted` or `declined`) are not touched.
4. **No new statuses.** The five existing statuses (`draft`, `sent`, `viewed`, `accepted`, `declined`) cover every case. "Superseded" is modeled as a declined quote with a distinguishing `declineReason` plus a `QuoteEvent.source` field — not a new state.
5. **Revision chains preserve full signed history.** If both the original and a revision get accepted (revise-after-accept flow), both stay `accepted`. The most-recent `acceptedAt` is treated as "current" in UI but neither is modified.
6. **No calendar/job side-effects.** Accepting a quote does not create an Event. Builder schedules jobs manually.

## Architecture

### Lifecycle, with terminal-state rules layered in

```
draft ─[Send]─▶ sent ─[view]─▶ viewed
                  │              │
                  │              ├─[Accept]──▶ accepted ✓ (locked)
                  │              │              │
                  │              │              └─[Revise]─▶ new draft (revisedFromId)
                  │              │
                  │              └─[Decline]──▶ declined ✗ (locked)
                  │                              │
                  │                              └─[Revise]─▶ new draft (revisedFromId)
                  │
                  └─[Accept on sibling]─▶ declined (source: system_supersede)
```

### Schema changes (Prisma)

```prisma
model Quote {
  // ...existing fields
  revisedFromId Int?
  revisedFrom   Quote?  @relation("QuoteRevisions", fields: [revisedFromId], references: [id], onDelete: SetNull)
  revisedBy     Quote[] @relation("QuoteRevisions")
}

model QuoteEvent {
  // ...existing fields
  source String?  // "customer" | "builder" | "system_supersede"
}
```

- `Quote.revisedFromId` is a nullable self-relation. `onDelete: SetNull` so deleting a predecessor doesn't cascade-delete its revisions (the revision can stand alone).
- `QuoteEvent.source` is nullable for backfill compatibility. New writes always set it. Existing rows remain `null` and render as "customer" by default in the UI.

### Acceptance flow (additions to existing accept handler)

`acceptQuoteByToken` in `lib/repositories/quoteSignatureRepo.ts` gains a step inside the existing transaction:

```ts
// after the accepted quote's status flip, in the same tx:
const siblingsUpdated = await tx.quote.updateMany({
  where: {
    estimateId: quote.estimateId,
    id: { not: quote.id },
    status: { in: ["draft", "sent", "viewed"] },
  },
  data: {
    status: "declined",
    declinedAt: now,
    declineReason: `Superseded — customer accepted Quote #${quote.quoteNumber}`,
  },
});

if (siblingsUpdated.count > 0) {
  // fetch ids and write one QuoteEvent per superseded sibling
  // with type: "declined", source: "system_supersede"
}
```

The owner notification email is unchanged (one email per acceptance, regardless of how many siblings were swept).

### Revise mechanics

New repository function `reviseQuote(quoteId, orgId)`:

1. Load the original quote with line items and items.
2. Create a new Quote: same `estimateId`, `customerId`, `taxRate`, `markupPct`, `depositPct`; `status = "draft"`, fresh `approvalToken`, `revisedFromId = original.id`; cleared `sentAt`/`viewedAt`/`acceptedAt`/`declinedAt`/`declineReason`/`sentToEmail`/`sentByEmail`/`sentByName`.
3. Copy `LineItem` rows and `RoomItem`/`MiscItem` rows (the JSON `items` blob) into the new quote.
4. Write `QuoteEvent(type: "revised_from", source: "builder", metadata: { revisedFromId: original.id, revisedFromQuoteNumber: original.quoteNumber })` on the new quote. `QuoteEvent.metadata` is the existing `Json?` column.
5. Return the new quote's id for the caller to redirect to.

This is wrapped in a single transaction. If anything fails, no orphan rows.

### UI changes

**Builder view — `/quotes/[id]` (`QuoteBuilder.tsx`)**

When `status` is `accepted` or `declined`:

- Line items, totals, pricing inputs render in a read-only mode (existing components receive a `readOnly` prop or a parent wrapper disables mutation handlers).
- Top banner replaces the existing status pill area:
  - Accepted: green banner with `✓ Accepted by [name] on [date]` and a link "View signed quote →" (existing `/quotes/[id]/signed`).
  - Declined: amber/red banner with `✗ Declined by [name] on [date]`, with `declineReason` rendered in larger type immediately below. If `QuoteEvent.source = "system_supersede"`, render as `✗ Auto-declined when Quote #N was accepted` instead.
- A "Revise" button appears in the secondary actions area. Click → calls `POST /api/quotes/[id]/revise` → server creates the new draft → response includes new id → client navigates to `/quotes/[newId]`.
- The existing "Save" button is hidden. If the builder somehow POSTs an update, the server returns 409 with `{ error: "Quote is locked (status: accepted)" }`.
- If the quote has a successor (i.e., `revisedBy.length > 0`), show a small "Revised by → Q#M" link in the header. If `revisedFromId` is set, show "← Revision of Q#N".

**Customer view — `/q/[token]` (`PublicQuoteView.tsx`)**

- Accepted: unchanged. Shows `PublicQuoteSignedView` (already in place).
- Declined: existing decline notice stays. Append builder contact: org `phone` (when set) and org owner email as a "Questions? Contact [org name]: [phone] / [email]" line below the decline message. No reaccept affordance.
- A customer who hits the public link for a sibling that was auto-declined by `system_supersede` sees the same UI as a customer-initiated decline. They are not redirected to the accepted sibling. (Documented limitation, deferred above.)

**List view — `/quotes` (`QuoteList.tsx`)**

- No change to the default view.
- A revised quote shows a small `↶ revision` badge next to its row's quote number.
- Filtering, sorting, and counts unchanged.

### Lockdown enforcement

Server-side guards live in `lib/repositories/quoteRepo.ts`:

- `updateQuote` and any line-item / item mutation paths reject when the quote's current status is `accepted` or `declined`, returning a typed error like `{ kind: "locked", status }`.
- The existing `saveQuote` path explicitly excludes `status` from mutations once terminal (it can only transition `draft → sent`, `sent → viewed`, etc.; terminal-state mutations are blocked at the repository layer, not just the UI).
- `reviseQuote` is the one exception — it doesn't mutate the locked quote, it creates a new one.

### Audit trail

Every state change continues to write a `QuoteEvent`. With `source` added we can distinguish:

- `customer` — accept, decline initiated from the public link.
- `builder` — send, regenerate token, revise.
- `system_supersede` — auto-decline triggered by sibling acceptance.

`/quotes/[id]/signed` and any future audit-trail UI read `source` to label events correctly.

## Test plan

- Unit: `reviseQuote` returns a new quote with the right relations and zeroed timestamps; original is unchanged.
- Unit: `acceptQuoteByToken` auto-declines siblings in scope; does not touch terminal siblings; writes one `QuoteEvent(source: system_supersede)` per affected sibling.
- Unit: `updateQuote` returns the locked error when called on an accepted or declined quote.
- Integration: full happy path — Estimate with three sent quotes, customer accepts one, verify the other two are declined with the correct reason and event source.
- Integration: revise-after-accept — accept Q1, builder calls revise, edit and send Q2, customer accepts Q2. Both end up accepted; both visible; revision links resolve in the builder UI.
- Integration: locked-update — accepted quote's `PATCH` returns 409, UI displays the lock banner.
- Integration: stale-link — customer who accepted a sibling visits the auto-declined quote's public URL, sees the decline UI.

## Phases

| Phase | Scope |
|---|---|
| 1 | Schema migration (`revisedFromId`, `QuoteEvent.source`) and seed updates |
| 2 | `reviseQuote` repository + `POST /api/quotes/[id]/revise` route |
| 3 | Lockdown — repository guards on accepted/declined quotes, including `updateQuote` |
| 4 | Acceptance flow auto-decline of open siblings + system_supersede event |
| 5 | Builder UI — read-only mode, accepted/declined banners, Revise button, revision-chain links |
| 6 | Customer UI — builder contact on decline page |
| 7 | List view — revision badge |

Each phase is independently shippable behind the existing single-tenant deployment.
