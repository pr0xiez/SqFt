# SqFt — Go-to-Market Feature Analysis

_Competitive scan + gap analysis, ranked by importance for launch. Prepared 2026-06-22._

## TL;DR

SqFt is **not starting from zero**. The hard, defensible core is already built and is
genuinely good: a single-source-of-truth estimate engine (`computeEstimateView`,
markup folding), invoice proration/billing math, full estimate & invoice lifecycles
with audit trails, org multi-tenancy, role-gated scheduling, members management, and a
KPI dashboard. Most competitors get the *math* wrong; SqFt gets it right.

The gaps that block go-to-market are at the **edges** — getting paid, producing a
document, closing the deal, and talking to the customer — not the core. That's the good
news: the highest-impact items are also the lowest-effort, because the scaffolding
(Stripe fields, a "Download PDF" button, approval capture) is already in the schema and
UI, just not wired up.

The market splits into two camps, and SqFt should pick a lane:

- **Flooring-specific tools** (MeasureSquare, RFMS, Comp-U-Floor, Floor16) — deep
  takeoff/measurement, seam/waste optimization, but weak or absent CRM/invoice/scheduling
  business layer. MeasureSquare is ~$149/user/mo and is *a tool, not a system*; shops
  bolt it onto something else.
- **Horizontal field-service platforms** (Jobber, Housecall Pro, ServiceTitan, Joist,
  JobNimbus) — excellent CRM/quote/schedule/invoice/payments, but **no flooring-specific
  outputs** (no seam diagrams, sheet-vinyl waste, room-linked takeoff).

**SqFt's wedge:** the *only* product that pairs flooring-native, room-linked
square-foot/lineal-foot estimating with a clean, correct business platform — at SMB
price/simplicity. To occupy that wedge it must first clear the field-service table stakes
(Tier 1), then lean into the flooring-native differentiators (Tier 2/3) that the
horizontal players can't easily copy.

---

## Ranked feature roadmap

### Tier 1 — Transaction-ready (hard launch blockers)

You cannot credibly sell a quote-to-cash product to a contractor without these. Every
competitor in both camps has them.

**1. Wire up online payments (Stripe) + deposit collection** — _highest ROI_
- **Why #1:** "Get paid faster" is the single biggest selling line for Joist, Jobber, and
  Housecall Pro. Today SqFt only *records* payments manually. Customers can't click "Pay"
  on the invoice-review page.
- **Leverage:** the framework is already in the schema and UI — `stripePaymentLinkUrl`,
  `stripePaymentIntentId`, `stripeChargeId`, `stripeConnectAccountId`, and the "Pay
  invoice" button on the public page. This is *finishing*, not *building*. Highest
  impact-to-effort ratio in the whole list.
- **Scope:** Stripe Connect onboarding per org, payment intent on the invoice-review
  page, webhook → `recordPayment` in the ledger (the live-balance math already handles
  partials), and deposit capture at estimate approval.

**2. Branded PDF generation for estimates & invoices**
- **Why:** Every competitor outputs a polished, downloadable/printable/attachable PDF.
  SqFt's "⤓ Download PDF" button exists but does nothing. Contractors expect a PDF to
  text/email and homeowners expect one to keep. Table stakes.
- **Leverage:** the marked-up, markup-folded view models already exist; this is a render
  target (print CSS or server-side render) over data that's already computed.

**3. E-signature on estimate approval**
- **Why:** "Sign and close before you leave the driveway" is the core pitch of ArcSite,
  PandaDoc, Jobber. SqFt captures one-click approve + IP/userAgent but **no signature and
  no tamper-evident snapshot hash**. This is both a conversion lever and legal defensibility.
- **Leverage:** the approval snapshot + audit event plumbing already exists; add typed/drawn
  signature capture, an agree-to-terms checkbox, and a hash on the frozen snapshot.

**4. Sales-tax handling on estimates & invoices**
- **Why:** A correctness/compliance gate, not a nicety. Most US flooring jobs are taxable
  (materials, sometimes labor) and SqFt currently has **no tax field at all**. You cannot
  issue a compliant invoice in most states without it. Quiet but real blocker.
- **Scope:** org-level tax rate(s), per-line taxable flag (materials vs. labor differ by
  state), tax line in `computeEstimateView` / `prorateInvoice`. Keep it in the
  single-source-of-truth math, not the React layer.

### Tier 2 — Win and keep customers (conversion & retention drivers)

These move close rates, average ticket, and cash collection. They're what makes a
contractor *switch* once the table stakes are met.

**5. Automated customer communications — SMS + reminders + review requests**
- **Why:** This is the loudest theme across Podium, DripJobs, Builder Prime, Jobber,
  Housecall Pro: appointment reminders, "you have an estimate waiting" follow-ups,
  overdue-invoice dunning, and **automated Google-review requests after job completion**.
  SqFt has transactional email only — no SMS, no scheduled reminders, no review asks.
- **Impact:** directly lifts estimate close rate and shortens days-to-payment; review
  automation compounds into lead generation.
- **Scope:** add an SMS provider (Twilio) alongside Resend, and a lightweight scheduled-job
  layer for reminder/follow-up/dunning sequences keyed off estimate/invoice lifecycle events.

**6. Good-better-best estimate options / tiers**
- **Why:** A proven flooring sales tactic — present Basic / Upgraded / Premium packages to
  raise average ticket and close rate *without discounting*. SqFt estimates are
  single-option today.
- **Leverage:** the estimate draft reducer and view math are clean; tiers are an extension
  of the existing line-item model plus a selection on the review page.

**7. Field photo capture — site-measure photos + before/after galleries**
- **Why:** Flooring is visual. Site-condition photos at measurement and before/after at
  completion are standard in the field-service apps and are pure differentiation for a
  flooring-native tool. SqFt has **no photo/attachment storage anywhere** despite a
  mobile-first My-Schedule view.
