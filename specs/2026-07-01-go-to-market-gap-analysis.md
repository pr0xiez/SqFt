# SqFt Go-to-Market Gap Analysis — Ranked Feature Priorities

*Prepared 2026-07-01. Supersedes the priority ordering in
`specs/floorzap-competitor-roadmap.md` (2026-05-04), which predates the invoice,
email-delivery, approval-portal, settings, crew-roles and mobile-nav work that
has since shipped. This document re-baselines against what is **actually still
missing** as of today and ranks the gaps by their impact on winning and keeping
paying customers.*

---

## How SqFt stands today

**Already shipped (do not rebuild):** customer/location/site-measure/estimate/
invoice/payment chain, org-scoped multi-tenancy, per-org document numbering,
markup-folding estimate math, multi-invoice progress billing, email delivery of
estimates & invoices (Resend), a public one-click estimate-approval portal, a
public invoice-review portal, manual payment ledger, KPI dashboard with a
6-month revenue chart, a schedule manager + read-only mobile "My Schedule" crew
day view, members/roles (admin/lead/crew), and a responsive mobile nav.

That is a genuinely solid **quote-building** core. What is missing is most of
what happens **after the number is agreed** — getting paid, being legally
correct, and being fast enough that a contractor picks SqFt over pen-and-paper
or a competitor.

**Relative strengths to protect (don't regress):** SqFt's multi-invoice
proration already gives it **progress/partial billing off a single estimate** —
something the SMB tier (Joist, Jobber, Housecall Pro, ServiceM8, Kickserv) does
only as flat "deposits," and which only Buildertrend (draw schedules) and
ServiceTitan (milestone billing) do better. The markup-folding single-source-of-
truth math and the clean approval/invoice token portals are also ahead of the
low end (Invoice Simple, Joist). The gaps below are what turn that core into a
product a shop will pay for monthly.

## What the market treats as table stakes

- **Flooring-specific (MeasureSquare, RFMS/Cyncly, FloorWizard):** room takeoff
  with **waste/seam optimization**, a **product/material catalog** with cost &
  sell pricing, branded PDF bids/POs. MeasureSquare is explicitly "estimating +
  takeoff only, no CRM/payments" — it pairs *with* an ERP. SqFt's opportunity is
  to be the all-in-one a small flooring shop actually runs on.
- **General field-service (Jobber, Housecall Pro, ServiceTitan, JobNimbus):**
  **online card/ACH payments** (Housecall Pro's Instapay next-day deposit,
  Jobber Payments), **consumer financing**, **two-way SMS + automated
  reminders**, **"on-my-way" texts**, **e-signature on quotes**, **photo job
  documentation**, a **crew mobile app** with mark-complete + notes,
  **QuickBooks sync**, **review-request automation**, and **good/better/best**
  proposal tiers.
- **Accounting (QuickBooks, Square):** sales-tax computation and clean invoice
  PDFs are assumed, not sold.

Every serious competitor has online payments, tax, PDFs, e-signature and
QuickBooks. SqFt has none of those five yet. That is the headline.

---

## Ranked priorities

Ranking axis: **how directly does this unblock charging money, closing a deal,
or keeping a paying subscriber?** Tier 0 items are launch blockers; each tier
down trades some urgency for differentiation. Effort is a rough T-shirt size.

### Tier 0 — Cannot charge money / cannot be legally correct without these

**1. Sales tax on estimates & invoices** — *Effort: S · Blocker*
There is **no tax field anywhere in the schema** today. Material sales are
taxable in ~45 US states; a flooring invoice with no tax line is not a document
a contractor can legally hand a customer or their accountant. This is the
cheapest high-impact fix on the list: an org-level default rate + per-estimate
override, folded into `computeEstimateView`/`computeEstimateBilling` and every
customer-facing surface and PDF. Ship this first — everything below assumes
totals are tax-correct. *(Jobber, Housecall Pro, QuickBooks, FloorZap: all have
it.)*

**2. Online payments (Stripe) + optional financing** — *Effort: L · Blocker*
The single biggest reason contractors adopt these tools is **get paid faster**,
and it is also SqFt's own revenue lever (processing fees). The schema is already
Stripe-ready and the manual ledger exists; what's missing is Stripe Connect,
a "Pay online" CTA on the invoice-review portal, card/ACH capture, webhook →
`Payment` reconciliation, and an automatic receipt email. Expect to price near
market norms (~2.9% + $0.30 card, ~1% ACH). Pair with a consumer-**financing**
link: **Wisetack** is the de-facto contractor-financing standard (flat 3.9%,
$500–$25k, integrated into Jobber, Housecall Pro, JobNimbus, ServiceTitan) — a
single Wisetack integration matches the whole SMB tier at once. Flooring jobs
run $3k–$15k, exactly Wisetack's sweet spot, and financing measurably lifts
close rates. *(Housecall Pro Instapay next-day deposit, Jobber Payments; both
offer financing.)*

**3. Branded PDF for quotes & invoices** — *Effort: M · Blocker*
Customers, lenders and permit offices expect a **downloadable, branded PDF**;
FloorZap's demo is built around it. SqFt can currently only share a token web
link. Needs a print/PDF renderer (React-PDF or headless Chromium) driven off the
same snapshot the portal uses, with org logo/license/contact and a Quote vs
Invoice mode. Prerequisite for professional credibility and for #2's emailed
receipts. *(Every competitor has this.)*

### Tier 1 — Close-the-deal credibility & flooring speed

**4. E-signature on estimate approval** — *Effort: M*
Approval today is **anonymous one-click** — no name, no signature, no consent
text. Many states require a **signed** home-improvement contract above a dollar
threshold, so this is both a legal exposure and a trust gap. Add captured
name + typed/drawn signature + consent text + a tamper-evident snapshot hash
to the existing approval flow. *(Jobber, Housecall Pro, FloorZap all capture an
e-signature.)*

**5. Product/material catalog + flooring waste math** — *Effort: L*
Every line item is hand-priced today; there is no catalog and no material-type
waste presets. This is **the** flooring-specific differentiator and the biggest
estimate-speed lever: a per-org catalog (name, SKU, unit sqft/box/yard, **cost**
& **sell** price, default waste %) that line items are created from, plus
waste/seam factors by material. It also unlocks #7 (you can't compute margin
without cost). *(MeasureSquare & RFMS win on exactly this; FloorZap ships a
catalog.)*

