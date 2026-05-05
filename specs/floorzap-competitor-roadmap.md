# SqFt → FloorZap Competitor Roadmap

**Goal:** Close the gap with FloorZap — a $399/mo flooring-specific SaaS — by building the
quote-to-cash workflow, customer-facing features, integrations, and mobile experience that
separate a tool contractors pay for from a tool they abandon.

**Current state:** SqFt has a solid estimating core (room measurements, area math, line items,
pipeline dashboard, calendar) but is missing everything that comes after the quote is built.
FloorZap's moat is the full revenue loop: estimate → digital approval → invoice → payment →
QuickBooks. That is what this roadmap targets first.

---

## Priority 1 — Close the Revenue Loop (must-have to charge money)

These are the features without which no contractor will pay a subscription.

### 1.1 PDF Quote / Invoice Generation
- Generate a professional, branded PDF from any estimate
- Include company logo, license number, contact info
- Show rooms, line items, pricing breakdown, tax, deposit, totals
- Support "Quote" vs "Invoice" mode on the same document
- Print-friendly layout; downloadable from the estimate page
- **FloorZap equivalent:** their estimate/invoice PDF is central to their demo

### 1.2 Email & Text Quote Delivery
- Send quote PDF directly to customer via email from inside the app
- Subject/body template with org branding; customer sees a clean summary + PDF attachment
- Optionally send an SMS link to a web-viewable quote (twilio or similar)
- Track sent/opened/approved status on the estimate

### 1.3 Digital Quote Approval (Customer Portal)
- Public, token-authenticated URL for each estimate (no login required for customer)
- Customer sees the full quote breakdown in a clean read-only view
- "Approve" button captures digital signature + timestamp
- Approval updates estimate status to `scheduled`; org gets notified
- **FloorZap calls this out explicitly:** customers approve via text/email link with e-signature

### 1.4 One-Click Quote → Invoice Conversion
- "Mark as Invoice" action on an approved estimate
- Sets invoice number, issued date, due date
- Separate invoice view/PDF from the quote view
- Track paid / partial / outstanding on each invoice
- Add `invoiceNumber`, `invoicedAt`, `dueDate`, `paidAt`, `amountPaid` fields to schema

### 1.5 Payment Processing (Stripe)
- Accept card payments via Stripe link or embedded checkout
- "Pay Online" button in customer portal / invoice email
- Record full and partial payments against an invoice
- Automatic receipt email on payment
- Stripe Connect (or platform-side Stripe) for multi-tenant billing

### 1.6 QuickBooks Online Sync
- OAuth connection from org settings → QuickBooks
- Push invoices to QBO on creation; sync payment status back
- Map customers, line items, tax rates to QBO equivalents
- **FloorZap's #1 advertised integration**

---

## Priority 2 — Match Core FloorZap Workflow

These bring SqFt to feature parity on the things FloorZap demos and sells.

### 2.1 Materials / Product Catalog
- Per-org catalog of flooring products (hardwood, LVP, tile, carpet, etc.)
- Fields: name, SKU, unit (sqft/box/yard), cost price, sell price, unit label
- Line items can be created from catalog (auto-fills price, unit, waste defaults)
- **FloorZap equivalent:** FCB2B supplier catalog integration; we build the catalog first,
  integrate later

### 2.2 Estimate Templates
- Save any estimate as a named template (rooms + line items, no customer attached)
- "New estimate from template" flow — picks a template, attaches a customer
- Templates scoped to org; only owners/admins can create/delete
- Dramatically reduces quote time for repeated job types (carpet bedrooms, LVP whole house)

### 2.3 Real-Time Job Costing
- Per-estimate cost vs. revenue summary that updates as line items change
- Track: materials cost, labor cost, overhead, total cost, sell price, margin $, margin %
- Labor line item type with hours × rate
- Job costing summary card on the estimate page and on the dashboard per job
- **FloorZap markets this prominently:** "real-time cost tracking" is a named feature

