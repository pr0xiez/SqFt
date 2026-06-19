# SqFt — Market Analysis & Go-to-Market Feature Roadmap

_Prepared 2026-06-19. Combines a read-only audit of the SqFt codebase with web
research on the flooring-software and contractor-FSM competitive landscape.
Pricing figures are directional — most vendor pages bot-block automated fetch,
so numbers come from review aggregators (Capterra, GetApp, SoftwareAdvice,
NerdWallet) and should be reconfirmed before being quoted externally._

---

## 1. Where SqFt sits today

SqFt has a genuinely strong **spine**: the Customer → Location → SiteMeasure →
Estimate → Invoice chain with single-source-of-truth estimate math
(`computeEstimateView`), a pure edit reducer, snapshot immutability on
send/approve, billing/proration math, a hardened send pipeline, role-scoped
multi-tenancy, crew scheduling, and mobile-responsive UI with token-gated
public review pages. That is a clean MVP — better-architected than most tools
in this market.

What it is **missing** is almost entirely the commercial surface that turns an
estimating app into something a contractor will pay for and a customer will act
on: no real payment processing, no binding e-signature, no flooring-specific
material/waste math, no photos, no PDF, no SMS, no accounting export.

## 2. The competitive map

Three tiers of competitor, and SqFt's opening is the gap between them:

| Tier | Examples | Pricing | Posture |
|---|---|---|---|
| **Dealer/retailer ERPs** | RFMS, QFloors, Comp-U-Floor, Broadlume/RollMaster | $55–$89/user/mo to low-thousands + $5k+ setup, mostly quote-only | Heavy: roll inventory, B2B vendor catalogs, built-in accounting. Slow to implement, overkill for installers. |
| **Takeoff/estimate specialists** | MeasureSquare, FloorRight | $49–$197/user/mo | Deep takeoff (seam plans, 3D, blueprint trace) but not billing/CRM platforms. |
| **Modern all-in-one + generic FSM** | **FloorZap**, Joist, Housecall Pro, Jobber, Contractor+, Markate | Free–$599/mo | Quote→invoice→pay→schedule. Generic FSM treats flooring as one vertical; **FloorZap** (~$399/mo + setup) is the closest direct competitor — native payments + e-sign + flooring box-rounding, but light on takeoff. |

**Positioning takeaway:** SqFt's wedge is a *lean, modern, transparently-priced
flooring app* — the FloorZap quadrant — with stronger estimate→invoice math than
the generic FSM tools and far faster onboarding/lower price than the ERPs. To
own that wedge it must close the table-stakes commerce gaps first, then add the
one or two flooring-specific differentiators that generic tools can't match.

## 3. Table-stakes every serious competitor ships (and SqFt lacks)

Online card **+ ACH** payments · deposits/progress billing · **e-signature on
estimates** · in-document **photos** · **QuickBooks** sync · **two-way SMS** +
automated follow-ups/review requests · customer self-service portal · PDF
documents · material/labor **catalog with pricing** · flooring **waste/box-roll
math**. Consumer **financing** (Wisetack, flat ~3.9%) is the most common
*differentiator* layered on top.

---

## 4. Ranked roadmap — what SqFt needs to go to market

Ranked by `(deal-blocking importance) × (leverage on close-rate / revenue) ÷
(effort given existing infrastructure)`.

### TIER 1 — Ship before charging money (hard deal-blockers, infra already close)

**1. Online payments + deposit collection (Stripe).**
The single highest-ROI item. Every competitor has it; its absence means the
customer can approve but not *pay*, and the contractor still chases checks. The
schema is **already Stripe-ready** — `Invoice.stripePaymentLinkUrl` /
`stripePaymentIntentId`, `Payment.stripeChargeId`,
`Organization.stripeConnectAccountId` / subscription fields all exist and the
record-payment UI deliberately reserves the `stripe` method. Wire Stripe Connect
+ webhooks so customers pay invoices **and the estimate deposit** from the public
review pages; let recorded payments flow into the existing live-balance ledger.
Market rates to plan against: ~2.9% + $0.30 cards, ~1% ACH.
_Effort: medium. The math, ledger, and snapshot plumbing already exist._

