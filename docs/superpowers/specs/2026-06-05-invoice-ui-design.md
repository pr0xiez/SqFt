# Invoice UI — Design

**Date:** 2026-06-05
**Status:** Approved for planning
**Scope:** Build the builder-facing UI for creating, sending, and recording payment on invoices, on top of the already-merged invoicing backend. Stripe is out of scope. Also bundles a cross-cutting change: markup is folded into customer-facing line-item prices everywhere (invoice **and** estimate).

## Goal

A builder can create one or more invoices against an estimate, send them to the customer by email, and record payments (including partial/deposit payments) — all from the app. Invoices are always read-only: the billed line items derive from the estimate, so changing them means fixing the estimate or creating another invoice.

## Background (existing backend)

The backend is complete and is **not** changing, except for the markup-folding presentation change (§3):

- **Create / list:** `POST` / `GET /api/estimates/[id]/invoices` — bill either a flat `amount` or a `pct` (% of estimate total), plus `memo`, `terms`, `coverNote`, `dueDate`. Over-billing past the unbilled balance is rejected (`InvoiceOverbillError`).
- **Get:** `GET /api/invoices/[id]`. (`PATCH` exists for drafts but the UI will not use it — see §4.)
- **Send:** `POST /api/invoices/[id]/send` — `{ to, subject, regenerateLink? }`. Freezes the customer-facing snapshot, emails the customer, mints a public token on first send (reused after), flips `draft → sent`.
- **Record payment:** `POST /api/invoices/[id]/payments` — `{ amount, method, paidAt?, reference?, note? }`. Invoice auto-derives `partial` / `paid` and stamps `paidAt`.
- **Void:** `POST /api/invoices/[id]/void` — terminal.
- **Lifecycle:** `draft → sent → viewed → partial → paid`; `void` is terminal. Billing rollup via `computeEstimateBilling` → `{ total, invoiced, unbilled, paid, outstanding }`.

## Key decisions

1. **Invoices are read-only.** No edit UI. Line items derive from the estimate; to change them, fix the estimate or create another invoice. No limit on invoices per estimate.
2. **Dedicated invoice page.** The estimate page shows a compact list; each invoice opens its own page at `/invoices/[id]` (mirrors the estimate list→detail pattern). Create is a modal launched from the estimate.
3. **Payments use a "record payment" form** that defaults to the full outstanding balance but allows partials, with a visible payment history (option C).
4. **Markup is never shown to customers.** It is folded into customer-facing line-item prices on both the invoice and the estimate. Internal builder views still break markup out. Bundled into this work.

## Architecture & files

Follows existing estimate patterns.

- `lib/hooks/useInvoices.ts` *(new)* — react-query hooks mirroring `useEstimates`: `useInvoices(estimateId)`, `useInvoice(id)`, `useCreateInvoice(estimateId)`, `useSendInvoice(id)`, `useRecordPayment(id)`, `useVoidInvoice(id)`. Each wraps the existing route and invalidates `["invoices", …]` plus the parent estimate query.
- `app/invoices/[id]/page.tsx` *(new)* — server component; loads the invoice (org-scoped) and renders the detail client component; 404s on miss.
- `components/invoices/InvoiceDetail.tsx` *(new)* — the detail page body.
- `components/invoices/CreateInvoiceDialog.tsx` *(new)*
- `components/invoices/SendInvoiceDialog.tsx` *(new)*
- `components/invoices/RecordPaymentDialog.tsx` *(new)*
- `components/invoices/VoidInvoiceDialog.tsx` *(new)*
- `components/invoices/InvoicesSection.tsx` *(rewrite)* — the existing read-only stub becomes billing summary + compact list + "Create invoice".

Reuse: `components/ui/Button`, `components/ui/Toast`, the modal-shell idiom from `SendEstimateDialog`, `fmtDollar`, `readApiError`.

## 1. Estimate-page Invoices section

Rewrite of `InvoicesSection.tsx`:

- **Billing summary bar** — Invoiced / Unbilled / Outstanding, from `computeEstimateBilling`.
- **Compact list** — one row per invoice: `#`, status badge, amount, "open →". Click → `/invoices/[id]`.
- **"+ Create invoice"** button → opens the create dialog.
- Empty state: "No invoices yet."

## 2. Create invoice dialog

Modal popup launched from the Invoices section.

- **Bill by** — three-way segmented control:
  - **Remaining balance** (default) — no input; bills the full unbilled amount. Preview: "$X.00 · Leaves $0 unbilled".
  - **% of balance** — a `%` input pre-filled with `org.defaultDepositPct`. Helper text "% of $X remaining" where `X` is the **remaining** (unbilled) balance. Only this mode shows the helper text.
  - **Flat amount** — a single `$` input, default `$0.00`; no `%` input.
- **Live preview** — resulting dollar amount + "Leaves $X unbilled". Over-billing past the unbilled balance shows an inline warning; submit is also rejected server-side.
- **Due date** (optional), **Memo** (optional). **Cover note & terms** behind a disclosure (default from estimate/org, rarely changed).
- **Submission:** "% of balance" computes the dollar figure client-side (`remaining × pct`) and submits a **flat `amount`** — the backend's `pct` means "% of estimate total", which is not what we want, so we never send `pct`. "Remaining balance" submits the unbilled amount as `amount`. The stored invoice records dollars, not a percentage.
- **On success:** dialog closes and navigates to `/invoices/[id]` for the new draft.

