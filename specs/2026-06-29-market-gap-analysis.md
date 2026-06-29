# SqFt — Market Gap Analysis & Go-To-Market Feature Ranking

**Date:** 2026-06-29
**Question answered:** Scanning the flooring-contractor SaaS market, what are the best
features SqFt still needs to go to market — ranked by importance?

> Companion to `specs/floorzap-competitor-roadmap.md`, which is now partly stale:
> several of its "Priority 1" items have since shipped (email/text delivery of the
> public document, the token-authed approval & invoice portals, one-click
> estimate→invoice, the invoice/payment ledger, org settings, crew roles, PWA).
> This doc re-scans a wider competitor set and re-ranks **what remains**.

---

## Competitors scanned

| Product | Positioning / what they lead with |
|---|---|
| **QuoteIQ** | Mobile-first all-in-one: estimate→invoice, Stripe payments (card 2.9%+30¢, ACH, Apple/Google Pay, deposits, terms), scheduling, photo docs, review automation, AI quoting. ~$30/mo entry. |
| **Joist** | Simple estimate+invoice with online payments **and customer financing** baked into the invoice. |
| **FieldPulse** | Stripe in-field card capture, **text a payment link**, partial deposits, progress billing. |
| **Measure Square** | The flooring measurement moat: on-screen + **Bluetooth-laser** takeoff, material/labor assemblies, waste, on-site proposal + **signature**. |
| **Buildxact / STACK / On Center** | Plan-based takeoff with reusable material assemblies; "quote 5× faster." |
| **QFloors / FloorZap / Comp-U-Floor / Kronus** | Full flooring ERP: **product catalog + supplier integration**, QuickBooks sync, job costing, POs/WOs. |
| **ServiceTitan / Contractor+ / FieldVibe** | Field-service breadth: SMS reminders (cut no-shows ~80%), before/after photos, review requests, dispatch. |

**Recurring "everyone has it, we lead our demo with it" themes:** online payments &
online deposit collection, photos (before/after), real e-signature on approval, SMS,
a flooring product/pricing catalog, and QuickBooks sync.

---

## What SqFt already has (so we don't re-recommend it)

Estimate→invoice→schedule spine with single-source-of-truth math; room measurement
(rect/triangle, area + perimeter-linked qty, waste %, markup, deposit); line-item
**templates**; revision chains; token-authed **public estimate & invoice review
pages**; unified email **send pipeline** (Resend) with link rotation + audit trail;
**invoice/payment ledger** with proration, partials, void; quick-create launcher;
**KPI dashboard** (win rate, awaiting-signature, expiring-soon, booked-revenue pace);
roles (admin/lead/crew) + members admin; scheduling (manager grid + mobile My
Schedule, crew assignment, maps/call links); **PWA**.

That spine is genuinely strong — the gaps below are the commercial layer that turns
"a tool they try" into "a tool they pay for and can't leave."

---

## Ranked feature gaps to go to market

Ranked by: **market expectation (table-stakes vs. differentiator) × revenue/retention
impact × leverage given what's already built.** The top 3 are go-to-market blockers.

### 1. Online payments + online deposit collection (Stripe) — **#1, highest leverage**
The single biggest gap, and the lowest-effort high-impact one because the schema is
already Stripe-ready (`stripePaymentLinkUrl` / `stripePaymentIntentId`), the public
invoice page already has a pay-CTA slot, and the `Payment` ledger + status recompute
already exist. Today payments are recorded **manually** — customers can't pay online.
Every competitor leads with "pay before the crew leaves / text a payment link," and
**collecting the deposit online at estimate approval** is the cash-flow + conversion
unlock. Wire Stripe Checkout/Payment Links + a webhook → existing `Payment` ledger;
add "Pay" to the public invoice page and a "deposit due" CTA to the approval flow.
*Blocker. Build first.*

### 2. Photos & file attachments (site measures, jobs, estimates) — **#2**
Completely missing — no storage integration. Before/after photos are a top-cited
field-service feature and a sales/credibility tool; documenting the space on the site
measure and the job is universally expected. Add blob storage (Vercel Blob / S3-R2) and
attach to site measures (capture the space), estimates (show the product), and jobs
(before/during/after in the crew view). *Table stakes; moderate effort (new storage dep).*