**2. Binding e-signature on estimate approval.**
Today approval is **one-click with no identity capture** — legally weak as a
contract. Joist, MeasureSquare, RFMS, QFloors (DocuSign), FloorZap, Contractor+
all capture a signature. Extend the existing approval flow (which already records
IP, user-agent, and an `EstimateApproval` snapshot) with typed/drawn signature +
signer name/email + consent text + timestamp. Pairs naturally with #1 to collect
the deposit at signing.
_Effort: low. Builds directly on the approval snapshot already captured._

**3. Flooring-specific material & waste math + priced material/labor catalog.**
This is what makes SqFt *flooring* software rather than generic invoicing, and
it targets the #1 margin pain point contractors cite (under-estimated waste,
omitted subfloor/underlayment/disposal). Today there are generic line items and
a flat waste-% on linked quantities, but **no priced material catalog, no
box/roll rounding, no multi-material handling** (carpet roll widths, LVP boxes,
tile pallets), no seam logic. Start with a priced material/labor catalog
(extend the existing line-item templates) and per-material waste + box/roll
rounding folded into `lib/estimateView/`. Seam/layout optimization is a later,
deeper play.
_Effort: medium–high, but it is the core vertical moat._

### TIER 2 — Fast follows that drive conversion & retention

**4. PDF export of estimates & invoices.** Snapshots are JSON-only today;
customers and contractors expect a downloadable/attachable PDF. Removes an
obvious "looks unfinished" objection. _Effort: low._

**5. Photos.** Capture at the SiteMeasure stage (room conditions, subfloor) and
job before/after, embedded in estimates/invoices. Standard in Joist,
Contractor+, MeasureSquare, RFMS; absent here. Needs blob storage (S3/Vercel
Blob). _Effort: medium._

**6. Two-way SMS + automated follow-ups & review requests.** SqFt is email-only;
SMS for document delivery, payment/viewing reminders, and post-job review
requests is now baseline (ServGrow, Broadlume Text-to-Pay, Housecall Pro,
Markate). Drives close-rate and reputation. Needs Twilio. _Effort: medium._

**7. QuickBooks export/sync.** The universally expected accounting integration;
eliminates the most-cited structural complaint — double entry. Begin with QBO
invoice/customer export, deepen to two-way later. _Effort: medium._

### TIER 3 — Differentiators that win deals & command premium (longer horizon)

**8. Consumer financing (Wisetack-style BNPL).** Strong close-rate lever — "say
yes to upgrades" — flat ~3.9% merchant fee, contractor paid up front, offered on
the estimate. Generic tools like Invoice Simple/QBO lack it; especially valuable
while high rates suppress flooring volume. Partner integration on the
estimate/invoice review pages. _Effort: medium (partner)._

**9. Lightweight CRM / lead pipeline.** SqFt stores a `leadSource` but has no
pipeline or follow-up — and "leads never get a call back" is a top complaint. A
simple board (lead → measure scheduled → estimate sent → won/lost) plus
follow-up reminders. _Effort: medium._

**10. AI / LiDAR-assisted measurement.** The 2025–26 moonshot: phone LiDAR room
scan → floor plan, or AI takeoff from an uploaded plan/PDF (auto room/door
detection). Highest ceiling, heaviest lift — consider a white-label SDK
(CubiCasa offers one) over building from scratch. Feeds the SiteMeasure stage.
_Effort: high; partner to de-risk._

---

## 5. Recommended sequencing

1. **Payments + e-signature + deposit-at-signing** (Tier 1, items 1–2) — turns
   SqFt into something that closes and collects money. Do these together.
2. **Flooring material/waste/catalog math** (item 3) — the vertical moat;
   start in parallel since it's the longest build.
3. **PDF + photos + SMS + QuickBooks** (Tier 2) — the "feels complete" layer.
4. **Financing, CRM, AI measurement** (Tier 3) — differentiation once the
   table is set.

The fastest credible GTM is **Tier 1 complete + PDF (item 4)**: at that point
SqFt is a genuinely sellable lean flooring quote→sign→pay tool competing
directly with FloorZap at a fraction of the price and onboarding cost.
