# Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a priced estimate spawn multiple customer-facing invoices that each bill a free-form $ or % of the estimate total, display a prorated line breakdown, are emailed via a public token page, and track manually-recorded payments through a ledger that is Stripe-ready.

**Architecture:** New `Invoice` + `Payment` + `InvoiceEvent` Prisma models hang off `Estimate` (org-scoped). A pure math module (`lib/invoices/`) owns the billing-summary and proration math (the single source of truth, mirroring `lib/estimateView`). Repository functions mirror `estimateRepo` (transactions, org-scoping, token generation, snapshot-on-send). API routes use the existing `apiRoute`/`publicRoute` seam. The public pay page and the estimate-detail Invoices section reuse existing styling and the React-Email + Resend send flow.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + PostgreSQL, Zod 4, React 19, TanStack Query, React Email + Resend, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-06-05-invoicing-design.md`

**Conventions to follow (verified in the codebase):**
- Money is `Float` dollars everywhere; convert to integer cents only at the Stripe boundary (not in this plan).
- Errors: throw `ApiError` subclasses from `lib/api/errors.ts`; routes never hand-format error bodies.
- Tokens: `randomBytes(32).toString("base64url")` (see `estimateRepo.generateToken`).
- Repos are barrel-exported from `lib/repositories/index.ts`.
- Tests live under `__tests__/` mirroring source paths; use Vitest `describe/it/expect` and `@/` path aliases.
- Lint/test commands: `npx biome ci .`, `npm test`, `npm run typecheck`.
- **Migrations: do NOT run `prisma migrate dev`** — the dev DB's squashed baseline diverges and `migrate dev` offers a destructive reset. Hand-author the migration SQL and apply with `migrate deploy` (see Task 1).

---

## File map

**Create:**
- `prisma/migrations/20260605000000_add_invoicing/migration.sql` — DDL for the three tables + Org/Estimate columns
- `lib/invoices/types.ts` — `InvoiceInput`, `ProratedLine`, `ProratedBreakdown`, `EstimateBilling`, `InvoiceSnapshot`, `InvoiceSnapshotMeta`
- `lib/invoices/compute.ts` — `computeEstimateBilling`, `prorateInvoice`
- `lib/invoices/snapshot.ts` — `snapshotInvoice`
- `lib/invoices/schema.ts` — Zod schemas (create / update / send / payment / params)
- `lib/invoices/index.ts` — client-safe barrel (compute + types only)
- `lib/repositories/invoiceRepo.ts` — all invoice/payment/event repo functions
- `lib/email/CustomerInvoiceEmail.tsx` — React-Email template
- `lib/email/sendInvoiceEmail.ts` — Resend wrapper
- `app/api/estimates/[id]/invoices/route.ts` — GET list + POST create
- `app/api/invoices/[id]/route.ts` — GET detail + PATCH edit (draft only)
- `app/api/invoices/[id]/send/route.ts` — POST send
- `app/api/invoices/[id]/payments/route.ts` — POST record payment
- `app/api/invoices/[id]/void/route.ts` — POST void
- `app/invoice-review/[token]/page.tsx` — public pay page
- `components/invoices/PublicInvoiceView.tsx` — public pay page body
- `components/invoices/InvoicesSection.tsx` — estimate-detail Invoices client component
- Test files mirrored under `__tests__/`

**Modify:**
- `prisma/schema.prisma` — add models + columns
- `lib/api/errors.ts` — add `InvoiceLockedError`, `InvoiceOverbillError`
- `lib/repositories/index.ts` — export `invoiceRepo`
- `components/estimates/EstimateBuilder.tsx` — mount `<InvoicesSection>`
- `prisma/seed.ts` — seed invoices + payments

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260605000000_add_invoicing/migration.sql`

- [ ] **Step 1: Add the three models to `prisma/schema.prisma`**

Append after the `EstimateEvent` model:

```prisma
model Invoice {
  id            Int          @id @default(autoincrement())
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  estimateId    Int
  estimate      Estimate     @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  invoiceNumber Int

  status        String       @default("draft") // draft | sent | viewed | partial | paid | void

  amount        Float
  pct           Float?
  memo          String?

  coverNote           String @default("")
  terms               String @default("")
  paymentInstructions String @default("")

  date          DateTime     @default(now())
  dueDate       DateTime?

  publicToken   String?      @unique
  sentAt        DateTime?
  sentToEmail   String?
  sentByEmail   String?
  sentByName    String?
  viewedAt      DateTime?

  paidAt        DateTime?
  voidedAt      DateTime?

  stripePaymentLinkUrl  String?
  stripePaymentIntentId String? @unique

  snapshot      Json?

  createdAt     DateTime     @default(now())

  payments      Payment[]
  invoiceEvents InvoiceEvent[]

  @@unique([orgId, invoiceNumber])
  @@index([orgId])
  @@index([estimateId])
}

model Payment {
  id              Int      @id @default(autoincrement())
  invoiceId       Int
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  amount          Float
  method          String   // check | cash | card | ach | stripe | other
  paidAt          DateTime @default(now())
  reference       String?
  note            String?
  recordedByEmail String?
  recordedByName  String?
  stripeChargeId  String?  @unique
  createdAt       DateTime @default(now())

  @@index([invoiceId])
}

model InvoiceEvent {
  id         Int      @id @default(autoincrement())
  invoiceId  Int
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  type       String   // sent | viewed | resent | link_rotated | payment_recorded | voided
  actorEmail String?
  actorName  String?
  ip         String?
  userAgent  String?
  metadata   Json?
  source     String?  // customer | builder | system
  createdAt  DateTime @default(now())

  @@index([invoiceId, createdAt])
}
```

- [ ] **Step 2: Add columns to `Organization` and `Estimate`**

In `model Organization`, after the `// ── BILLING` block fields (before the relations list `users User[]`), add:

```prisma
  nextInvoiceNumber          Int      @default(1)
  defaultPaymentInstructions String   @default("")
  stripeConnectAccountId     String?
```

And in the `Organization` relations list, add:

```prisma
  invoices          Invoice[]
```

In `model Estimate`, in the relations block (after `estimateEvents EstimateEvent[]`), add:

```prisma
  invoices       Invoice[]
```

- [ ] **Step 3: Hand-author the migration SQL**

Create `prisma/migrations/20260605000000_add_invoicing/migration.sql`:

```sql
-- Organization additions (all NOT NULL columns carry defaults → safe on populated DB)
ALTER TABLE "Organization"
  ADD COLUMN "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "defaultPaymentInstructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "stripeConnectAccountId" TEXT;

-- Invoice
CREATE TABLE "Invoice" (
  "id" SERIAL NOT NULL,
  "orgId" TEXT NOT NULL,
  "estimateId" INTEGER NOT NULL,
  "invoiceNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "amount" DOUBLE PRECISION NOT NULL,
  "pct" DOUBLE PRECISION,
  "memo" TEXT,
  "coverNote" TEXT NOT NULL DEFAULT '',
  "terms" TEXT NOT NULL DEFAULT '',
  "paymentInstructions" TEXT NOT NULL DEFAULT '',
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "publicToken" TEXT,
  "sentAt" TIMESTAMP(3),
  "sentToEmail" TEXT,
  "sentByEmail" TEXT,
  "sentByName" TEXT,
  "viewedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "stripePaymentLinkUrl" TEXT,
  "stripePaymentIntentId" TEXT,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");
CREATE UNIQUE INDEX "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");
CREATE UNIQUE INDEX "Invoice_orgId_invoiceNumber_key" ON "Invoice"("orgId", "invoiceNumber");
CREATE INDEX "Invoice_orgId_idx" ON "Invoice"("orgId");
CREATE INDEX "Invoice_estimateId_idx" ON "Invoice"("estimateId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment
CREATE TABLE "Payment" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "note" TEXT,
  "recordedByEmail" TEXT,
  "recordedByName" TEXT,
  "stripeChargeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_stripeChargeId_key" ON "Payment"("stripeChargeId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InvoiceEvent
CREATE TABLE "InvoiceEvent" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate the client and apply the migration**

Run: `npx prisma generate`
Then: `npm run migrate:dev`
Expected: `migrate deploy` reports `1 migration applied` (`20260605000000_add_invoicing`) with no prompt to reset.

- [ ] **Step 5: Verify the client typechecks against the new models**

Run: `npm run typecheck`
Expected: PASS (no errors). The generated `Invoice`, `Payment`, `InvoiceEvent` delegates now exist on the Prisma client.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260605000000_add_invoicing/migration.sql
git commit -m "feat(invoicing): add Invoice/Payment/InvoiceEvent schema + migration"
```

---

## Task 2: Invoice math types + billing summary

**Files:**
- Create: `lib/invoices/types.ts`
- Create: `lib/invoices/compute.ts`
- Test: `__tests__/lib/invoices/compute.test.ts`

- [ ] **Step 1: Write `lib/invoices/types.ts`**