- **Scope:** image upload/storage tied to SiteMeasure, Event, and job records; mobile
  camera capture; gallery on the customer-facing pages.

### Tier 3 — Operational depth & defensible moat (post-launch, expansion)

These deepen the platform and build the flooring-native moat the horizontal players can't
cheaply copy.

**8. Accounting export — QuickBooks Online (then Xero)**
- **Why:** Table stakes for *established* contractors; eliminates double entry and is a
  common deal-qualifier in RFPs. Less urgent for the solo/owner-operator entry segment,
  which is why it's Tier 3 rather than Tier 1.

**9. Job status tracking + time tracking + job costing/profitability**
- **Why:** Turns SqFt from a quote-to-cash tool into an operations platform. Job lifecycle
  beyond estimate-approved (scheduled → in-progress → complete → warranty), crew clock-in,
  and budgeted-vs-actual profitability dashboards. "See your real margin per job" is a
  strong upmarket selling point (FOUNDATION, JobTread, ServiceTitan all lead with it).
- **Leverage:** scheduling, assignees, and the dashboard KPI infrastructure already exist
  to build on.

**10. Flooring-native takeoff: AI photo / LiDAR room scan → estimate** — _the moat_
- **Why:** The defining 2026 differentiator. MeasureSquare Room Scanner, SimplyWise,
  ArcSite, CamPlan all push "scan a room, get a priced takeoff before leaving the home."
  SqFt already has the rare half nobody else nails — **room-linked square-foot/lineal-foot
  line items with waste factors feeding the estimate math**. Bolting LiDAR/photo capture
  onto that existing room→line-item link, plus seam/waste optimization, is how SqFt becomes
  *the* flooring tool rather than a generic FSM app. Highest ceiling, highest effort —
  deliberately last, but the long-term wedge.

---

## Strengths to protect (don't regress these while shipping the above)

- Correct, single-source-of-truth estimate & invoice math (markup folding, proration,
  penny-rounding, overbill guard) — competitors routinely get this wrong.
- Clean lifecycle + immutable audit trails (EstimateEvent / InvoiceEvent / Payment ledger).
- Strict org multi-tenancy with cross-org FK validation and cascade-delete financial guards.
- Room-linked quantity model (LinkedArea / LinkedPerimeter + waste%) — the flooring-native
  hook most horizontal tools lack.
- Role-gated scheduling with a genuinely mobile-first crew view.

---

## One-line recommendation

Ship **Tier 1 (payments → PDF → e-sign → tax)** to be sellable at all, ride **Tier 2
(SMS/reminders/reviews → tiered options → photos)** to win switchers, then invest in
**Tier 3 (#10, scan-to-estimate)** to make the flooring-native advantage a moat. The
ordering is deliberately weighted by impact-per-unit-effort: the first three Tier-1 items
are mostly *finishing scaffolding that already exists*.

---

## Sources

- [7 Best Flooring Estimating Software Picks for 2026 — Exayard](https://exayard.com/blog/best-flooring-estimating-software)
- [Top 8 Softwares For Flooring Businesses In 2026 — QuoteIQ](https://myquoteiq.com/top-8-softwares-for-flooring-businesses-in-2026/)
- [Top 10 Best Flooring Management Software of 2026 — Gitnux](https://gitnux.org/best/flooring-management-software/)
- [MeasureSquare — Software Advice profile](https://www.softwareadvice.com/construction/measuresquare-profile/)
- [Measure Desktop: Flooring estimation & 3D visualization — Cyncly/RFMS](https://www.rfms.com/solutions/measure/)
- [Room Scanner LiDAR for Flooring Quotes — Measure Square](https://measuresquare.com/room-scanner-3d-lidar-scanning-app-measuring-tool/)
- [LiDAR Room Scanner App for Contractors (2026 Guide) — SimplyWise](https://www.simplywise.com/blog/lidar-room-scanner-app-for-contractors/)
- [Best Estimating App for Flooring Contractors: 10 Picks 2026 — SimplyWise](https://www.simplywise.com/blog/best-estimating-app-flooring-contractors/)
- [We Tested the Best Field Service Software Tools — Inc.](https://www.inc.com/sambecker/we-tested-the-best-field-service-software-tools-heres-how-jobber-servicetitan-and-others-rank/91345084)
- [HouseCall Pro vs Jobber vs ServiceTitan — ContractorPlus](https://contractorplus.app/blog/housecall-pro-vs-jobber-vs-servicetitan)
- [#1 Estimate, Invoice, Payment App for Contractors — Joist](https://www.joist.com/)
- [Best Estimate & Invoice Software for Contractors 2026 — Joist](https://www.joist.com/blog/best-contractor-invoicing-software/)
- [Flooring Software & CRM for Contractors — Builder Prime](https://www.builderprime.com/industries/flooring)
- [Best CRM for Flooring Contractors — DripJobs](https://dripjobs.com/flooring-business-crm)
- [Best Flooring Software — Jobber](https://www.getjobber.com/industries/flooring-software/)
- [How to Price Flooring Jobs: 7 Steps — Jobber Academy](https://www.getjobber.com/academy/flooring/how-to-price-flooring-jobs/)
- [Flooring Installation Proposal Template — PandaDoc](https://www.pandadoc.com/flooring-installation-and-repair-proposal-template/)
- [Job Costing Software — ServiceTitan](https://www.servicetitan.com/features/job-costing-software)
- [Construction Estimating & Project Management — JobTread](https://www.jobtread.com/)
- [Floor Plans for Contractors — ArcSite](https://www.arcsite.com/blog/floor-plan-vs-floor-plan-for-contractors-what-to-include)