## 3. Markup folding (cross-cutting, bundled)

Customers must never see a "Markup" (or "Labor & margin") line. Today proration emits a literal `"Markup"` row into the customer invoice snapshot, and the public estimate shows a "Labor & margin · X%" row. Both go away.

- **Shared helper** — produces customer-facing line rows with markup distributed proportionally into each line price (`lineSubtotal × (1 + markupPct/100)`), reconciled so displayed rows sum exactly to the marked-up subtotal. No markup row is ever emitted. The convenience fee remains its own row/line (it is a legitimate customer-facing fee). Lives alongside the estimate-view math (`lib/estimateView` or `lib/invoices`), reusable by both surfaces.
- **Invoice** — `prorateInvoice` distributes markup into line amounts (via the helper) and prorates by `amount / total`; no markup row. `snapshotInvoice` totals no longer carry a separate markup line for display purposes (the underlying `markup` value may remain in stored math but is not rendered to the customer).
- **Estimate** — public estimate line rows show marked-up prices; `TotalsBlock` drops the "Labor & margin" row (Subtotal → Convenience fee → Total, where Subtotal is the marked-up subtotal). New estimate snapshots fold markup in; **already-signed snapshots keep their frozen form** (historical artifacts are not rewritten).
- **Internal views** — the estimate editor totals and any internal builder breakdown still show markup explicitly. Markup is an internal pricing setting.
- **Seed + tests** updated to match (per AGENTS.md, the seed script must reflect schema/behavior changes).

## 4. Invoice detail page (`/invoices/[id]`)

- **Header** — `Invoice #N`, status badge, amount, due date.
- **Meta line** — customer name, address, sent-to email, "copy public link". (No "issued" label.)
- **Action row — status-driven:**
  - `draft` → **Send**, **Void**.
  - `sent` / `viewed` / `partial` → **Record payment**, **Resend**, **Void**, copy link.
  - `paid` → read-only + copy link (Void still technically possible but de-emphasized).
  - `void` → greyed, read-only, no actions.
- **Breakdown (main)** — read-only, marked-up line items + convenience fee, "Balance due" total. Labeled as derived from the estimate.
- **Payments (sidebar)** — Outstanding total, payment history (amount, method, date, reference), "+ Record payment".
- **Activity (sidebar)** — timeline from `invoiceEvents` (created / sent / viewed / payment recorded / voided) with timestamps and actor.

The `PATCH` route is intentionally unused — there is no edit affordance.

## 5. Send invoice dialog

Mirrors `SendEstimateDialog`'s modal shell.

- Fields: **To** (default = customer email), **Subject** (default `Invoice #N from {org}`). **No message field** (the cover note is carried on the invoice). **No "generate a new link" checkbox.**
- Send → freezes snapshot, emails customer, `draft → sent`. Toast on success.
- **Resend** (post-send) reuses the same dialog; the existing public token is reused.

## 6. Record payment dialog + Void

- **Record payment** — **Amount** (defaults to full outstanding, editable down for partials/deposits), **Method** dropdown (`check` / `cash` / `card` / `ach` / `other` — **`stripe` excluded**; reserved for the future integration), **Date** (default today), optional **Reference** and **Note**. Invoice auto-derives `partial` / `paid`. Toast on success; history + outstanding update.
- **Void** — small confirmation modal ("Void invoice #N? This can't be undone."). Terminal.

## 7. Testing

- **Unit (Vitest):** markup-folding helper and updated proration — exact rounding, reconciliation, markup-free output; invoice billing math. Gate any real-DB tests on `VITEST_DB_AVAILABLE`.
- **Component:** `InvoicesSection` (summary + list + empty state); create / send / record-payment dialogs — validation, disabled states, bill-by-mode behavior.
- **E2E (Playwright), mirroring `estimate-send.spec.ts` / `public-estimate-review.spec.ts`, fixtures in `tests/e2e/fixtures/`:**
  - `invoice-create.spec.ts` — create from an estimate in each bill-by mode; draft appears; lands on detail page; billing summary updates.
  - `invoice-send.spec.ts` — send → status `sent`.
  - `invoice-payment.spec.ts` — record partial → `partial`, then remainder → `paid`; void path.
  - `public-invoice-review.spec.ts` — public page renders marked-up lines with **no "Markup" line**.
  - Add a markup-not-visible assertion to `public-estimate-review.spec.ts` (estimate display changes).
  - Run with `--workers=1` locally to match CI and avoid known parallel-contention flakiness.
- `biome ci .` must pass clean.

## Out of scope

- Stripe / online card payments (the `payUrl` / `stripePaymentLinkUrl` plumbing already exists in the snapshot but no UI is added).
- Editing invoices.
- Bulk invoice actions or an org-wide invoices list (invoices are reached via their estimate).