### 2.4 Org / Workspace Settings Page
- Company info: name, logo, phone, email, address, license number
- Default tax rate, default markup %, default deposit %
- Quote/invoice numbering prefix and next number
- Email/SMS sender identity
- Team members list with invite by email and role assignment (owner/admin/member)
- QuickBooks connection status and disconnect
- Billing / subscription management

### 2.5 Team & Crew Management
- Invite team members by email; they join the org on first login
- Role enforcement in API: members can't delete estimates/customers; admins can; owner can do all
- Assign events (jobs) to specific crew members
- Crew member view: see only their assigned jobs on the schedule
- **FloorZap has a bilingual (EN/ES) contractor portal** — add Spanish i18n strings for field
  crew views as a stretch goal

### 2.6 Mobile-Responsive UI
- Calendar, estimate builder, customer views must be fully usable on a phone
- Sticky bottom nav bar for mobile (Dashboard, Customers, Estimates, Schedule)
- Touch-friendly tap targets (min 44px), swipe on calendar
- Test at 390px width (iPhone 14) and 768px (iPad)

### 2.7 Installer / Field App View
- Simplified read-only view of the day's jobs (no estimate editing)
- Shows: job address, customer name, estimate summary, crew notes
- Allows: photo upload per job, add job notes, mark job complete
- Accessible from mobile browser (PWA); no separate native app required at first
- **FloorZap has iOS/Android installer apps** — a PWA route is faster to ship

### 2.8 Photo Documentation
- Attach photos to estimates and jobs (before/during/after)
- Upload from mobile camera or desktop file picker
- Photos stored in S3/Cloudflare R2; URLs saved in DB
- Visible in estimate detail and in installer field view

---

## Priority 3 — Differentiate & Pull Ahead

These go beyond FloorZap parity and give SqFt a reason to win.

### 3.1 Two-Way SMS Communication
- Send and receive SMS messages to/from customers, tied to their record
- Automated reminders: quote expiring, job tomorrow, invoice overdue
- Manual message compose from the customer or estimate page
- Message thread visible in customer detail

### 3.2 MeasureSquare Integration
- Import measurement data directly from MeasureSquare export
- Auto-create rooms in an estimate from the imported room list with dimensions
- Eliminates double data entry; **FloorZap advertises this as a key integration**

### 3.3 AI-Powered Lead Intake (ZapAssist equivalent)
- Embeddable web chat widget that captures lead info (name, phone, job type, timeline)
- Creates a new customer + estimate draft automatically
- Optional: AI voice agent via Twilio that answers missed calls and logs job details
- **FloorZap launched "ZapAssist" in Jan 2026** — we need a version of this

### 3.4 Showroom / Catalog QR Codes
- Generate a unique QR code per product in the materials catalog
- QR links to a public product page showing photo, description, price range, availability
- Print-ready QR code sheet for showroom displays
- **FloorZap has this as a differentiator** — it's low-effort to copy

### 3.5 Advanced Analytics & Reporting
- Revenue by period (month/quarter/year) with trend line
- Job margin distribution (histogram or table by estimate)
- Lead source ROI (customers by source × avg job value)
- Crew utilization (events per crew member per week)
- Export any report to CSV
- **FloorZap's dashboard shows real-time job costing; SqFt can go deeper on business
  intelligence**

### 3.6 Inventory / Material Tracking
- Track stock quantities per product in the catalog
- Deduct stock when an estimate with linked line items is marked in-progress
- Low-stock alerts (email or in-app notification)
- Multi-location support (warehouse A, warehouse B, truck stock)
- **FloorZap advertises inventory management across multiple locations**

### 3.7 Zapier / Webhook Integration
- Outbound webhooks on key events (estimate approved, invoice paid, new customer, etc.)
- Zapier app (or webhooks that Zapier can consume)
- Enables: Google Sheets logging, Slack notifications, Mailchimp lead sync, etc.
- **FloorZap integrates with Zapier for 9,000+ app connections**