```ts
import type { EstimateView } from "@/lib/estimateView/types";

/** One invoice's billable identity for math purposes. */
export interface InvoiceLike {
  /** Dollar amount billed by this invoice. */
  amount: number;
  /** Lifecycle status. Voided invoices are excluded from billing math. */
  status: string;
  /** Sum of recorded payments on this invoice (caller pre-aggregates). */
  paidAmount: number;
}

/** Estimate-level rollup across all of an estimate's invoices. */
export interface EstimateBilling {
  total: number;
  /** Σ amount over non-void invoices. */
  invoiced: number;
  /** total − invoiced (never below 0). */
  unbilled: number;
  /** Σ paid over non-void invoices. */
  paid: number;
  /** invoiced − paid. */
  outstanding: number;
}

/** A single prorated row in an invoice's displayed breakdown. */
export interface ProratedLine {
  name: string;
  description: string | null;
  amount: number;
}

/** The full prorated breakdown for one invoice. */
export interface ProratedBreakdown {
  /** ratio = amount / estimateTotal (0 when estimateTotal is 0). */
  ratio: number;
  lines: ProratedLine[];
  /** Reconciled to equal the invoice amount exactly. */
  total: number;
}

/** Estimate-view + the source line metadata proration needs. */
export interface ProrationSource {
  view: EstimateView;
  lineMeta: Array<{ name: string; description: string | null }>;
  markupLabel?: string;
  convenienceFeeLabel?: string;
}
```

- [ ] **Step 2: Write the failing test for `computeEstimateBilling`**

```ts
// __tests__/lib/invoices/compute.test.ts
import { describe, expect, it } from "vitest";
import { computeEstimateBilling } from "@/lib/invoices/compute";

describe("computeEstimateBilling", () => {
  it("rolls up invoiced/unbilled/paid/outstanding over non-void invoices", () => {
    const b = computeEstimateBilling(14807, [
      { amount: 7403.5, status: "paid", paidAmount: 7403.5 },
      { amount: 3000, status: "sent", paidAmount: 1000 },
      { amount: 5000, status: "void", paidAmount: 0 },
    ]);
    expect(b).toEqual({
      total: 14807,
      invoiced: 10403.5,
      unbilled: 4403.5,
      paid: 8403.5,
      outstanding: 2000,
    });
  });

  it("clamps unbilled at 0 and treats null total as 0", () => {
    expect(computeEstimateBilling(null, []).total).toBe(0);
    const b = computeEstimateBilling(100, [
      { amount: 150, status: "sent", paidAmount: 0 },
    ]);
    expect(b.unbilled).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- compute`
Expected: FAIL — `computeEstimateBilling` is not exported.

- [ ] **Step 4: Implement `computeEstimateBilling` in `lib/invoices/compute.ts`**

```ts
import type { EstimateView } from "@/lib/estimateView/types";
import type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";

/** Round to cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Estimate-level billing rollup. Voided invoices are ignored. */
export function computeEstimateBilling(
  estimateTotal: number | null,
  invoices: InvoiceLike[]
): EstimateBilling {
  const total = estimateTotal ?? 0;
  let invoiced = 0;
  let paid = 0;
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    invoiced += inv.amount;
    paid += inv.paidAmount;
  }
  invoiced = round2(invoiced);
  paid = round2(paid);
  return {
    total: round2(total),
    invoiced,
    unbilled: round2(Math.max(0, total - invoiced)),
    paid,
    outstanding: round2(invoiced - paid),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- compute`
Expected: PASS (both `computeEstimateBilling` cases).

- [ ] **Step 6: Commit**

```bash
git add lib/invoices/types.ts lib/invoices/compute.ts __tests__/lib/invoices/compute.test.ts
git commit -m "feat(invoicing): estimate billing-summary math"
```

---

## Task 3: Proration math

**Files:**
- Modify: `lib/invoices/compute.ts`
- Test: `__tests__/lib/invoices/compute.test.ts`

- [ ] **Step 1: Add the failing proration test**

Append inside `__tests__/lib/invoices/compute.test.ts`:

```ts
import { prorateInvoice } from "@/lib/invoices/compute";
import type { ProrationSource } from "@/lib/invoices/types";

describe("prorateInvoice", () => {
  const source: ProrationSource = {
    view: {
      lines: [
        { id: 1, effectiveQty: 1, subtotal: 307 },
        { id: 2, effectiveQty: 1, subtotal: 3380 },
      ],
      subtotal: 3687,
      markup: 0,
      beforeFee: 3687,
      convenienceFee: 0,
      total: 3687,
      deposit: 0,
      hasUnresolvedLines: false,
    },
    lineMeta: [
      { name: "Carpet Tear Out", description: "Remove carpet" },
      { name: "RED OAK", description: "Install oak" },
    ],
  };

  it("prorates each line by the bill ratio at 50%", () => {
    const out = prorateInvoice(source, 1843.5);
    expect(out.ratio).toBeCloseTo(0.5, 6);
    expect(out.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 },
      { name: "RED OAK", description: "Install oak", amount: 1690 },
    ]);
    expect(out.total).toBe(1843.5);
  });

  it("reconciles rounding so line amounts sum exactly to the bill amount", () => {
    const out = prorateInvoice(source, 1000);
    const sum = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
    expect(out.total).toBe(1000);
  });

  it("emits markup and convenience-fee rows only when non-zero", () => {
    const withFees: ProrationSource = {
      ...source,
      view: { ...source.view, markup: 100, convenienceFee: 50, total: 3837 },
    };
    const out = prorateInvoice(withFees, 3837);
    const names = out.lines.map((l) => l.name);
    expect(names).toContain("Markup");
    expect(names).toContain("Convenience fee");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- compute`
Expected: FAIL — `prorateInvoice` is not exported.

- [ ] **Step 3: Implement `prorateInvoice` in `lib/invoices/compute.ts`**

Append:

```ts
/**
 * Prorate an estimate's labeled breakdown (line subtotals + markup + fee) by
 * `amount / estimateTotal`, then reconcile rounding onto the last row so the
 * displayed rows sum EXACTLY to `amount`. Markup/fee rows appear only when the
 * underlying value is non-zero.
 */
export function prorateInvoice(
  source: ProrationSource,
  amount: number
): ProratedBreakdown {
  const estimateTotal = source.view.total;
  const ratio = estimateTotal === 0 ? 0 : amount / estimateTotal;

  const rows: ProratedLine[] = [];
  source.view.lines.forEach((line, idx) => {
    const meta = source.lineMeta[idx];
    rows.push({
      name: meta?.name ?? `Item ${idx + 1}`,
      description: meta?.description ?? null,
      amount: round2((line.subtotal ?? 0) * ratio),
    });
  });
  if (source.view.markup > 0) {
    rows.push({
      name: source.markupLabel ?? "Markup",
      description: null,
      amount: round2(source.view.markup * ratio),
    });
  }
  if (source.view.convenienceFee > 0) {
    rows.push({
      name: source.convenienceFeeLabel ?? "Convenience fee",
      description: null,
      amount: round2(source.view.convenienceFee * ratio),
    });
  }

  // Reconcile: force the sum to equal `amount` by adjusting the last row.
  const target = round2(amount);
  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const drift = round2(target - sum);
  if (drift !== 0 && rows.length > 0) {
    const last = rows[rows.length - 1];
    last.amount = round2(last.amount + drift);
  }

  return { ratio, lines: rows, total: target };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- compute`
Expected: PASS (all `prorateInvoice` + `computeEstimateBilling` cases).

- [ ] **Step 5: Commit**

```bash
git add lib/invoices/compute.ts __tests__/lib/invoices/compute.test.ts
git commit -m "feat(invoicing): prorated line breakdown math with rounding reconciliation"
```

---

## Task 4: Invoice snapshot builder

**Files:**
- Create: `lib/invoices/snapshot.ts`
- Modify: `lib/invoices/types.ts`
- Test: `__tests__/lib/invoices/snapshot.test.ts`

- [ ] **Step 1: Add snapshot types to `lib/invoices/types.ts`**

Append:

```ts
export interface InvoiceSnapshotMeta {
  invoiceNumber: number;
  date: Date | string;
  dueDate: Date | string | null;
  memo: string | null;
  terms: string;
  paymentInstructions: string;
  pct: number | null;
  amount: number;
  customer: {
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  org: {
    name: string;
    address: string | null;
    phone: string | null;
    licenseNumber: string | null;
    logoUrl: string | null;
  };
  stripePaymentLinkUrl: string | null;
}

export interface InvoiceSnapshot extends Omit<InvoiceSnapshotMeta, "date" | "dueDate"> {
  date: string;
  dueDate: string | null;
  lines: ProratedLine[];
  totals: {
    subtotal: number;
    markup: number;
    convenienceFee: number;
    balanceDue: number;
  };
}
```

- [ ] **Step 2: Write the failing snapshot test**

```ts
// __tests__/lib/invoices/snapshot.test.ts
import { describe, expect, it } from "vitest";
import type { ProrationSource } from "@/lib/invoices/types";
import { snapshotInvoice } from "@/lib/invoices/snapshot";

const source: ProrationSource = {
  view: {
    lines: [{ id: 1, effectiveQty: 1, subtotal: 307 }],
    subtotal: 307,
    markup: 0,
    beforeFee: 307,
    convenienceFee: 0,
    total: 307,
    deposit: 0,
    hasUnresolvedLines: false,
  },
  lineMeta: [{ name: "Carpet Tear Out", description: "Remove carpet" }],
};

describe("snapshotInvoice", () => {
  it("captures identity, prorated lines, and balance-due totals", () => {
    const snap = snapshotInvoice(source, {
      invoiceNumber: 7465,
      date: new Date("2026-06-05T00:00:00Z"),
      dueDate: new Date("2026-06-06T00:00:00Z"),
      memo: "Deposit",
      terms: "50% to schedule, bal upon compl",
      paymentInstructions: "WARNING! cards via link…",
      pct: 0.5,
      amount: 153.5,
      customer: { name: "Alex Hall", address: "3722 Amity Lane", email: null, phone: null },
      org: { name: "All About Hardwood", address: null, phone: null, licenseNumber: null, logoUrl: null },
      stripePaymentLinkUrl: "https://pay.example/abc",
    });
    expect(snap.invoiceNumber).toBe(7465);
    expect(snap.date).toBe("2026-06-05T00:00:00.000Z");
    expect(snap.dueDate).toBe("2026-06-06T00:00:00.000Z");
    expect(snap.lines).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 },
    ]);
    expect(snap.totals.balanceDue).toBe(153.5);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- invoices/snapshot`
