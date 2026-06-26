# SqFt Go-to-Market Feature Ranking (June 2026)

**Question answered:** Based on the 2026 flooring-software market, which features does
SqFt most need to go to market — ranked in order of importance?

**Method:** Competitor scan (field-service CRMs, flooring ERPs, takeoff specialists)
cross-referenced against SqFt's *current* build state. This **supersedes the ranking in
`floorzap-competitor-roadmap.md`** (dated 2026-05-04), which is now stale — most of its
Priority 1–2 has since shipped (token approval, multi-invoice billing + partial payments,
Resend email delivery, estimate templates, roles/Members, mobile schedule views).

---

## The competitive landscape (2026)

The market splits into three lanes:

| Lane | Players | Optimizes for |
|------|---------|---------------|
| **Field-service CRMs** | QuoteIQ, Jobber ($39+), Housecall Pro ($59+), ServiceTitan, FieldCamp | quote → dispatch → invoice → pay, mobile-first |
| **Flooring ERPs** | RFMS, QFloors, FloorZap ($399/mo) | dealer ops: roll inventory, commissions, fcB2B, cut lists |
| **Takeoff specialists** | MeasureSquare ($99–199/user), Beam AI | on-site measurement, digital floor plans, waste/seam layout |

SqFt sits in the **field-service-CRM lane, flooring-flavored** — closest to FloorZap/QuoteIQ.
That lane's table stakes for 2026 are clear from every comparison: **online payment from the
invoice, accounting sync, customer financing, and speed-to-quote.** SqFt has the quote-to-
invoice spine but stops at the point where money actually moves.

## SqFt today — what's built vs. what's missing

- ✅ Estimating core (room measures, line items, markup/fee/deposit, one source-of-truth math)
- ✅ Customer-facing estimate approval (token page, **one-click, no e-signature**)
- ✅ Invoicing: multiple per estimate, partial payments, snapshots, org-wide list
- ✅ Email delivery (Resend), scheduling, roles/multi-tenant, estimate templates
- ⚠️ **Stripe: schema fully scaffolded** (`stripeConnectAccountId`, `stripePaymentLinkUrl`,
  `stripePaymentIntentId`, `card`/`ach`/`stripe` payment methods) **but not executed** —
  payments are a manual ledger only
- ❌ PDF export (`@react-pdf/renderer` is in `package.json` but imported nowhere)
- ❌ Customer financing · QuickBooks sync · product/material catalog · cost-based job costing
- ❌ Photo documentation · e-signature · two-way SMS · review automation
- ❌ AI/photo/LiDAR fast takeoff (measurement is manual rectangles) · lead intake/CRM pipeline

---

## Ranked features (1 = most important to ship to go to market)

### 1. Online card/ACH payments (execute the Stripe scaffold)
**Why #1:** Table stakes. Every CRM-lane competitor lets a customer pay from the invoice;
a manual payment ledger is a non-starter for charging a subscription. It's also the **highest
leverage-to-effort item SqFt has** — the schema, payment-method enum, and snapshot/ledger flow
are already built; this is wiring a Stripe Connect checkout + webhook into a "Pay online" button
on the existing `/invoice-review/[token]` page and auto-recording the payment. Closes the
quote-to-**cash** loop that defines a tool contractors pay for.

### 2. Customer financing ("apply & pay over time")
**Why #2:** Pure revenue lever, and largely a thin integration. Per FloorZap's 2026 retail
report, **80% of flooring retailers now offer financing**; it raises close rate and average
ticket size — the single most persuasive adoption argument you can make to a contractor.
Implement as a Wisetack/Hearth "apply for financing" link on the public estimate/invoice.
Low-to-moderate effort, outsized GTM pull, and most direct CRM competitors *don't* bundle it.

### 3. QuickBooks Online sync
**Why #3:** The #1 documented reason contractors switch or churn from field-service tools is
double-entry into accounting. "Just having an integration isn't the story — how much manual
re-keying it removes is." FloorZap's #1 advertised integration. Higher effort (OAuth + customer/
item/tax mapping, push invoice on send, sync payment status back) but a known dealbreaker for
any business past a couple employees. Build directly on the invoice snapshot + payment ledger.

### 4. Branded PDF quote/invoice export
**Why #4:** Cheap, expected, and currently absent despite the dependency being installed.
Contractors need a downloadable/printable branded document for customers who won't use the
portal, for permits, for financing apps, and for their own records. Reuse the public-estimate /
invoice-snapshot render through `@react-pdf/renderer`; attach to the existing Resend send.
Low effort, removes an obvious "looks unfinished" objection in demos.

### 5. Faster on-site measurement → takeoff (MeasureSquare import first, AI/photo later)
**Why #5:** Speed-to-quote is the headline 2026 differentiator (photo-to-estimate in <60s,
LiDAR room scan, auto waste/seam). SqFt's manual rectangle entry is its weakest link versus
MeasureSquare and Beam. Full AI takeoff is a large lift — so **start with a MeasureSquare import**
(map an exported room list straight into a SiteMeasure) to kill double data-entry, then layer
photo/LiDAR capture. High differentiation; sequence the cheap import win before the AI build.

