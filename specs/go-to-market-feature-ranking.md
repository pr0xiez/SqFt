# SqFt — Go-to-Market Feature Ranking

**Question answered:** Against the flooring / field-service software market, what are the best
features SqFt needs to go to market — ranked by importance?

**Method:** Audited the current codebase (what's actually built today), then compared against the
2026 competitive set — MeasureSquare, RFMS, FloorZap, Jobber, Housecall Pro, Buildertrend — and
the recurring "must-have" lists in 2026 buyer's guides. This supersedes the prioritization in
`floorzap-competitor-roadmap.md` (2026-05-04), much of whose Priority 1–2 has since shipped.

*Last updated: 2026-06-17.*

---

## What SqFt already has (so we don't re-rank shipped work)

The estimating core and most of the *workflow* loop are built:

- Customer → Location → SiteMeasure → Estimate → Invoice → Payment chain, org-scoped
- Room measurement + area/perimeter math, line items, waste factor, markup, deposit, convenience fee
- Line-item templates; estimate single-source-of-truth math + draft reducer
- **Email delivery** (Resend), **token-authed customer review pages**, **one-click approval**,
  **estimate → invoice** conversion, proration, partial **manual** payment recording, void
- Calendar / Schedule Manager + read-only mobile **My Schedule** for crew
- Roles (admin/lead/crew), member management, workspace/branding settings, pipeline dashboard
- Mobile-responsive nav (SideNav + MobileTabBar)

The gap is no longer "build the workflow." It's **the money rails, the professional document,
the flooring-specific estimating depth, and the field/communication layer.**

---

## The ranking (most → least important to go to market)

Importance = *how directly it blocks a contractor from paying us and winning deals.* Tier 0 items
are revenue-blocking table stakes; Tier 2 are differentiators you can launch without.

### Tier 0 — Must-have to charge money (the revenue loop dead-ends without these)

**1. Online payment collection (Stripe card + ACH).** *Highest ROI — schema is already
prepped (`stripePaymentIntentId`, `stripeConnectAccountId`, `Payment.stripeChargeId`).* Today
the loop ends at "record a manual check." Every direct competitor — Jobber, Housecall Pro,
FloorZap — takes card/ACH/digital-wallet online, with a "Pay Online" button in the invoice and an
auto-receipt. This is the single feature that converts SqFt from a quoting tool into a
quote-to-*cash* product. Build a Stripe (Connect) "Pay Online" button into the existing
`invoice-review/[token]` page and auto-record the Payment.

**2. Branded PDF for estimates & invoices.** There is no PDF generation engine today.
Contractors expect a downloadable/attachable, print-ready, logo'd document with license #, rooms,
line items, deposit, tax, totals. It's the artifact in every competitor demo and what customers
forward to a spouse/landlord. Required for professional perception and for email attachments.

**3. E-signature on approval.** Approval is currently one button click with no signature
capture. Housecall Pro, Jobber, MeasureSquare (on-site signing), and FloorZap all capture a
signature for closing weight and dispute protection. Small lift on top of the existing approval
flow (capture signature image + timestamp into the approval snapshot).

### Tier 1 — Table-stakes parity to win deals and retain

**4. QuickBooks Online sync.** Repeatedly cited as the #1 advertised integration and a hard
buying requirement for any growing contractor — they will not switch off QBO. OAuth from settings,
push invoices on send, sync payment status back, map customers/line items. Larger lift, but it
gates the mid-market.

**5. Materials/product catalog + real-time job costing / margin.** The flooring-specific
differentiator *and* what makes quoting fast and profitable. Competitors (MeasureSquare, RFMS,
QFloors) center on product catalogs with cost/sell/waste and B2B supplier pricing; "real-time cost
tracking / job costing" is a named FloorZap feature. SqFt has markup but **no cost basis**, so it
can't show margin $ / %. Build a per-org `Product` catalog (cost, sell, unit, waste default) →
line items from catalog → per-estimate cost-vs-revenue/margin card. This is the biggest
*flooring-native* lever and pairs naturally with later supplier-catalog integration.

**6. Photo documentation + field-crew completion.** My Schedule is read-only; crews can't
upload before/after photos, add job notes, or mark a job complete. Installer apps with photo
capture are standard (Jobber, Housecall, FloorZap installer apps). Add a `Photo` model (S3/R2),
mobile camera upload, and a "complete job + notes" action to the field view.

**7. Automated reminders + two-way SMS.** No automated comms today. Quote-expiring,
invoice-overdue, and job-tomorrow reminders drive close rate and collections; two-way SMS tied to
the customer record is core to how Jobber/Housecall operate. Twilio + a `Message` thread on the
customer.

### Tier 2 — Differentiators (launch without them; add to pull ahead)

**8. Consumer financing at point of sale (Wisetack).** Both Jobber and Housecall integrate
Wisetack to finance big tickets. Flooring jobs are large-ticket, so point-of-sale financing
materially lifts close rates — a high-leverage "Apply for financing" button in the customer
portal once payments exist.

**9. Smartphone takeoff / visual quoting.** MeasureSquare's actual moat: phone-camera floor
plans → automatic cut lists, seam optimization, roll allocation; plus 3D room visualizers for
in-home sales presentations. High effort, high differentiation, and the category's premium tier —
not required to launch, but the long-term reason to win against generic field-service tools. A
pragmatic first step is a **MeasureSquare import** (rooms + dimensions) to eliminate double entry.

**10. Reporting/analytics, Zapier/webhooks, change orders, global search & notifications,
audit-log UI, inventory.** Platform health and BI. Valuable for retention and larger orgs, but
none of them block the first paying customer; sequence them after Tier 0–1.

---

## One-line summary

Ship **online payments + branded PDF + e-signature** to be able to charge at all; then
**QuickBooks + product catalog/job-costing + field photos/SMS** to win and keep flooring
contractors; treat **financing + camera takeoff/visualizer** as the differentiation that pulls
ahead of generic competitors.

---

## Sources (competitive research)

- MeasureSquare — flooring takeoff/estimating, on-site signing, CRM, camera floor plans, seam
  optimization: <https://measuresquare.com/> , <https://measuresquare.com/product/crm/>
- RFMS — ERP-scale flooring dealer suite (inventory, fcB2B, commissions):
  <https://www.softwareadvice.com/construction/flooring-estimating-comparison/>
- Jobber vs Housecall Pro (payments, financing via Wisetack, e-signature, QuickBooks, scheduling,
  CRM): <https://www.getjobber.com/comparison/jobber-vs-housecall-pro/>
- Consumer financing comparison (Wisetack at point of sale):
  <https://korekomfortsolutions.com/consumer-financing-which-app-helps-you-close-big-tickets-jobber-vs-housecall-pro/>
- 2026 flooring software must-haves (catalog, job costing, QBO/Xero, B2B supplier catalogs,
  visualization, mobile): <https://www.europeanbusinessreview.com/the-ultimate-guide-to-flooring-contractor-software-in-2026-stop-guessing-start-scaling/>
- Flooring estimating software roundups:
  <https://www.simplywise.com/blog/best-estimating-app-flooring-contractors/> ,
  <https://myquoteiq.com/top-8-softwares-for-flooring-businesses-in-2026/>