### 3.8 Change Orders
- After a quote is approved, add line items as a change order
- Change order has its own approval flow and appends to the invoice total
- Audit trail: original quote → change order(s) → final invoice

---

## Priority 4 — Polish & Platform Health

These make SqFt feel like a production product, not an MVP.

### 4.1 Search
- Global search across customers, estimates, events
- Keyboard shortcut (⌘K / Ctrl+K) opens search modal
- Results grouped by type with quick-navigate

### 4.2 Notifications
- In-app notification bell: quote approved, payment received, overdue invoice, job tomorrow
- Email digest (daily or weekly) of key activity
- Push notifications via PWA on mobile

### 4.3 Audit Log
- Log all create/update/delete actions with user + timestamp
- Visible to org owners in settings
- Protects against "who deleted that estimate" disputes

### 4.4 Bulk Actions & List Improvements
- Bulk status update on estimates list
- Sortable and filterable columns on customers and estimates tables
- Persistent filters (saved in URL params)
- Pagination or infinite scroll for large orgs

### 4.5 Dark Mode
- Toggle in user settings; respects system preference by default
- Tailwind dark: classes already in design system; needs wiring to a theme provider

### 4.6 Client-Side Validation
- Zod schemas shared between API routes and client forms (already using Zod server-side)
- Inline field errors without a round-trip
- Form state preserved on failed submit

### 4.7 Test Coverage
- Unit tests for all calculation logic (area math, waste factor, margin)
- Integration tests for the estimate save/load round-trip
- E2E tests for the critical path: create estimate → approve → mark paid
- Current state: 4 test files, mostly stubs

### 4.8 Onboarding Flow Improvement
- Post-signup guided tour (3-step: add customer → build estimate → schedule job)
- Sample data seed on first login (demo customer + estimate)
- Empty state illustrations and CTAs on all list pages

---

## Schema Changes Required

The following additions to `prisma/schema.prisma` are implied by the roadmap above:

```
Estimate:
  + invoiceNumber    String?
  + invoicedAt       DateTime?
  + dueDate          DateTime?
  + paidAt           DateTime?
  + amountPaid       Float?
  + approvedAt       DateTime?
  + approvalToken    String?   @unique
  + signatureData    String?

Organization:
  + logo             String?   (URL)
  + phone            String?
  + address          String?
  + licenseNumber    String?
  + defaultTaxRate   Float?
  + defaultMarkup    Float?
  + defaultDeposit   Float?
  + quotePrefix      String?
  + invoicePrefix    String?
  + nextQuoteNumber  Int       @default(1)
  + nextInvoiceNumber Int      @default(1)
  + stripeAccountId  String?
  + qboRealmId       String?
  + qboAccessToken   String?

Product (new model):
  + id, orgId, name, sku, description
  + unit (sqft/box/yard/each)
  + costPrice, sellPrice
  + wasteDefault, stock, lowStockThreshold
  + createdAt, updatedAt

Photo (new model):
  + id, orgId, estimateId?, eventId?
  + url, caption, takenAt, uploadedById

Message (new model):
  + id, orgId, customerId
  + direction (inbound/outbound)
  + channel (sms/email)
  + body, sentAt, status

AuditLog (new model):
  + id, orgId, userId, action, entityType, entityId
  + before (JSON), after (JSON), createdAt
```

---

## Summary by Quarter (suggested sequencing)

| Quarter | Focus | Key Deliverables |
|---------|-------|-----------------|
| Q2 2026 | Revenue loop | PDF export, email delivery, digital approval, invoice, Stripe payments |
| Q3 2026 | Parity | QuickBooks, catalog, templates, job costing, settings, team roles, mobile UI |
| Q4 2026 | Field ops | Installer PWA, photos, two-way SMS, MeasureSquare import |
| Q1 2027 | Differentiation | AI lead intake, QR codes, analytics, inventory, Zapier |
| Q2 2027 | Polish | Search, notifications, audit log, dark mode, test coverage, onboarding |

---

*Last updated: 2026-05-04. Based on audit of SqFt MVP and FloorZap feature research.*