**6. QuickBooks Online sync** — *Effort: L*
The **most-advertised integration in the whole category** and a hard
requirement for any contractor whose bookkeeper uses QBO — without it they
re-enter every invoice by hand. OAuth from settings, push invoices on
create/send, sync payment status back, map customers/tax. *(FloorZap's #1
advertised integration; Jobber & Housecall Pro both sync.)*

### Tier 2 — Retention & daily operations

**7. Real-time job costing & profitability** — *Effort: M (needs #5)*
Owners stay subscribed to tools that show them **which jobs make money**.
Add a labor line type (hours × rate) and a cost-vs-sell margin card on the
estimate and dashboard. Depends on catalog cost prices from #5. *(FloorZap
markets "real-time cost tracking" by name.)*

**8. Two-way SMS + automated reminders** — *Effort: M*
Delivery is email-only today; there is no Twilio. Text is Housecall Pro's
out-of-the-box differentiator and drives measurable lifts: **quote-approval,
invoice-payment, and appointment-confirmation** rates all rise with SMS, and
"on-my-way" texts cut no-shows. Add outbound SMS quote/invoice links + automated
reminders (quote expiring, invoice overdue, job tomorrow), then two-way threads
on the customer record. *(Housecall Pro, Jobber, ServiceTitan.)*

**9. Photo documentation + field crew workflow** — *Effort: M*
"My Schedule" is read-only; crew can't mark a job done, add notes, or attach
photos. Photos are **proof-of-work for disputes**, fuel upsells, and are core to
every field-service app. Add before/during/after photo upload (S3/R2), job
notes, and mark-complete to the crew view. *(Jobber, Housecall Pro, ServiceTitan
installer apps.)*

### Tier 3 — Differentiate & grow

**10. Review-request automation** — *Effort: S* — auto-ask for a Google review
after a job is marked paid/complete; a top growth feature in Jobber/Housecall Pro
and cheap to build once #8 exists.