Expected: FAIL — `snapshotInvoice` is not exported.

- [ ] **Step 4: Implement `lib/invoices/snapshot.ts`**

```ts
import { prorateInvoice } from "./compute";
import type {
  InvoiceSnapshot,
  InvoiceSnapshotMeta,
  ProrationSource,
} from "./types";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/** Freeze the customer-facing invoice artifact: identity + prorated lines +
 *  balance-due totals. Proration runs internally so the document can never
 *  diverge from the math used elsewhere. */
export function snapshotInvoice(
  source: ProrationSource,
  meta: InvoiceSnapshotMeta
): InvoiceSnapshot {
  const breakdown = prorateInvoice(source, meta.amount);
  return {
    invoiceNumber: meta.invoiceNumber,
    date: iso(meta.date) as string,
    dueDate: iso(meta.dueDate),
    memo: meta.memo,
    terms: meta.terms,
    paymentInstructions: meta.paymentInstructions,
    pct: meta.pct,
    amount: meta.amount,
    customer: meta.customer,
    org: meta.org,
    stripePaymentLinkUrl: meta.stripePaymentLinkUrl,
    lines: breakdown.lines,
    totals: {
      subtotal: source.view.subtotal,
      markup: source.view.markup,
      convenienceFee: source.view.convenienceFee,
      balanceDue: meta.amount,
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- invoices/snapshot`
Expected: PASS.

- [ ] **Step 6: Create the client-safe barrel `lib/invoices/index.ts`**

```ts
// Client-safe surface. Snapshot lives in ./snapshot and is server-imported
// directly (it is pure but conceptually a server artifact, mirroring estimateView).
export { computeEstimateBilling, prorateInvoice } from "./compute";
export type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";
```

- [ ] **Step 7: Commit**

```bash
git add lib/invoices/snapshot.ts lib/invoices/types.ts lib/invoices/index.ts __tests__/lib/invoices/snapshot.test.ts
git commit -m "feat(invoicing): invoice snapshot builder + client barrel"
```

---

## Task 5: Zod schemas + error classes

**Files:**
- Create: `lib/invoices/schema.ts`
- Modify: `lib/api/errors.ts`
- Test: `__tests__/lib/invoices/schema.test.ts`

- [ ] **Step 1: Add error classes to `lib/api/errors.ts`**

After `EstimateHasEventsError`, add:

```ts
export class InvoiceLockedError extends ConflictError {
  constructor() {
    super(
      "This invoice has been sent and can no longer be edited.",
      "INVOICE_LOCKED"
    );
  }
}

export class InvoiceOverbillError extends ConflictError {
  readonly unbilled: number;
  constructor(unbilled: number) {
    super(
      `Amount exceeds the estimate's unbilled balance ($${unbilled.toFixed(2)}).`,
      "INVOICE_OVERBILL"
    );
    this.unbilled = unbilled;
  }
}
```

- [ ] **Step 2: Write the failing schema test**

```ts
// __tests__/lib/invoices/schema.test.ts
import { describe, expect, it } from "vitest";
import {
  invoiceCreateSchema,
  invoicePaymentSchema,
} from "@/lib/invoices/schema";

describe("invoiceCreateSchema", () => {
  it("accepts a flat-dollar invoice", () => {
    const r = invoiceCreateSchema.safeParse({ amount: 1500, memo: "Deposit" });
    expect(r.success).toBe(true);
  });
  it("accepts a percentage invoice", () => {
    const r = invoiceCreateSchema.safeParse({ pct: 0.5 });
    expect(r.success).toBe(true);
  });
  it("rejects when neither amount nor pct is given", () => {
    const r = invoiceCreateSchema.safeParse({ memo: "x" });
    expect(r.success).toBe(false);
  });
  it("rejects when both amount and pct are given", () => {
    const r = invoiceCreateSchema.safeParse({ amount: 100, pct: 0.5 });
    expect(r.success).toBe(false);
  });
});