### 3. Real e-signature on estimate approval — **#3**
Approval is currently **one-click with no name, email, signature, or consent text**
(only IP/UA are captured). Competitors capture a typed/drawn signature + name + consent
on the proposal. This is cheap (the approval snapshot row already exists — add
name/email/signature/consent fields) and buys outsized professional + legal trust.
*Table stakes; low effort, high trust.*

### 4. SMS / text notifications (payment + approval links, reminders) — **#4**
No SMS today. "Text the customer a payment/approval link" pairs directly with #1/#3, and
appointment reminders cut no-shows ~80%. Add a Twilio adapter alongside the existing send
pipeline; reuse the same token URLs. Note the 10DLC registration overhead. *High ROI;
pairs with #1.*

### 5. Flooring product / material **pricing catalog** (with waste) — **#5, the vertical moat**
SqFt only has freeform line-item **templates** — not a real catalog. Flooring competitors
center on a product/pricing book (hardwood / LVP / tile / carpet) with material + labor
**assemblies**, default waste %, and unit, so a quote is a few taps. Promote templates into
a catalog with cost + sell price (also unlocks job costing, #9). *The differentiator that
makes SqFt "flooring software," not "generic invoicing."*

### 6. QuickBooks Online sync — **#6**
Missing, and the most-cited "deal-decider" integration for established contractors —
eliminates double entry of customers, invoices, and payments. OAuth from settings; push
invoices/payments to QBO, map customers/line items/tax. *Table stakes for switchers;
integration-heavy.*

### 7. Automated lifecycle reminders / nudges — **#7, cheapest quick win**
The dashboard already computes the signals (expiring-soon, awaiting-signature, sent-but-
unviewed, payment-due) — they just aren't actioned. Turn them into scheduled email/SMS
nudges. Directly lifts win rate and collections with near-zero new infrastructure once #4
exists. *Punches above its rank on effort-to-value — consider pulling forward.*

### 8. Customer **reviews / reputation** automation — **#8**
Auto-request a Google review after a job is marked complete. QuoteIQ/Contractor+ market
this as a growth engine; it compounds lead-gen for contractors who live on word-of-mouth.

### 9. Job status workflow + **time tracking → job costing / profitability** — **#9**
Jobs are calendar events only — no scheduled→in-progress→complete states, no labor hours.
Add a status workflow + time logging, then a cost-vs-revenue / margin view per job (builds
on the #5 catalog cost prices). Competitors market "real-time job costing" prominently.

### 10. Customer **financing** (Wisetack / Hearth) — **#10**
A "finance this" button on big-ticket flooring proposals raises average ticket and close
rate; Joist bakes it into the invoice. Lighter lift than QBO (embed a partner). Growth
lever, not a blocker.

### 11. Calendar sync (Google / iCal / Outlook) — **#11**
Crews live in their phone calendars; one-way iCal feed per user is a small, expected
convenience.

### 12. Lead / CRM pipeline — **#12**
`Customer.source` is already tracked; add lead stages + follow-up tasks so slow-season
re-engagement and pipeline visibility exist. Useful, not urgent for the core ICP.

### 13. Visual / laser takeoff (Measure Square-class) — **#13, long-term moat**
On-screen plan takeoff + Bluetooth-laser measuring is the strongest flooring
differentiator but by far the heaviest lift. Park as a long-term R&D bet, not a launch gate.

---

## TL;DR sequencing

- **Launch blockers (do first):** 1 Online payments/deposits → 2 Photos → 3 e-signature.
- **Fast follow (retention + the vertical moat):** 4 SMS → 5 Product catalog → 7 Reminders
  (cheap, pull forward) → 6 QuickBooks.
- **Growth:** 8 Reviews, 9 Job costing, 10 Financing, 11 Calendar sync, 12 CRM.
- **Long-term moat:** 13 Laser/visual takeoff.

**Why this order:** #1 is both the biggest gap *and* the lowest-effort high-impact one
(schema already Stripe-ready). #2/#3 close the remaining table-stakes credibility gaps
cheaply. #5 is what makes SqFt defensibly *flooring* software. Everything below #7 is
upside, not a gate to charging money.