**11. Reporting & CSV export** — *Effort: M* — revenue by period, margin
distribution, lead-source ROI, crew utilization, and a plain CSV export for
accountants. No export exists today.

**12. Estimate templates** — *Effort: S* — save a whole estimate (rooms +
lines) as a reusable template; only line-item templates exist now. Big
time-saver for repeat job types (LVP whole-house, carpet bedrooms).

**13. MeasureSquare import** — *Effort: M* — import room lists/dimensions from a
MeasureSquare export to kill double entry for shops that already own it.

**14. AI/embedded lead intake + "good/better/best" proposal tiers** —
*Effort: L* — a website chat/lead widget that drafts a customer+estimate, and
tiered pricing options on a quote (Housecall Pro's Sales Proposal tool). Longer
horizon, real differentiation.

**15. (Long horizon) Roll/seam optimization + plan-based takeoff** —
*Effort: XL* — the one thing a general estimate+invoice app **cannot** copy
cheaply and the true flooring moat: fitting rooms onto fixed-width carpet/vinyl
rolls, choosing seam locations to hide joints, matching patterns, and emitting
installer cut sheets, plus laser/AR/AI takeoff feeding material-specific waste
factors. This is what MeasureSquare and RFMS-Measure are built around and where
every horizontal tool (Jobber, Housecall Pro, ServiceTitan, QuickBooks) has
nothing. Not needed to launch, but it's the durable differentiator if SqFt wants
to beat the flooring incumbents rather than just the general field-service
tools. A faster interim path is a **MeasureSquare import** (#13) to borrow their
takeoff.

---

## Why this ranking — the buyer evidence

The order above is not just feature-parity checklisting; it tracks where the
quantified ROI actually is for a contractor:

- **Payments + financing is the highest-measured lever.** Offering financing
  correlates with **~4.5× larger jobs** and close rates rising **~38% → 49%**
  (Wisetack/ACCA data); embedded financing users report **30–45% bigger average
  tickets**. Invoices with an online-pay button are **paid up to 4× faster**,
  and online payments crossed **>50% of all Jobber transactions in 2025** —
  homeowners now *expect* to pay digitally. This is why #2 sits at the top of
  the money layer despite #1 (tax) being the legal prerequisite.
- **Speed-to-quote + e-sign wins deals.** "~50% of jobs go to whoever quotes
  first"; platform-based, e-signable quoting is cited at **+15–20% close rate**
  and **40–60% faster quotes** vs. paper/email. That is the case for PDF (#3)
  and e-signature (#4).
- **SMS + review requests drive the lead engine.** ~90% of texts are read within
  3 minutes; automated post-job review requests generate **~80% more reviews**,
  and reviews lift conversion **15–20%** and local-search visibility. That is
  the payoff behind #8 and #10.
- **Ease-of-use and predictable pricing are the retention moat.** The #1 small-
  contractor buying criterion and the #1 churn cause is mobile field usability;
  per-seat pricing and forced onboarding are top churn drivers. This argues for
  keeping the crew workflow (#9) genuinely simple and pricing flat — a
  positioning choice as much as a feature.

*(Buyer stats are largely self-reported vendor/industry figures — directional,
not peer-reviewed — but they converge consistently across independent sources.)*

## The one-paragraph answer

If the goal is to **charge money next quarter**, build in this order:
**(1) sales tax → (2) online payments + financing → (3) PDF export** to become
a legally-correct, get-paid product; then **(4) e-signature → (5) material
catalog + waste math → (6) QuickBooks** to be credible and fast enough to beat
the incumbents; then **(7) job costing → (8) SMS reminders → (9) crew photos/
mark-done** to keep the subscription from churning. Tax, payments, PDF,
e-signature and QuickBooks are the five things every competitor has and SqFt has
none of — they are the gate to go-to-market, in that order of urgency.

---

*Competitor facts drawn from vendor and comparison sources for MeasureSquare,
RFMS/Cyncly, Jobber, Housecall Pro, ServiceTitan and FloorZap (2025–2026).
Current-state facts verified against this repo's schema and `CONTEXT.md` on
2026-07-01.*