describe("invoicePaymentSchema", () => {
  it("requires a positive amount and a method", () => {
    expect(invoicePaymentSchema.safeParse({ amount: 100, method: "check" }).success).toBe(true);
    expect(invoicePaymentSchema.safeParse({ amount: 0, method: "check" }).success).toBe(false);
    expect(invoicePaymentSchema.safeParse({ amount: 100, method: "bitcoin" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- invoices/schema`
Expected: FAIL — module `@/lib/invoices/schema` not found.

- [ ] **Step 4: Implement `lib/invoices/schema.ts`**

```ts
import { z } from "zod";

export const PAYMENT_METHODS = [
  "check",
  "cash",
  "card",
  "ach",
  "stripe",
  "other",
] as const;

/** Create: bill EITHER a flat dollar `amount` OR a `pct` (0–1), never both/neither. */
export const invoiceCreateSchema = z
  .object({
    amount: z.number().positive().optional(),
    pct: z.number().gt(0).max(1).optional(),
    memo: z.string().max(120).optional(),
    terms: z.string().max(2000).optional(),
    coverNote: z.string().max(2000).optional(),
    dueDate: z.string().datetime().optional(),
  })
  .refine((v) => (v.amount === undefined) !== (v.pct === undefined), {
    message: "Provide exactly one of amount or pct",
    path: ["amount"],
  });

/** Patch (draft only): editable fields. */
export const invoiceUpdateSchema = z.object({
  amount: z.number().positive().optional(),
  pct: z.number().gt(0).max(1).optional(),
  memo: z.string().max(120).nullish(),
  terms: z.string().max(2000).optional(),
  coverNote: z.string().max(2000).optional(),
  paymentInstructions: z.string().max(2000).optional(),
  dueDate: z.string().datetime().nullish(),
});

export const invoiceSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  regenerateLink: z.boolean().optional(),
});

export const invoicePaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().datetime().optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
});

export const invoiceIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const invoiceTokenParams = z.object({
  token: z.string().min(16).max(128),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
export type InvoiceSendInput = z.infer<typeof invoiceSendSchema>;
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- invoices/schema`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/invoices/schema.ts lib/api/errors.ts __tests__/lib/invoices/schema.test.ts
git commit -m "feat(invoicing): zod schemas + INVOICE_LOCKED / INVOICE_OVERBILL errors"
```

---

## Task 6: invoiceRepo — create / list / get

**Files:**
- Create: `lib/repositories/invoiceRepo.ts`
- Modify: `lib/repositories/index.ts`
- Test: `__tests__/lib/repositories/invoiceRepo.test.ts`

> These repo tests gate on a real DB. Follow the existing pattern: skip when
> `process.env.VITEST_DB_AVAILABLE` is unset (see project memory on real-DB tests).

- [ ] **Step 1: Write the failing create/guard test**

```ts
// __tests__/lib/repositories/invoiceRepo.test.ts
import { describe, expect, it } from "vitest";
import { buildInvoiceProrationSource, computeInvoiceAmount } from "@/lib/repositories/invoiceRepo";

describe("computeInvoiceAmount", () => {
  it("returns the flat amount when amount is provided", () => {
    expect(computeInvoiceAmount({ estimateTotal: 1000, amount: 250 })).toEqual({
      amount: 250,
      pct: null,
    });
  });
  it("computes amount from pct against the estimate total", () => {
    expect(computeInvoiceAmount({ estimateTotal: 1000, pct: 0.5 })).toEqual({
      amount: 500,
      pct: 0.5,
    });
  });
});

describe("buildInvoiceProrationSource", () => {
  it("maps a hydrated estimate to a ProrationSource with line metadata", () => {
    const src = buildInvoiceProrationSource({
      markupPct: 0,
      convenienceFeeRate: 0,
      depositPct: 0.5,
      lineItems: [
        { id: 1, name: "Carpet Tear Out", description: "Remove carpet", rate: 307, qtyMode: "manual", qty: 1, wastePct: 0, unitLabel: "job", linkedRoomIds: [], sortOrder: 0 },
      ],
      siteMeasure: { items: [] },
    });
    expect(src.lineMeta).toEqual([
      { name: "Carpet Tear Out", description: "Remove carpet" },
    ]);
    expect(src.view.total).toBe(307);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- invoiceRepo`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helpers + create/list/get in `lib/repositories/invoiceRepo.ts`**

```ts
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { InvoiceLockedError, InvoiceOverbillError } from "@/lib/api/errors";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import { computeEstimateBilling } from "@/lib/invoices/compute";
import type { InvoiceLike, ProrationSource } from "@/lib/invoices/types";
import { prisma } from "@/lib/prisma";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Hydrated estimate shape the proration source needs (matches fromPrismaEstimate input). */
type HydratedEstimate = Parameters<typeof fromPrismaEstimate>[0];

/** Build the ProrationSource (estimate view + per-line metadata) from a hydrated estimate. */
export function buildInvoiceProrationSource(
  estimate: HydratedEstimate & {
    lineItems: Array<{ name: string; description: string | null }>;
  }
): ProrationSource {
  const view = computeEstimateView(fromPrismaEstimate(estimate));
  return {
    view,
    lineMeta: estimate.lineItems.map((li) => ({
      name: li.name,
      description: li.description ?? null,
    })),
  };
}

/** Resolve the billed dollar amount + stored pct from the create/patch input. */
export function computeInvoiceAmount(args: {
  estimateTotal: number;
  amount?: number;
  pct?: number;
}): { amount: number; pct: number | null } {
  if (args.amount !== undefined) return { amount: round2(args.amount), pct: null };
  const pct = args.pct ?? 0;
  return { amount: round2(args.estimateTotal * pct), pct };
}

const INVOICE_INCLUDE = {
  payments: { orderBy: { paidAt: "asc" } },
  invoiceEvents: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: typeof INVOICE_INCLUDE;
}>;

/** Sum recorded payments → InvoiceLike for billing math. */
function toInvoiceLike(inv: {
  amount: number;
  status: string;
  payments: { amount: number }[];
}): InvoiceLike {
  return {
    amount: inv.amount,
    status: inv.status,
    paidAmount: inv.payments.reduce((s, p) => s + p.amount, 0),
  };
}

export async function listInvoicesForEstimate(estimateId: number, orgId: string) {
  return prisma.invoice.findMany({
    where: { orgId, estimateId },
    orderBy: { createdAt: "asc" },
    include: INVOICE_INCLUDE,
  });
}

export async function getInvoice(
  id: number,
  orgId: string
): Promise<InvoiceWithDetails | null> {
  return prisma.invoice.findFirst({
    where: { id, orgId },
    include: INVOICE_INCLUDE,
  });
}

export interface CreateInvoiceInput {
  estimateId: number;
  amount?: number;
  pct?: number;
  memo?: string;
  terms?: string;
  coverNote?: string;
  dueDate?: string;
}

export async function createInvoice(orgId: string, input: CreateInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: { id: input.estimateId, orgId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        siteMeasure: { select: { items: { orderBy: { sortOrder: "asc" } } } },
        invoices: { select: { amount: true, status: true, payments: { select: { amount: true } } } },
      },
    });
    if (!estimate) return null;

    const view = computeEstimateView(fromPrismaEstimate(estimate));
    const estimateTotal = view.total;

    const { amount, pct } = computeInvoiceAmount({
      estimateTotal,
      amount: input.amount,
      pct: input.pct,
    });

    const billing = computeEstimateBilling(
      estimateTotal,
      estimate.invoices.map(toInvoiceLike)
    );
    if (amount > billing.unbilled + 0.005) {
      throw new InvoiceOverbillError(billing.unbilled);
    }

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { nextInvoiceNumber: true, defaultPaymentInstructions: true },
    });
    await tx.organization.update({
      where: { id: orgId },
      data: { nextInvoiceNumber: org.nextInvoiceNumber + 1 },
    });

    return tx.invoice.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        invoiceNumber: org.nextInvoiceNumber,
        status: "draft",
        amount,
        pct,
        memo: input.memo ?? null,
        terms: input.terms ?? estimate.terms,
        coverNote: input.coverNote ?? "",
        paymentInstructions: org.defaultPaymentInstructions,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: INVOICE_INCLUDE,
    });
  });
}
```

- [ ] **Step 4: Export from the repo barrel `lib/repositories/index.ts`**

Add the line (keep alphabetical-ish order, after `eventRepo`):

```ts
export * from "./invoiceRepo";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- invoiceRepo`
Expected: PASS (`computeInvoiceAmount`, `buildInvoiceProrationSource`).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/invoiceRepo.ts lib/repositories/index.ts __tests__/lib/repositories/invoiceRepo.test.ts
git commit -m "feat(invoicing): invoiceRepo create/list/get + over-bill guard"
```

---

## Task 7: invoiceRepo — update, void, send, view, token, payment

**Files:**
- Modify: `lib/repositories/invoiceRepo.ts`
- Test: `__tests__/lib/repositories/invoiceRepo.test.ts`

- [ ] **Step 1: Add the failing status-recompute test**

Append to `__tests__/lib/repositories/invoiceRepo.test.ts`:

```ts
import { nextInvoiceStatus } from "@/lib/repositories/invoiceRepo";

describe("nextInvoiceStatus", () => {
  it("stays unpaid (sent/viewed) when nothing is paid", () => {
    expect(nextInvoiceStatus({ current: "sent", amount: 100, paid: 0 })).toBe("sent");
    expect(nextInvoiceStatus({ current: "viewed", amount: 100, paid: 0 })).toBe("viewed");
  });
  it("becomes partial when some but not all is paid", () => {
    expect(nextInvoiceStatus({ current: "sent", amount: 100, paid: 40 })).toBe("partial");
  });
  it("becomes paid when fully covered", () => {
    expect(nextInvoiceStatus({ current: "partial", amount: 100, paid: 100 })).toBe("paid");
  });
  it("never changes a void invoice", () => {
    expect(nextInvoiceStatus({ current: "void", amount: 100, paid: 100 })).toBe("void");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- invoiceRepo`
Expected: FAIL — `nextInvoiceStatus` not exported.

- [ ] **Step 3: Implement the remaining repo functions**

Append to `lib/repositories/invoiceRepo.ts`:

```ts
/** Derive the lifecycle status from the payment ledger. Void is terminal. */
export function nextInvoiceStatus(args: {
  current: string;
  amount: number;
  paid: number;
}): string {
  if (args.current === "void") return "void";
  if (args.paid <= 0) {
    return args.current === "draft" ? "draft" : args.current === "viewed" ? "viewed" : "sent";
  }
  if (args.paid + 0.005 >= args.amount) return "paid";
  return "partial";
}

export interface UpdateInvoiceInput {
  amount?: number;
  pct?: number;
  memo?: string | null;
  terms?: string;
  coverNote?: string;
  paymentInstructions?: string;
  dueDate?: string | null;
}

/** Edit a DRAFT invoice. Throws InvoiceLockedError once sent. */
export async function updateInvoice(
  id: number,
  orgId: string,
  patch: UpdateInvoiceInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, orgId },
      include: {
        estimate: {
          include: {
            lineItems: { orderBy: { sortOrder: "asc" } },
            siteMeasure: { select: { items: { orderBy: { sortOrder: "asc" } } } },
            invoices: { select: { id: true, amount: true, status: true, payments: { select: { amount: true } } } },
          },
        },
      },
    });
    if (!existing) return null;
    if (existing.status !== "draft") throw new InvoiceLockedError();

    const data: Prisma.InvoiceUpdateInput = {};
    if (patch.memo !== undefined) data.memo = patch.memo;
    if (patch.terms !== undefined) data.terms = patch.terms;
    if (patch.coverNote !== undefined) data.coverNote = patch.coverNote;
    if (patch.paymentInstructions !== undefined) data.paymentInstructions = patch.paymentInstructions;
    if (patch.dueDate !== undefined) {
      data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
    }

    if (patch.amount !== undefined || patch.pct !== undefined) {
      const view = computeEstimateView(fromPrismaEstimate(existing.estimate));
      const { amount, pct } = computeInvoiceAmount({
        estimateTotal: view.total,
        amount: patch.amount,
        pct: patch.pct,
      });
      const others = existing.estimate.invoices
        .filter((i) => i.id !== id)
        .map(toInvoiceLike);
      const billing = computeEstimateBilling(view.total, others);
      if (amount > billing.unbilled + 0.005) {
        throw new InvoiceOverbillError(billing.unbilled);
      }
      data.amount = amount;
      data.pct = pct;
    }

    return tx.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
  });
}

export async function voidInvoice(id: number, orgId: string) {
  const res = await prisma.invoice.updateMany({
    where: { id, orgId, status: { not: "void" } },
    data: { status: "void", voidedAt: new Date() },
  });
  if (res.count === 0) return null;
  await prisma.invoiceEvent.create({
    data: { invoiceId: id, type: "voided", source: "builder" },
  });
  return getInvoice(id, orgId);
}

export async function rotateInvoiceToken(id: number, orgId: string) {
  const token = generateToken();
  const res = await prisma.invoice.updateMany({
    where: { id, orgId },
    data: { publicToken: token },
  });
  return res.count > 0 ? token : null;
}

export interface MarkInvoiceSentInput {
  to: string;
  subject: string;
  sentByEmail: string;
  sentByName: string;
  snapshot: Prisma.InputJsonValue;
}

/** Stamp send metadata + freeze the snapshot + log sent/resent. */
export async function markInvoiceSent(
  id: number,
  orgId: string,
  input: MarkInvoiceSentInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, sentAt: true },
    });
    if (!existing) return false;

    await tx.invoice.update({
      where: { id },
      data: {
        status: existing.status === "draft" ? "sent" : existing.status,
        sentAt: new Date(),
        sentToEmail: input.to,
        sentByEmail: input.sentByEmail,
        sentByName: input.sentByName,
        snapshot: input.snapshot,
      },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId: id,
        type: existing.sentAt ? "resent" : "sent",
        source: "builder",
        actorEmail: input.sentByEmail,
        actorName: input.sentByName,
        metadata: { to: input.to, subject: input.subject },
      },
    });
    return true;
  });
}