### 6. Product/material catalog + cost-based job costing & margin
**Why #6:** Flooring-specific stickiness. A per-org price book (LVP/carpet/tile/hardwood with
unit, cost, sell, waste default) lets reps quote consistently and — by adding a **cost** alongside
the existing internal `markupPct` — surfaces real margin $ / margin % per estimate. Builds
straight onto the current line-item + markup model. FloorZap markets "real-time job costing"
prominently; it's the feature that turns SqFt from a quote pad into a profitability tool.

### 7. Photo documentation (estimate + job, before/during/after)
**Why #7:** Field reality and dispute/marketing/insurance backstop. Attach photos to estimates
and schedule events, captured from the mobile camera; surface them in the My Schedule job card.
Moderate effort (R2/S3 storage + upload UI). Expected in every installer-facing app.

### 8. E-signature + consent on estimate approval
**Why #8:** SqFt's approval is explicitly signature-less. A captured signature + timestamp +
consent text materially strengthens contract enforceability and "looks legit" to customers.
**Low lift** — it extends the existing token approval flow and `EstimateApproval` record rather
than adding a subsystem. High trust-per-effort.

### 9. Two-way SMS + automated reminders
**Why #9:** Contractors and their customers live in text. Twilio-backed SMS tied to the customer
record, plus automated reminders (quote expiring, job tomorrow, invoice overdue), lifts approval
and payment conversion and cuts no-shows. Moderate effort; recurring value once built.

### 10. Review / reputation automation
**Why #10:** Cheap growth lever competitors bundle. Auto-request a Google review after a job is
marked complete. Low-to-moderate effort, compounding top-of-funnel benefit. Pairs with #9's SMS.

### 11. Lead intake / CRM pipeline (web lead form, optional AI intake)
**Why #11:** SqFt's record chain starts at an existing Customer — there's no top-of-funnel
capture. An embeddable web lead form (and later an AI/voice intake à la FloorZap "ZapAssist")
that creates a customer + draft estimate widens the market beyond contractors who already track
leads elsewhere. Differentiator tier; valuable but not blocking the first paid customers.

### 12. Advanced analytics & reporting
**Why #12:** Revenue trend, margin distribution, lead-source ROI, crew utilization, CSV export.
Real but a retention/upsell feature, not an acquisition one — most useful once #1–6 are
generating the underlying payment/cost data. Polish tier.

---

## Tiered summary

| Tier | Rank | Theme | One-line rationale |
|------|------|-------|--------------------|
| **Ship to charge money** | 1–4 | Online payments, financing, QuickBooks, PDF | Table stakes + revenue; closes quote-to-cash |
| **Win the deal** | 5–8 | Fast takeoff, catalog/job-costing, photos, e-sign | Speed, profitability, trust, field reality |
| **Grow & differentiate** | 9–12 | SMS, reviews, lead intake, analytics | Funnel + retention once the loop is paying |

**If only three things ship before launch: #1 (payments), #2 (financing), #3 (QuickBooks).**
They are, in order, the table-stakes gate, the strongest revenue/close-rate argument, and the
top churn-preventer — and #1 is mostly already scaffolded.

---

## Sources

- [QuoteIQ — Top 8 Flooring Softwares 2026](https://myquoteiq.com/top-8-softwares-for-flooring-businesses-in-2026/)
- [QuoteIQ — Best Estimating Software for Flooring 2026](https://myquoteiq.com/best-estimating-software-flooring-2026/)
- [TileForeman — Best Tile Estimating Software 2026 (comparison)](https://tileforeman.com/blog/best-tile-estimating-software-2026)
- [SoftwareAdvice — MeasureSquare profile & pricing](https://www.softwareadvice.com/construction/measuresquare-profile/)
- [Beam AI — Flooring Takeoff Software](https://www.ibeam.ai/subcontractors/flooring)
- [Joist — Flooring Estimates, Invoices & Payments](https://www.joist.com/trades/flooring-estimating-and-invoicing-app/)
- [Hearth — Contractor Estimating, Invoicing & Financing](https://gethearth.com/)
- [FloorZap — Flooring Management & Estimating Software](https://www.floorzap.com/)
- [FieldCamp — AI Flooring Software](https://fieldcamp.ai/industries/flooring/)
- [BuildOps — Field Service Software with QuickBooks](https://buildops.com/resources/field-service-management-software-compatible-with-quickbooks/)
- [Lexul — Comparing QuickBooks Integrations in FSM](https://www.lexul.com/comparing-10-quickbooks-integrations-in-field-service-software/)

*Last updated: 2026-06-26. Based on a fresh competitor scan + audit of SqFt's current build state.*