export interface MarkInvoiceViewedInput {
  ip: string | null;
  userAgent: string | null;
}

/** Public view-tracking. Flips sent → viewed; always logs the open. */
export async function markInvoiceViewed(
  invoiceId: number,
  input: MarkInvoiceViewedInput
) {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!inv) return;
    if (inv.status === "sent") {
      await tx.invoice.updateMany({
        where: { id: invoiceId, status: "sent" },
        data: { status: "viewed", viewedAt: new Date() },
      });
    }
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        type: "viewed",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  });
}

export interface RecordPaymentInput {
  amount: number;
  method: string;
  paidAt?: string;
  reference?: string;
  note?: string;
  recordedByEmail: string;
  recordedByName: string;
}

/** Append a Payment, recompute status + paidAt, log payment_recorded. */
export async function recordPayment(
  invoiceId: number,
  orgId: string,
  input: RecordPaymentInput
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { payments: { select: { amount: true } } },
    });
    if (!inv) return null;
    if (inv.status === "void") throw new InvoiceLockedError();

    await tx.payment.create({
      data: {
        invoiceId,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        reference: input.reference ?? null,
        note: input.note ?? null,
        recordedByEmail: input.recordedByEmail,
        recordedByName: input.recordedByName,
      },
    });

    const paid = inv.payments.reduce((s, p) => s + p.amount, 0) + input.amount;
    const status = nextInvoiceStatus({ current: inv.status, amount: inv.amount, paid });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status, paidAt: status === "paid" ? new Date() : null },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        type: "payment_recorded",
        source: "builder",
        actorEmail: input.recordedByEmail,
        actorName: input.recordedByName,
        metadata: { amount: input.amount, method: input.method },
      },
    });

    return tx.invoice.findFirst({ where: { id: invoiceId }, include: INVOICE_INCLUDE });
  });
}

/** Public token lookup (no org scope — the token authorizes). */
export async function getInvoiceByToken(token: string) {
  return prisma.invoice.findUnique({
    where: { publicToken: token },
    include: INVOICE_INCLUDE,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- invoiceRepo`
Expected: PASS (`nextInvoiceStatus` cases + earlier helpers).

- [ ] **Step 5: Typecheck the repo**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/invoiceRepo.ts __tests__/lib/repositories/invoiceRepo.test.ts
git commit -m "feat(invoicing): invoiceRepo update/void/send/view/payment/token"
```

---

## Task 8: API — list + create route

**Files:**
- Create: `app/api/estimates/[id]/invoices/route.ts`
- Test: `__tests__/api/estimates.[id].invoices.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
// __tests__/api/estimates.[id].invoices.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({ user: { orgId: "org_1", email: "a@b.c", name: "A", role: "lead" } })),
}));
vi.mock("@/lib/repositories", () => ({
  createInvoice: vi.fn(async () => ({ id: 9, invoiceNumber: 1, amount: 500 })),
  listInvoicesForEstimate: vi.fn(async () => [{ id: 9 }]),
}));

import { GET, POST } from "@/app/api/estimates/[id]/invoices/route";
import { createInvoice } from "@/lib/repositories";

function req(body?: unknown) {
  return new Request("http://t/api/estimates/3/invoices", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof POST>[0];
}
const ctx = { params: Promise.resolve({ id: "3" }) };

describe("POST /api/estimates/[id]/invoices", () => {
  it("creates an invoice for the estimate", async () => {
    const res = await POST(req({ pct: 0.5 }), ctx);
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledWith("org_1", expect.objectContaining({ estimateId: 3, pct: 0.5 }));
  });
  it("returns 404 when the estimate is not found", async () => {
    vi.mocked(createInvoice).mockResolvedValueOnce(null as never);
    const res = await POST(req({ amount: 100 }), ctx);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/estimates/[id]/invoices", () => {
  it("lists invoices", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- "estimates.\[id\].invoices"`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement `app/api/estimates/[id]/invoices/route.ts`**

```ts
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateIdParams } from "@/lib/estimates/schema";
import { invoiceCreateSchema } from "@/lib/invoices/schema";
import { createInvoice, listInvoicesForEstimate } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  return listInvoicesForEstimate(id, orgId);
});

export const POST = apiRoute(
  { minRole: "lead", input: invoiceCreateSchema, status: 201 },
  async ({ orgId, input, params }) => {
    const { id } = estimateIdParams.parse(params);
    const invoice = await createInvoice(orgId, {
      estimateId: id,
      amount: input.amount,
      pct: input.pct,
      memo: input.memo,
      terms: input.terms,
      coverNote: input.coverNote,
      dueDate: input.dueDate,
    });
    if (!invoice) throw new NotFoundError();
    return invoice;
  }
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- "estimates.\[id\].invoices"`
Expected: PASS (create 201, 404, list 200).

- [ ] **Step 5: Commit**

```bash
git add "app/api/estimates/[id]/invoices/route.ts" "__tests__/api/estimates.[id].invoices.test.ts"
git commit -m "feat(invoicing): list + create invoice API route"
```

---

## Task 9: API — detail / patch / void / payment routes

**Files:**
- Create: `app/api/invoices/[id]/route.ts`
- Create: `app/api/invoices/[id]/void/route.ts`
- Create: `app/api/invoices/[id]/payments/route.ts`
- Test: `__tests__/api/invoices.[id].test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/invoices.[id].test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({ user: { orgId: "org_1", email: "a@b.c", name: "Amy", role: "lead" } })),
}));
vi.mock("@/lib/repositories", () => ({
  getInvoice: vi.fn(async () => ({ id: 9, status: "draft" })),
  updateInvoice: vi.fn(async () => ({ id: 9, status: "draft" })),
  voidInvoice: vi.fn(async () => ({ id: 9, status: "void" })),
  recordPayment: vi.fn(async () => ({ id: 9, status: "partial" })),
}));

import { GET, PATCH } from "@/app/api/invoices/[id]/route";
import { POST as VOID } from "@/app/api/invoices/[id]/void/route";
import { POST as PAY } from "@/app/api/invoices/[id]/payments/route";
import { recordPayment } from "@/lib/repositories";

const ctx = { params: Promise.resolve({ id: "9" }) };
function jreq(method: string, body?: unknown) {
  return new Request("http://t/api/invoices/9", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }) as never;
}

describe("invoice detail routes", () => {
  it("GET returns the invoice", async () => {
    expect((await GET(jreq("GET"), ctx)).status).toBe(200);
  });
  it("PATCH updates a draft", async () => {
    expect((await PATCH(jreq("PATCH", { memo: "Deposit" }), ctx)).status).toBe(200);
  });
  it("void marks the invoice void", async () => {
    expect((await VOID(jreq("POST"), ctx)).status).toBe(200);
  });
  it("payments records a payment", async () => {
    const res = await PAY(jreq("POST", { amount: 100, method: "check" }), ctx);
    expect(res.status).toBe(201);
    expect(recordPayment).toHaveBeenCalledWith(9, "org_1", expect.objectContaining({ amount: 100, method: "check", recordedByName: "Amy" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- "invoices.\[id\]"`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement `app/api/invoices/[id]/route.ts`**

```ts
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoiceUpdateSchema } from "@/lib/invoices/schema";
import { getInvoice, updateInvoice } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await getInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  return invoice;
});

export const PATCH = apiRoute(
  { minRole: "lead", input: invoiceUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = invoiceIdParams.parse(params);
    const invoice = await updateInvoice(id, orgId, input);
    if (!invoice) throw new NotFoundError();
    return invoice;
  }
);
```

- [ ] **Step 4: Implement `app/api/invoices/[id]/void/route.ts`**

```ts
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams } from "@/lib/invoices/schema";
import { voidInvoice } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const invoice = await voidInvoice(id, orgId);
  if (!invoice) throw new NotFoundError();
  return invoice;
});
```

- [ ] **Step 5: Implement `app/api/invoices/[id]/payments/route.ts`**

```ts
import { NotFoundError, UnauthorizedError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams, invoicePaymentSchema } from "@/lib/invoices/schema";
import { recordPayment } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const POST = apiRoute(
  { minRole: "lead", input: invoicePaymentSchema, status: 201 },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const u = session.user;
    if (!u?.email || !u?.name) throw new UnauthorizedError();
    const { id } = invoiceIdParams.parse(params);
    const invoice = await recordPayment(id, orgId, {
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      reference: input.reference,
      note: input.note,
      recordedByEmail: u.email,
      recordedByName: u.name,
    });
    if (!invoice) throw new NotFoundError();
    return invoice;
  }
);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- "invoices.\[id\]"`
Expected: PASS (GET 200, PATCH 200, void 200, payments 201).

- [ ] **Step 7: Commit**

```bash
git add "app/api/invoices/[id]/route.ts" "app/api/invoices/[id]/void/route.ts" "app/api/invoices/[id]/payments/route.ts" "__tests__/api/invoices.[id].test.ts"
git commit -m "feat(invoicing): invoice detail/patch/void/payment API routes"
```

---

## Task 10: Email template + sender

**Files:**
- Create: `lib/email/CustomerInvoiceEmail.tsx`
- Create: `lib/email/sendInvoiceEmail.ts`
- Test: `__tests__/lib/email/sendInvoiceEmail.test.ts`

- [ ] **Step 1: Implement `lib/email/CustomerInvoiceEmail.tsx`**

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CustomerInvoiceEmailProps {
  customerName: string;
  orgName: string;
  orgPhone: string | null;
  orgLogo: string | null;
  invoiceNumber: number;
  amountFormatted: string;
  dueLabel: string | null;
  coverNote?: string;
  paymentInstructions?: string;
  payUrl: string | null;
  publicUrl: string;
}

const main = { backgroundColor: "#f4f3ed", fontFamily: "system-ui, sans-serif" };
const container = {
  backgroundColor: "#fafaf7",
  padding: "32px",
  maxWidth: "560px",
  margin: "0 auto",
  borderRadius: "8px",
};
const heading = { fontSize: "20px", fontWeight: 700, color: "#1a1a17", margin: "0 0 8px" };
const muted = { fontSize: "12px", color: "#6b6b66", margin: "0" };
const para = { fontSize: "14px", color: "#3a3a35", lineHeight: 1.6, margin: "16px 0" };
const card = {
  backgroundColor: "#ffffff",
  border: "1px solid #e6e4dd",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0",
};
const button = {
  backgroundColor: "#c0341a",
  color: "#ffffff",
  padding: "14px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};
const fallback = { fontSize: "11px", color: "#6b6b66", marginTop: "12px", wordBreak: "break-all" as const };

export function CustomerInvoiceEmail(props: CustomerInvoiceEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Invoice #${props.invoiceNumber} from ${props.orgName} — ${props.amountFormatted}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            {props.orgLogo ? (
              <Img src={props.orgLogo} alt={props.orgName} height={36} style={{ marginBottom: "8px" }} />
            ) : null}
            <Text style={heading}>{props.orgName}</Text>
            {props.orgPhone ? <Text style={muted}>{props.orgPhone}</Text> : null}
          </Section>
          <Hr />
          <Section>
            <Text style={para}>Dear {props.customerName},</Text>
            {props.coverNote ? <Text style={para}>{props.coverNote}</Text> : null}
          </Section>
          <Section style={card}>
            <Text style={muted}>INVOICE #{props.invoiceNumber}</Text>
            {props.dueLabel ? <Text style={muted}>DUE {props.dueLabel}</Text> : null}
            <Text style={{ ...heading, fontSize: "24px", margin: "4px 0 0" }}>{props.amountFormatted}</Text>
          </Section>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button href={props.payUrl ?? props.publicUrl} style={button}>
              {props.payUrl ? "Pay invoice" : "View invoice"}
            </Button>
            <Text style={fallback}>Or paste this link: {props.payUrl ?? props.publicUrl}</Text>
          </Section>
          {props.paymentInstructions ? (
            <Section>
              <Text style={muted}>{props.paymentInstructions}</Text>
            </Section>
          ) : null}
          <Hr />
          <Text style={muted}>From {props.orgName} · Powered by SqFt</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Write the failing sender test**

```ts
// __tests__/lib/email/sendInvoiceEmail.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/client", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { sendEmail } from "@/lib/email/client";

describe("sendInvoiceEmail", () => {
  it("formats the amount and forwards to sendEmail", async () => {
    const res = await sendInvoiceEmail({
      to: "alex@example.com",
      subject: "Invoice #7465",
      coverNote: "Your deposit invoice is attached.",
      paymentInstructions: "WARNING…",
      publicUrl: "https://app.sqft.dev/invoice-review/tok",
      payUrl: null,
      customerName: "Alex",
      org: { name: "All About Hardwood", phone: null, logo: null },
      invoiceNumber: 7465,
      amountDollars: 7403.5,
      dueLabel: "06/06/2026",
      replyTo: "doug@example.com",
    });
    expect(res.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alex@example.com", subject: "Invoice #7465", replyTo: "doug@example.com" })
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- sendInvoiceEmail`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/email/sendInvoiceEmail.ts`**

```ts
import { fmtDollar } from "@/lib/utils";
import { CustomerInvoiceEmail } from "./CustomerInvoiceEmail";
import { type SendEmailResult, sendEmail } from "./client";

export interface SendInvoiceEmailInput {
  to: string;
  subject: string;
  coverNote?: string;
  paymentInstructions?: string;
  publicUrl: string;
  payUrl: string | null;
  customerName: string;
  org: { name: string; phone: string | null; logo: string | null };
  invoiceNumber: number;
  amountDollars: number;
  dueLabel: string | null;
  replyTo: string;
}

export function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<SendEmailResult> {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    react: CustomerInvoiceEmail({
      customerName: input.customerName || "there",
      orgName: input.org.name,
      orgPhone: input.org.phone,
      orgLogo: input.org.logo,
      invoiceNumber: input.invoiceNumber,
      amountFormatted: fmtDollar(input.amountDollars),
      dueLabel: input.dueLabel,
      coverNote: input.coverNote,
      paymentInstructions: input.paymentInstructions,
      payUrl: input.payUrl,
      publicUrl: input.publicUrl,
    }),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- sendInvoiceEmail`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/CustomerInvoiceEmail.tsx lib/email/sendInvoiceEmail.ts __tests__/lib/email/sendInvoiceEmail.test.ts
git commit -m "feat(invoicing): customer invoice email template + sender"
```

---

## Task 11: API — send route (snapshot + email)

**Files:**
- Create: `app/api/invoices/[id]/send/route.ts`
- Test: `__tests__/api/invoices.[id].send.test.ts`

- [ ] **Step 1: Write the failing send test**

```ts
// __tests__/api/invoices.[id].send.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getOrgId: vi.fn(async () => "org_1"),
  requireSession: vi.fn(async () => ({ user: { orgId: "org_1", email: "doug@b.c", name: "Doug", role: "lead" } })),
}));
const estimate = {
  terms: "50% to schedule",
  paymentInstructions: "",
  markupPct: 0,
  convenienceFeeRate: 0,
  depositPct: 0.5,
  lineItems: [{ id: 1, name: "Carpet", description: "tear out", rate: 307, qtyMode: "manual", qty: 1, wastePct: 0, unitLabel: "job", linkedRoomIds: [], sortOrder: 0 }],
  siteMeasure: { items: [], location: { address: "3722 Amity Lane", customer: { id: 5, name: "Alex", email: "alex@x.com", phone: null } } },
};
vi.mock("@/lib/repositories", () => ({
  getInvoiceForSend: vi.fn(async () => ({
    id: 9, invoiceNumber: 7465, status: "draft", amount: 153.5, pct: 0.5, memo: "Deposit",
    terms: "50% to schedule", coverNote: "Your deposit invoice is attached.", paymentInstructions: "WARNING…",
    dueDate: new Date("2026-06-06T00:00:00Z"), publicToken: null, stripePaymentLinkUrl: null,
    estimate,
    org: { name: "All About Hardwood", phone: null, address: null, licenseNumber: null, logo: null },
  })),
  rotateInvoiceToken: vi.fn(async () => "tok_generated_aaaaaaaaaaaaaaaaaaaa"),
  markInvoiceSent: vi.fn(async () => true),
}));
vi.mock("@/lib/email/sendInvoiceEmail", () => ({
  sendInvoiceEmail: vi.fn(async () => ({ ok: true })),
}));

import { POST } from "@/app/api/invoices/[id]/send/route";
import { markInvoiceSent } from "@/lib/repositories";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";

const ctx = { params: Promise.resolve({ id: "9" }) };
function req(body: unknown) {
  return new Request("http://t/api/invoices/9/send", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/invoices/[id]/send", () => {
  it("generates a token, emails, and stamps sent with a snapshot", async () => {
    const res = await POST(req({ to: "alex@x.com", subject: "Invoice #7465" }), ctx);
    expect(res.status).toBe(200);
    expect(sendInvoiceEmail).toHaveBeenCalled();
    expect(markInvoiceSent).toHaveBeenCalledWith(9, "org_1", expect.objectContaining({ snapshot: expect.any(Object) }));
  });
});
```

- [ ] **Step 2: Add `getInvoiceForSend` to the repo**

Append to `lib/repositories/invoiceRepo.ts`:

```ts
/** Hydrate an invoice with everything the send route needs to build a snapshot. */
export async function getInvoiceForSend(id: number, orgId: string) {
  return prisma.invoice.findFirst({
    where: { id, orgId },
    include: {
      estimate: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          siteMeasure: {
            include: {
              items: { orderBy: { sortOrder: "asc" } },
              location: { include: { customer: true } },
            },
          },
        },
      },
      org: {
        select: { name: true, phone: true, address: true, licenseNumber: true, logo: true },
      },
    },
  });
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- "invoices.\[id\].send"`
Expected: FAIL — send route module not found.

- [ ] **Step 4: Implement `app/api/invoices/[id]/send/route.ts`**

```ts
import {
  ConflictError,
  EmailFailedError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { snapshotInvoice } from "@/lib/invoices/snapshot";
import { invoiceIdParams, invoiceSendSchema } from "@/lib/invoices/schema";
import { buildInvoiceProrationSource } from "@/lib/repositories/invoiceRepo";
import { getInvoiceForSend, markInvoiceSent, rotateInvoiceToken } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const POST = apiRoute(
  { minRole: "lead", input: invoiceSendSchema },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const sender = session.user;
    if (!sender?.email || !sender?.name) throw new UnauthorizedError();

    const { id } = invoiceIdParams.parse(params);
    const invoice = await getInvoiceForSend(id, orgId);
    if (!invoice) throw new NotFoundError();
    if (invoice.status === "void") {
      throw new ConflictError("Cannot send a void invoice");
    }

    let token = invoice.publicToken;
    if (input.regenerateLink || !token) {
      token = await rotateInvoiceToken(id, orgId);
      if (!token) throw new NotFoundError();
    }

    const source = buildInvoiceProrationSource(invoice.estimate);
    const customer = invoice.estimate.siteMeasure.location.customer;
    const snapshot = snapshotInvoice(source, {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      memo: invoice.memo,
      terms: invoice.terms,
      paymentInstructions: invoice.paymentInstructions,
      pct: invoice.pct,
      amount: invoice.amount,
      customer: customer
        ? {
            name: customer.name,
            address: invoice.estimate.siteMeasure.location.address,
            email: customer.email,
            phone: customer.phone,
          }
        : null,
      org: {
        name: invoice.org.name,
        address: invoice.org.address,
        phone: invoice.org.phone,
        licenseNumber: invoice.org.licenseNumber,
        logoUrl: invoice.org.logo,
      },
      stripePaymentLinkUrl: invoice.stripePaymentLinkUrl,
    });

    const publicUrl = `${getPublicBaseUrl()}/invoice-review/${token}`;
    const dueLabel = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("en-US")
      : null;

    const sendResult = await sendInvoiceEmail({
      to: input.to,
      subject: input.subject,
      coverNote: invoice.coverNote || undefined,
      paymentInstructions: invoice.paymentInstructions || undefined,
      publicUrl,
      payUrl: invoice.stripePaymentLinkUrl,
      customerName: customer?.name ?? "there",
      org: { name: invoice.org.name, phone: invoice.org.phone, logo: invoice.org.logo },
      invoiceNumber: invoice.invoiceNumber,
      amountDollars: invoice.amount,
      dueLabel,
      replyTo: sender.email,
    });
    if (!sendResult.ok) throw new EmailFailedError(sendResult.error ?? "Email failed");

    const marked = await markInvoiceSent(id, orgId, {
      to: input.to,
      subject: input.subject,
      sentByEmail: sender.email,
      sentByName: sender.name,
      snapshot: snapshot as never,
    });
    if (!marked) throw new NotFoundError();

    return { ok: true };
  }
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- "invoices.\[id\].send"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/api/invoices/[id]/send/route.ts" lib/repositories/invoiceRepo.ts "__tests__/api/invoices.[id].send.test.ts"
git commit -m "feat(invoicing): invoice send route — snapshot + email + token"
```

---

## Task 12: Public pay page

**Files:**
- Create: `components/invoices/PublicInvoiceView.tsx`
- Create: `app/invoice-review/[token]/page.tsx`
- Test: `__tests__/components/invoices/PublicInvoiceView.test.tsx`

- [ ] **Step 1: Implement `components/invoices/PublicInvoiceView.tsx`**

```tsx
import { fmtDollar } from "@/lib/utils";

export interface PublicInvoice {
  invoiceNumber: number;
  status: string;
  dueLabel: string | null;
  amountFormatted: string;
  memo: string | null;
  terms: string;
  paymentInstructions: string;
  payUrl: string | null;
  org: { name: string; phone: string | null; address: string | null; logo: string | null };
  customer: { name: string | null; address: string | null } | null;
  lines: Array<{ name: string; description: string | null; amount: number }>;
}

export function PublicInvoiceView({ invoice }: { invoice: PublicInvoice }) {
  return (
    <main className="max-w-[640px] mx-auto p-8">
      <header className="flex items-start justify-between gap-6 pb-6 border-b border-[var(--line)] mb-6 flex-wrap">
        <div>
          {invoice.org.logo ? (
            // biome-ignore lint/performance/noImgElement: customer-facing static logo URL
            <img src={invoice.org.logo} alt={invoice.org.name} height={40} className="h-10 mb-2" />
          ) : null}
          <div className="text-[14px] font-[700]">{invoice.org.name}</div>
          {invoice.org.phone ? (
            <div className="text-[12px] text-[var(--muted)]">{invoice.org.phone}</div>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Invoice № {invoice.invoiceNumber}
          </div>
          {invoice.dueLabel ? (
            <div className="text-[12px] text-[var(--muted)]">DUE {invoice.dueLabel}</div>
          ) : null}
          <div className="text-[32px] font-[700] leading-none mt-2">{invoice.amountFormatted}</div>
        </div>
      </header>

      {invoice.customer ? (
        <section className="mb-4 text-[13px]">
          <div className="text-[var(--muted)] uppercase text-[10px] tracking-wide">Bill to</div>
          <div className="font-[600]">{invoice.customer.name}</div>
          {invoice.customer.address ? <div>{invoice.customer.address}</div> : null}
        </section>
      ) : null}

      {invoice.terms ? (
        <section className="mb-4 text-[13px]">
          <span className="text-[var(--muted)] uppercase text-[10px] tracking-wide mr-2">Terms</span>
          {invoice.terms}
        </section>
      ) : null}

      <table className="w-full text-[13px] border-collapse">
        <tbody>
          {invoice.lines.map((line, i) => (
            <tr key={`${line.name}-${i}`} className="border-b border-[var(--line)]">
              <td className="py-2 pr-4 align-top">
                <div className="font-[600]">{line.name}</div>
                {line.description ? (
                  <div className="text-[var(--muted)]">{line.description}</div>
                ) : null}
              </td>
              <td className="py-2 text-right align-top whitespace-nowrap">{fmtDollar(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-3 font-[700]">Balance due</td>
            <td className="py-3 text-right font-[700]">{invoice.amountFormatted}</td>
          </tr>
        </tfoot>
      </table>

      {invoice.payUrl ? (
        <div className="my-6">
          <a
            href={invoice.payUrl}
            className="inline-block bg-[var(--accent)] text-white px-6 py-3 rounded-md font-[600]"
          >
            Pay invoice
          </a>
        </div>
      ) : null}

      {invoice.paymentInstructions ? (
        <p className="text-[12px] text-[var(--muted)] mt-6">{invoice.paymentInstructions}</p>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Write the failing component test**

```tsx
// __tests__/components/invoices/PublicInvoiceView.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicInvoiceView } from "@/components/invoices/PublicInvoiceView";

describe("PublicInvoiceView", () => {
  it("renders the balance due, bill-to, and prorated lines", () => {
    render(
      <PublicInvoiceView
        invoice={{
          invoiceNumber: 7465,
          status: "sent",
          dueLabel: "6/6/2026",
          amountFormatted: "$7,403.50",
          memo: "Deposit",
          terms: "50% to schedule, bal upon compl",
          paymentInstructions: "WARNING…",
          payUrl: null,
          org: { name: "All About Hardwood", phone: null, address: null, logo: null },
          customer: { name: "Mr. Alex Hall", address: "3722 Amity Lane" },
          lines: [{ name: "Carpet Tear Out", description: "Remove carpet", amount: 153.5 }],
        }}
      />
    );
    expect(screen.getByText("Balance due")).toBeDefined();
    expect(screen.getByText("Mr. Alex Hall")).toBeDefined();
    expect(screen.getByText("Carpet Tear Out")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `npm test -- PublicInvoiceView`
Expected: first FAIL (if component path wrong), then PASS once Step 1 is in place. Expected final: PASS.

- [ ] **Step 4: Implement `app/invoice-review/[token]/page.tsx`**

```tsx
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicInvoiceView, type PublicInvoice } from "@/components/invoices/PublicInvoiceView";
import { getInvoiceByToken, markInvoiceViewed } from "@/lib/repositories";
import { fmtDollar } from "@/lib/utils";

export const metadata = {
  title: "Invoice — SqFt",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

type SnapshotShape = {
  memo: string | null;
  terms: string;
  paymentInstructions: string;
  stripePaymentLinkUrl: string | null;
  dueDate: string | null;
  org: { name: string; phone: string | null; address: string | null; logoUrl: string | null };
  customer: { name: string | null; address: string | null } | null;
  lines: Array<{ name: string; description: string | null; amount: number }>;
};

export default async function PublicInvoicePage({ params }: Props) {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 128) notFound();

  const invoice = await getInvoiceByToken(token);
  if (!invoice || !invoice.snapshot) notFound();

  if (invoice.status === "sent") {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;
    void markInvoiceViewed(invoice.id, { ip, userAgent });
  }

  const snap = invoice.snapshot as unknown as SnapshotShape;
  const view: PublicInvoice = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    dueLabel: snap.dueDate ? new Date(snap.dueDate).toLocaleDateString("en-US") : null,
    amountFormatted: fmtDollar(invoice.amount),
    memo: snap.memo,
    terms: snap.terms,
    paymentInstructions: snap.paymentInstructions,
    payUrl: snap.stripePaymentLinkUrl,
    org: {
      name: snap.org.name,
      phone: snap.org.phone,
      address: snap.org.address,
      logo: snap.org.logoUrl,
    },
    customer: snap.customer,
    lines: snap.lines,
  };

  return <PublicInvoiceView invoice={view} />;
}
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npm test -- PublicInvoiceView` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/invoices/PublicInvoiceView.tsx "app/invoice-review/[token]/page.tsx" __tests__/components/invoices/PublicInvoiceView.test.tsx
git commit -m "feat(invoicing): public invoice-review pay page"
```

---

## Task 13: Estimate-detail Invoices section

**Files:**
- Create: `components/invoices/InvoicesSection.tsx`
- Modify: `components/estimates/EstimateBuilder.tsx`
- Test: `__tests__/components/invoices/InvoicesSection.test.tsx`

> Before writing code, open `components/estimates/EstimateBuilder.tsx` and locate
> the `EstimateBuilderView` return JSX. Mount `<InvoicesSection estimateId={estimateId} />`
> directly below the existing estimate body (after the totals/line-item area), so
> invoices appear at the bottom of the builder. Pass the same `estimateId` the
> view already receives.

- [ ] **Step 1: Implement `components/invoices/InvoicesSection.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import { fmtDollar } from "@/lib/utils";

interface InvoiceRow {
  id: number;
  invoiceNumber: number;
  status: string;
  amount: number;
  memo: string | null;
  dueDate: string | null;
  payments: Array<{ amount: number }>;
}

async function fetchInvoices(estimateId: number): Promise<InvoiceRow[]> {
  const res = await fetch(`/api/estimates/${estimateId}/invoices`);
  if (!res.ok) {
    const e = await readApiError(res, "Failed to load invoices");
    throw new Error(e.message);
  }
  return res.json();
}

function paidTotal(row: InvoiceRow): number {
  return row.payments.reduce((s, p) => s + p.amount, 0);
}

export function InvoicesSection({ estimateId }: { estimateId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", estimateId],
    queryFn: () => fetchInvoices(estimateId),
  });

  return (
    <section className="mt-8 border-t border-[var(--line)] pt-6">
      <h2 className="text-[16px] font-[700] mb-3">Invoices</h2>
      {isLoading ? <p className="text-[13px] text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <p className="text-[13px] text-[var(--accent)]">{(error as Error).message}</p>
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)]">No invoices yet.</p>
      ) : null}
      {data && data.length > 0 ? (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--muted)] text-[11px] uppercase">
              <th className="py-1">#</th>
              <th className="py-1">Memo</th>
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Amount</th>
              <th className="py-1 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-2">{row.invoiceNumber}</td>
                <td className="py-2">{row.memo ?? "—"}</td>
                <td className="py-2">{row.status}</td>
                <td className="py-2 text-right">{fmtDollar(row.amount)}</td>
                <td className="py-2 text-right">{fmtDollar(paidTotal(row))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Mount the section in `components/estimates/EstimateBuilder.tsx`**

Add the import at the top:

```tsx
import { InvoicesSection } from "@/components/invoices/InvoicesSection";
```

In the `EstimateBuilderView` JSX, immediately before the closing tag of the main content wrapper, add:

```tsx
<InvoicesSection estimateId={estimateId} />
```

- [ ] **Step 3: Write the failing component test**

```tsx
// __tests__/components/invoices/InvoicesSection.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesSection } from "@/components/invoices/InvoicesSection";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify([
          { id: 1, invoiceNumber: 7465, status: "sent", amount: 7403.5, memo: "Deposit", dueDate: null, payments: [{ amount: 1000 }] },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("InvoicesSection", () => {
  it("renders invoice rows with paid totals", async () => {
    render(wrap(<InvoicesSection estimateId={3} />));
    await waitFor(() => expect(screen.getByText("Deposit")).toBeDefined());
    expect(screen.getByText("7465")).toBeDefined();
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- InvoicesSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/InvoicesSection.tsx components/estimates/EstimateBuilder.tsx __tests__/components/invoices/InvoicesSection.test.tsx
git commit -m "feat(invoicing): estimate-detail invoices section"
```

---

## Task 14: Seed invoices + payments

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Seed two invoices on an approved estimate (one paid, one partial) + a void**

In `prisma/seed.ts`, after the block that creates `acceptedEstimate` and before the `// ── Second location` comment, add:

```ts
  // ── Invoices on the accepted estimate (#5006) ────────────────────────────
  // Demonstrates staged billing: a paid 50% deposit, a partially-paid progress
  // invoice, and one voided draft. amounts are illustrative dollar figures.
  const depositInvoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: acceptedEstimate.id,
      invoiceNumber: 1,
      status: "paid",
      amount: 1322.66,
      pct: 0.5,
      memo: "Deposit",
      terms: "50% to schedule, bal upon compl",
      coverNote: "Your deposit invoice is attached. Please remit at your earliest convenience.",
      paymentInstructions:
        "WARNING! We only accept credit cards through our payment link, or a check mailed to 127 S Main St., Monroe, OH 45050.",
      dueDate: new Date("2026-05-04T00:00:00Z"),
      publicToken: "seed-token-invoice-deposit-1111111111111111",
      sentAt: new Date("2026-05-02T12:00:00Z"),
      sentToEmail: "henderson@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      paidAt: new Date("2026-05-03T09:00:00Z"),
      snapshot: { invoiceNumber: 1, seedFixture: true },
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: depositInvoice.id,
      amount: 1322.66,
      method: "check",
      paidAt: new Date("2026-05-03T09:00:00Z"),
      reference: "Check #1042",
      recordedByEmail: user.email,
      recordedByName: user.name,
    },
  });
  await prisma.invoiceEvent.create({
    data: { invoiceId: depositInvoice.id, type: "sent", source: "builder", actorEmail: user.email, actorName: user.name },
  });

  const progressInvoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: acceptedEstimate.id,
      invoiceNumber: 2,
      status: "partial",
      amount: 661.33,
      pct: 0.25,
      memo: "Progress payment",
      terms: "Net 15",
      paymentInstructions: "Check or card via payment link.",
      dueDate: new Date("2026-05-20T00:00:00Z"),
      publicToken: "seed-token-invoice-progress-2222222222222222",
      sentAt: new Date("2026-05-10T12:00:00Z"),
      sentToEmail: "henderson@example.com",
      sentByEmail: user.email,
      sentByName: user.name,
      snapshot: { invoiceNumber: 2, seedFixture: true },
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: progressInvoice.id,
      amount: 300,
      method: "cash",
      paidAt: new Date("2026-05-12T09:00:00Z"),
      recordedByEmail: user.email,
      recordedByName: user.name,
    },
  });

  await prisma.invoice.create({
    data: {
      orgId: org.id,
      estimateId: acceptedEstimate.id,
      invoiceNumber: 3,
      status: "void",
      amount: 100,
      memo: "Mistaken draft",
      voidedAt: new Date("2026-05-11T00:00:00Z"),
    },
  });
  console.log("  ✓ 3 invoices on #5006 (paid deposit, partial progress, void)");
```

- [ ] **Step 2: Bump `nextInvoiceNumber` past the seeded values**

Find the `prisma.organization.update` that sets `nextSiteMeasureNumber, nextEstimateNumber` (near the end of `main`) and add `nextInvoiceNumber: 4` to its `data`:

```ts
    data: { nextSiteMeasureNumber, nextEstimateNumber, nextInvoiceNumber: 4 },
```

- [ ] **Step 3: Add demo-org cleanup for invoices**

The demo wipe deletes customers, which cascades Estimate → Invoice → Payment/InvoiceEvent automatically (FKs are `onDelete: Cascade`). No extra delete needed. Verify by re-running the seed twice.

Run: `npm run seed:dev`
Then run it again: `npm run seed:dev`
Expected: both runs end with `✅ Seed complete!` and no unique-constraint errors (the second run proves re-runnability).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(invoicing): seed sample invoices + payments"
```

---

## Task 15: Full verification + docs

**Files:**
- Modify: `CONTEXT.md`

- [ ] **Step 1: Document the new error codes + concepts in `CONTEXT.md`**

Under "Domain codes", add:

```markdown
- `INVOICE_LOCKED` (409) — caller tried to edit an invoice that has been sent
  (status is no longer `draft`), or record a payment on a `void` invoice.
- `INVOICE_OVERBILL` (409) — caller tried to invoice more than the estimate's
  unbilled balance (estimate total − Σ non-void invoice amounts).
```

And add a short "## Invoice" section after "## Estimate Approval" summarizing: multiple free-form invoices per estimate, proration over the estimate view, the payment ledger, snapshot-on-send, statuses `draft | sent | viewed | partial | paid | void`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the new invoice math/snapshot/schema/route/component tests.

- [ ] **Step 3: Run the linter**

Run: `npx biome ci .`
Expected: PASS — no errors. (Fix any reported formatting/lint issues and re-run.)

- [ ] **Step 4: Run the typechecker**

Run: `npm run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(invoicing): document invoice concepts + error codes"
```

---

## Self-review notes (addressed)

- **Spec coverage:** schema (T1), proration+balance math (T2–T3), snapshot (T4), schemas+errors (T5), repo create/guard (T6) + send/view/payment/void/token (T7), list/create route (T8), detail/patch/void/payment routes (T9), email (T10), send route (T11), public pay page (T12), estimate-detail UI (T13), seed (T14), verification+docs (T15). Stripe execution + logo upload remain explicitly out of scope per the spec.
- **Type consistency:** `ProrationSource`/`InvoiceSnapshot`/`EstimateBilling`/`InvoiceLike` are defined in T2/T4 and consumed unchanged in T6/T7/T11. `nextInvoiceStatus`, `computeInvoiceAmount`, `buildInvoiceProrationSource`, `getInvoiceForSend` are defined in the repo (T6/T7/T11) and imported by routes by the same names.
- **Money guard:** the over-bill comparison uses a `+ 0.005` cent-tolerance consistently in create (T6) and update (T7).
- **Migration safety:** all new NOT NULL columns carry defaults; new tables empty; migration hand-authored and applied via `migrate deploy` (not `migrate dev`).
