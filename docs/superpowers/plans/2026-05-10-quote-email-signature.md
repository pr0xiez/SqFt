# Quote → Email → Signature Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the org-side "send quote by email" flow and the customer-side public viewer with in-browser signature, decline, view tracking, and tamper-evident audit trail; notify org owners on accept/decline.

**Architecture:** Next.js 16 App Router, Prisma 7 + Postgres, Resend for email + react-email for templates, append-only `QuoteEvent` audit log + 1:1 `QuoteSignature` table for the legal record. Public routes use the existing approval token as auth (no `getOrgId()` call); org routes keep the existing tenant pattern. ESIGN/UETA-grade signature: name + email + canvas PNG + IP + UA + timestamp + verbatim consent text + sha256-hashed snapshot of the document at signing.

**Tech Stack:** Next.js 16.2, React 19, Prisma 7, PostgreSQL, Resend, react-email, Tailwind 4, Vitest, Playwright, Zod, Biome.

**Reference docs in this repo:**
- Spec: [docs/superpowers/specs/2026-05-10-quote-email-signature-design.md](../specs/2026-05-10-quote-email-signature-design.md)
- Visual reference: [design/SqFt - Quote Viewer.html](../../../design/SqFt%20-%20Quote%20Viewer.html)
- Existing public viewer (to be rewritten): [components/estimates/PublicQuoteView.tsx](../../../components/estimates/PublicQuoteView.tsx)
- Existing builder (to be modified): [components/quotes/QuoteBuilder.tsx](../../../components/quotes/QuoteBuilder.tsx)
- Existing repo: [lib/repositories/quoteRepo.ts](../../../lib/repositories/quoteRepo.ts)
- Existing schema: [prisma/schema.prisma](../../../prisma/schema.prisma)
- Existing E2E: [tests/e2e/public-quote.spec.ts](../../../tests/e2e/public-quote.spec.ts)

**Repo conventions to follow:**
- Lint with `npx biome ci .` before every commit. Lint must pass.
- Tests: `npx vitest run` (unit/integration), `npx playwright test` (E2E).
- Repo functions go in `lib/repositories/` and are re-exported from `lib/repositories/index.ts`.
- API routes wrap handlers with `withLogging()` and use `getOrgId()` for org-scoped routes.
- Tests mock `@/lib/prisma` and `@/lib/tenant` via `vi.mock()`. See [__tests__/repositories/quoteRepo.test.ts](../../../__tests__/repositories/quoteRepo.test.ts) and [__tests__/api/quotes.[id].test.ts](../../../__tests__/api/quotes.[id].test.ts) for the established pattern.
- Migrations: `npx prisma migrate dev --name <name>` then commit the generated migration directory.
- Always update `prisma/seed.ts` when schema changes (per `AGENTS.md`).

---

## Phase 1 — Schema migration + seed fixtures

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_quote_signing/migration.sql` (auto-generated)
- Modify: `prisma/seed.ts`

### Task 1.1: Add fields to `Quote` and back-relations

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In the `model Quote { … }` block, after the `approvalToken` field add:
```prisma
  status         String    @default("draft") // draft|sent|viewed|accepted|declined
  // (existing `status` field already exists — replace its line, keep position)

  sentAt         DateTime?
  sentToEmail    String?
  sentByEmail    String?
  sentByName     String?
  viewedAt       DateTime?
  acceptedAt     DateTime?
  declinedAt     DateTime?
  declineReason  String?

  signature      QuoteSignature?
  events         QuoteEvent[]
```

Note: `status` already exists with default `"draft"` and the comment `// draft | sent | accepted | declined`. Update the comment to include `viewed` (the actual default + type don't change).

- [ ] **Step 2: Add the `QuoteSignature` model** (insert after the `LineItem` model)

```prisma
model QuoteSignature {
  id              Int      @id @default(autoincrement())
  quoteId         Int      @unique
  quote           Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  signedByName    String
  signedByEmail   String
  signatureData   String   // base64 PNG data URL, ~5-30KB
  signedAt        DateTime @default(now())
  signedIp        String
  signedUserAgent String
  consentText     String
  quoteSnapshot   Json
  snapshotHash    String
}
```

- [ ] **Step 3: Add the `QuoteEvent` model** (insert after `QuoteSignature`)

```prisma
model QuoteEvent {
  id          Int      @id @default(autoincrement())
  quoteId     Int
  quote       Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  type        String   // sent | viewed | accepted | declined | link_rotated | resent
  actorEmail  String?
  actorName   String?
  ip          String?
  userAgent   String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([quoteId, createdAt])
}
```

- [ ] **Step 4: Generate and apply the migration**

Run:
```powershell
npx dotenv -e .env.dev.local -- npx prisma migrate dev --name quote_signing
```

Expected: migration file appears under `prisma/migrations/<timestamp>_quote_signing/` and is applied to the local DB. `npx prisma generate` runs automatically.

- [ ] **Step 5: Verify generated client compiles**

Run:
```powershell
npx tsc --noEmit
```

Expected: no errors. (The new types `QuoteSignature` and `QuoteEvent` will be available under `@/app/generated/prisma/client`.)

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations app/generated
git commit -m "feat(schema): add quote signing fields, QuoteSignature, QuoteEvent"
```

### Task 1.2: Update seed with sent + accepted fixtures

- [ ] **Step 1: Read the existing seed quote section**

Read `prisma/seed.ts` and find where Quote rows are created (search for `prisma.quote.create`). Note the existing customer/estimate/quote IDs you can reuse and which org owns them.

- [ ] **Step 2: Add a "sent" quote fixture**

After the existing draft quote creation (or alongside it), add:
```typescript
// ── Sent quote: emailed but not yet viewed ────────────────────────────────
const sentQuote = await prisma.quote.create({
  data: {
    orgId: org.id,
    estimateId: <existing estimate id var>, // reuse one already created
    quoteNumber: <next int>,
    status: "sent",
    taxRate: 0.08,
    markupPct: 0,
    depositPct: 0.5,
    approvalToken: "seed-token-sent-quote-aaaaaaaaaaaaaaaaaaaa",
    sentAt: new Date("2026-05-08T15:30:00Z"),
    sentToEmail: "buyer@example.com",
    sentByEmail: user.email,
    sentByName: user.name,
    lineItems: {
      create: [
        { name: "LVP install", rate: 4.85, qtyMode: "manual", qty: 545, unitLabel: "ft²", sortOrder: 0 },
      ],
    },
  },
});
await prisma.quoteEvent.create({
  data: {
    quoteId: sentQuote.id,
    type: "sent",
    actorEmail: user.email,
    actorName: user.name,
    metadata: { to: "buyer@example.com", subject: `Quote #${sentQuote.quoteNumber} from ${org.name}` },
  },
});
console.log(`  ✓ Sent quote: #${sentQuote.quoteNumber}`);
```

Adjust `quoteNumber` and `estimateId` to match existing variables in the file. The token MUST be ≥ 32 chars and URL-safe (`[A-Za-z0-9_-]+`).

- [ ] **Step 3: Add an "accepted" quote fixture**

Add after the sent quote:
```typescript
// ── Accepted quote: signed by customer ────────────────────────────────────
const acceptedQuote = await prisma.quote.create({
  data: {
    orgId: org.id,
    estimateId: <existing estimate id var>,
    quoteNumber: <next int>,
    status: "accepted",
    taxRate: 0.08,
    markupPct: 0,
    depositPct: 0.5,
    approvalToken: "seed-token-accepted-quote-bbbbbbbbbbbbbbbb",
    sentAt: new Date("2026-05-01T14:00:00Z"),
    sentToEmail: "henderson@example.com",
    sentByEmail: user.email,
    sentByName: user.name,
    viewedAt: new Date("2026-05-01T16:12:00Z"),
    acceptedAt: new Date("2026-05-02T10:45:00Z"),
    lineItems: {
      create: [
        { name: "LVP install", rate: 4.85, qtyMode: "manual", qty: 545, unitLabel: "ft²", sortOrder: 0 },
        { name: "Underlayment", rate: 0.45, qtyMode: "manual", qty: 495, unitLabel: "ft²", sortOrder: 1 },
      ],
    },
  },
});

// 1×1 transparent PNG as a placeholder signature:
const placeholderSig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
await prisma.quoteSignature.create({
  data: {
    quoteId: acceptedQuote.id,
    signedByName: "Janet Henderson",
    signedByEmail: "henderson@example.com",
    signatureData: placeholderSig,
    signedAt: new Date("2026-05-02T10:45:00Z"),
    signedIp: "203.0.113.42",
    signedUserAgent: "Mozilla/5.0 (seed fixture)",
    consentText: "By typing my name and signing below, I consent to use an electronic signature, and agree this signature has the same legal effect as a handwritten signature on this quote.",
    quoteSnapshot: {
      quoteNumber: acceptedQuote.quoteNumber,
      seedFixture: true,
    },
    snapshotHash: "0000000000000000000000000000000000000000000000000000000000000000",
  },
});
for (const evt of [
  { type: "sent",     actorEmail: user.email,                actorName: user.name,        createdAt: new Date("2026-05-01T14:00:00Z") },
  { type: "viewed",   actorEmail: null,                      actorName: null,             createdAt: new Date("2026-05-01T16:12:00Z") },
  { type: "accepted", actorEmail: "henderson@example.com",   actorName: "Janet Henderson", createdAt: new Date("2026-05-02T10:45:00Z") },
] as const) {
  await prisma.quoteEvent.create({
    data: {
      quoteId: acceptedQuote.id,
      type: evt.type,
      actorEmail: evt.actorEmail,
      actorName: evt.actorName,
      ip: evt.type === "viewed" || evt.type === "accepted" ? "203.0.113.42" : null,
      userAgent: evt.type === "viewed" || evt.type === "accepted" ? "Mozilla/5.0 (seed fixture)" : null,
      createdAt: evt.createdAt,
    },
  });
}
console.log(`  ✓ Accepted quote: #${acceptedQuote.quoteNumber}`);
```

- [ ] **Step 4: Run the seed**

```powershell
npm run seed:dev
```

Expected: no errors; lines for "Sent quote" and "Accepted quote" appear.

- [ ] **Step 5: Spot-check the DB**

Run:
```powershell
npx dotenv -e .env.dev.local -- npx prisma studio
```

Open in browser: confirm one Quote with status `sent` and one with status `accepted`, the `accepted` one has a related `QuoteSignature` row, both have `QuoteEvent` rows.

- [ ] **Step 6: Lint + commit**

```powershell
npx biome ci .
git add prisma/seed.ts
git commit -m "chore(seed): add sent + accepted quote fixtures"
```

---

## Phase 2 — Snapshot + hash utility

**Files:**
- Create: `lib/signature/snapshot.ts`
- Create: `__tests__/lib/signature/snapshot.test.ts`

### Task 2.1: Write the failing test for canonical JSON

- [ ] **Step 1: Create `__tests__/lib/signature/snapshot.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { canonicalize, sha256, snapshotQuote } from "@/lib/signature/snapshot";

describe("canonicalize", () => {
  it("produces deterministic JSON regardless of key insertion order", () => {
    const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
    const b = { c: { x: 2, y: 1 }, a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("emits no whitespace", () => {
    expect(canonicalize({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}');
  });

  it("handles null and missing keys", () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });
});

describe("sha256", () => {
  it("produces the expected hex digest for a known input", () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("is deterministic", () => {
    expect(sha256("x")).toBe(sha256("x"));
  });
});

describe("snapshotQuote", () => {
  const quote = {
    quoteNumber: 5001,
    date: new Date("2026-05-01T00:00:00Z"),
    taxRate: 0.075,
    markupPct: 35,
    depositPct: 0.5,
    estimate: {
      customer: { name: "J. Henderson", address: "1247 Elm St", email: "h@example.com", phone: "555" },
      items: [
        { id: 1, sortOrder: 0, type: "room", name: "Living", w: 14, l: 18, shape: "rect", lshapeData: null, note: null, text: null },
      ],
    },
    lineItems: [
      { id: 1, sortOrder: 0, name: "LVP", rate: 4.85, qtyMode: "manual", qty: 545, wastePct: 0, unitLabel: "ft²", linkedRoomIds: [] },
    ],
    org: { name: "Mike's Flooring", address: "842 Industrial Pkwy", phone: "(614) 555-0100", licenseNumber: "OH-FL-44129", logo: null },
  };

  it("produces a snapshot containing all required top-level keys", () => {
    const snap = snapshotQuote(quote);
    expect(snap).toMatchObject({
      quoteNumber: 5001,
      taxRate: 0.075,
      markupPct: 35,
      depositPct: 0.5,
      customer: expect.objectContaining({ name: "J. Henderson" }),
      org: expect.objectContaining({ name: "Mike's Flooring" }),
      items: expect.any(Array),
      lineItems: expect.any(Array),
      totals: expect.objectContaining({
        subtotal: expect.any(Number),
        tax: expect.any(Number),
        total: expect.any(Number),
      }),
    });
  });

  it("produces a stable hash for the same input", () => {
    const a = sha256(canonicalize(snapshotQuote(quote)));
    const b = sha256(canonicalize(snapshotQuote(quote)));
    expect(a).toBe(b);
  });

  it("changes the hash when a line item rate changes", () => {
    const a = sha256(canonicalize(snapshotQuote(quote)));
    const modified = { ...quote, lineItems: [{ ...quote.lineItems[0], rate: 4.86 }] };
    const b = sha256(canonicalize(snapshotQuote(modified)));
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

```powershell
npx vitest run __tests__/lib/signature/snapshot.test.ts
```

Expected: FAIL — module not found.

### Task 2.2: Implement the snapshot utility

- [ ] **Step 1: Create `lib/signature/snapshot.ts`**

```typescript
import { createHash } from "node:crypto";
import { getEffectiveQty, type LineItemCalc, liSubtotal, type RoomItem } from "@/lib/utils";

export interface QuoteSnapshotInput {
  quoteNumber: number;
  date: Date | string;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  estimate: {
    customer: { name: string | null; address: string | null; email: string | null; phone: string | null } | null;
    items: RoomItem[];
  };
  lineItems: LineItemCalc[];
  org: { name: string; address: string | null; phone: string | null; licenseNumber: string | null; logo: string | null };
}

export interface QuoteSnapshot {
  quoteNumber: number;
  date: string; // ISO
  taxRate: number;
  markupPct: number;
  depositPct: number;
  customer: { name: string | null; address: string | null; email: string | null; phone: string | null } | null;
  org: { name: string; address: string | null; phone: string | null; licenseNumber: string | null; logo: string | null };
  items: Array<Record<string, unknown>>;
  lineItems: Array<Record<string, unknown>>;
  totals: { subtotal: number; markup: number; tax: number; total: number; deposit: number };
}

/**
 * Build the legal-record snapshot of a Quote. This is what the customer
 * is signing. Everything that affects price or scope must be in here.
 */
export function snapshotQuote(input: QuoteSnapshotInput): QuoteSnapshot {
  const rooms = input.estimate.items.filter((i): i is RoomItem => i.type === "room");
  const subtotal = input.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const markup = subtotal * (input.markupPct / 100);
  const beforeTax = subtotal + markup;
  const tax = beforeTax * input.taxRate;
  const total = beforeTax + tax;
  const deposit = total * input.depositPct;

  return {
    quoteNumber: input.quoteNumber,
    date: typeof input.date === "string" ? input.date : input.date.toISOString(),
    taxRate: input.taxRate,
    markupPct: input.markupPct,
    depositPct: input.depositPct,
    customer: input.estimate.customer,
    org: input.org,
    items: input.estimate.items.map((i) => ({
      id: i.id,
      sortOrder: i.sortOrder ?? 0,
      type: i.type,
      name: i.name,
      shape: i.shape,
      w: i.w,
      l: i.l,
      lshapeData: i.lshapeData,
      note: i.note,
      text: i.text,
    })),
    lineItems: input.lineItems.map((li) => ({
      id: li.id,
      sortOrder: li.sortOrder,
      name: li.name,
      rate: li.rate,
      qtyMode: li.qtyMode,
      qty: li.qty,
      wastePct: li.wastePct,
      unitLabel: li.unitLabel,
      linkedRoomIds: li.linkedRoomIds,
      effectiveQty: getEffectiveQty(li, rooms),
      subtotal: liSubtotal(li, rooms),
    })),
    totals: { subtotal, markup, tax, total, deposit },
  };
}

/** Deterministic JSON: keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/** SHA-256 hex digest. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
```

- [ ] **Step 2: Run the tests, expect pass**

```powershell
npx vitest run __tests__/lib/signature/snapshot.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Lint + commit**

```powershell
npx biome ci .
git add lib/signature/ __tests__/lib/signature/
git commit -m "feat(signature): canonical JSON + sha256 snapshot of quote"
```

---

## Phase 3 — Email infrastructure (Resend wrapper)

**Files:**
- Modify: `package.json` (add deps)
- Create: `lib/email/client.ts`
- Create: `lib/email/test-helpers.ts`
- Create: `__tests__/lib/email/client.test.ts`
- Modify: `.env.example` (or create if missing)

### Task 3.1: Install dependencies

- [ ] **Step 1: Install runtime deps**

```powershell
npm install resend react-email @react-email/components
```

Expected: package.json + package-lock.json updated, install succeeds.

- [ ] **Step 2: Verify lockfile + types**

```powershell
npx tsc --noEmit
```

Expected: no errors.

### Task 3.2: Build the client wrapper with test mode

- [ ] **Step 1: Write the failing test** at `__tests__/lib/email/client.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSentEmails, sentEmails } from "@/lib/email/test-helpers";
import { sendEmail } from "@/lib/email/client";

beforeEach(() => resetSentEmails());

describe("sendEmail (test mode)", () => {
  it("records emails in memory and does not call Resend when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({
      to: "buyer@example.com",
      subject: "Hello",
      react: { type: "div", props: { children: "test" } } as never,
      replyTo: "sender@example.com",
    });
    expect(result.ok).toBe(true);
    expect(sentEmails()).toHaveLength(1);
    expect(sentEmails()[0].to).toBe("buyer@example.com");
    expect(sentEmails()[0].subject).toBe("Hello");
    expect(sentEmails()[0].replyTo).toBe("sender@example.com");
  });

  it("supports multiple recipients", async () => {
    delete process.env.RESEND_API_KEY;
    await sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Multi",
      react: { type: "div", props: {} } as never,
    });
    expect(sentEmails()[0].to).toEqual(["a@example.com", "b@example.com"]);
  });
});
```

- [ ] **Step 2: Run test, expect fail (module missing)**

```powershell
npx vitest run __tests__/lib/email/client.test.ts
```

Expected: FAIL — module `@/lib/email/client` not found.

- [ ] **Step 3: Create `lib/email/test-helpers.ts`**

```typescript
import type { ReactElement } from "react";

export interface RecordedEmail {
  to: string | string[];
  subject: string;
  from: string;
  replyTo?: string;
  react: ReactElement;
  recordedAt: Date;
}

const _sent: RecordedEmail[] = [];

export function recordEmail(email: RecordedEmail): void {
  _sent.push(email);
}

export function sentEmails(): RecordedEmail[] {
  return [..._sent];
}

export function resetSentEmails(): void {
  _sent.length = 0;
}
```

- [ ] **Step 4: Create `lib/email/client.ts`**

```typescript
import type { ReactElement } from "react";
import { Resend } from "resend";
import { logError } from "@/lib/logger";
import { recordEmail } from "./test-helpers";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const FROM = process.env.EMAIL_FROM ?? "SqFt Quotes <quotes@sqft.app>";

let _client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

/**
 * Send a transactional email. In test mode (NODE_ENV=test or RESEND_API_KEY
 * unset) records the call into an in-memory list instead of hitting the network.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  if (!client || process.env.NODE_ENV === "test") {
    recordEmail({
      to: input.to,
      subject: input.subject,
      from: FROM,
      replyTo: input.replyTo,
      react: input.react,
      recordedAt: new Date(),
    });
    return { ok: true, id: "test-mode" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      react: input.react,
      replyTo: input.replyTo,
    });
    if (error) {
      logError({ errorMessage: `Resend error: ${error.message}`, err: error });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown send error";
    logError({ errorMessage: `sendEmail threw: ${msg}`, err });
    return { ok: false, error: msg };
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

```powershell
npx vitest run __tests__/lib/email/client.test.ts
```

Expected: 2 tests pass.

### Task 3.3: Document env vars

- [ ] **Step 1: Check whether `.env.example` exists**

If yes, append. If no, create at the repo root with the contents below.

- [ ] **Step 2: Add the new env vars to `.env.example`**

```
# Resend (transactional email)
RESEND_API_KEY=
EMAIL_FROM="SqFt Quotes <quotes@sqft.app>"

# Public base URL for /q/<token> links in emails
PUBLIC_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Lint + commit**

```powershell
npx biome ci .
git add package.json package-lock.json lib/email/ __tests__/lib/email/ .env.example
git commit -m "feat(email): Resend wrapper with test-mode no-op"
```

---

## Phase 4 — Customer email template + send API

**Files:**
- Create: `lib/email/CustomerQuoteEmail.tsx` (react-email template)
- Create: `lib/email/sendQuoteEmail.ts`
- Create: `__tests__/lib/email/sendQuoteEmail.test.ts`
- Modify: `lib/repositories/quoteRepo.ts` (add `markQuoteSent`)
- Modify: `lib/repositories/index.ts` (re-export new repo)
- Create: `lib/repositories/quoteEventRepo.ts`
- Modify: `__tests__/repositories/quoteRepo.test.ts` (extend)
- Create: `__tests__/repositories/quoteEventRepo.test.ts`
- Create: `app/api/quotes/[id]/send/route.ts`
- Create: `__tests__/api/quotes.[id].send.test.ts`

### Task 4.1: `quoteEventRepo` — append-only writer

- [ ] **Step 1: Write the failing test** at `__tests__/repositories/quoteEventRepo.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteEventCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { quoteEvent: { create: quoteEventCreate } },
}));

const { writeQuoteEvent } = await import("@/lib/repositories/quoteEventRepo");

beforeEach(() => vi.clearAllMocks());

describe("writeQuoteEvent", () => {
  it("creates a row with the given type and metadata", async () => {
    quoteEventCreate.mockResolvedValue({ id: 1 });
    await writeQuoteEvent({
      quoteId: 42,
      type: "sent",
      actorEmail: "alex@org.com",
      actorName: "Alex",
      metadata: { to: "buyer@example.com" },
    });
    expect(quoteEventCreate).toHaveBeenCalledWith({
      data: {
        quoteId: 42,
        type: "sent",
        actorEmail: "alex@org.com",
        actorName: "Alex",
        ip: undefined,
        userAgent: undefined,
        metadata: { to: "buyer@example.com" },
      },
    });
  });
});
```

- [ ] **Step 2: Run test, expect fail (module missing)**

```powershell
npx vitest run __tests__/repositories/quoteEventRepo.test.ts
```

- [ ] **Step 3: Create `lib/repositories/quoteEventRepo.ts`**

```typescript
import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type QuoteEventType =
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "link_rotated"
  | "resent";

export interface WriteQuoteEventInput {
  quoteId: number;
  type: QuoteEventType;
  actorEmail?: string | null;
  actorName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

type Tx = Pick<PrismaClient, "quoteEvent">;

export async function writeQuoteEvent(
  input: WriteQuoteEventInput,
  client: Tx = prisma
): Promise<void> {
  await client.quoteEvent.create({
    data: {
      quoteId: input.quoteId,
      type: input.type,
      actorEmail: input.actorEmail ?? null,
      actorName: input.actorName ?? null,
      ip: input.ip ?? undefined,
      userAgent: input.userAgent ?? undefined,
      metadata: input.metadata ?? undefined,
    },
  });
}
```

- [ ] **Step 4: Re-export from `lib/repositories/index.ts`**

Add:
```typescript
export * from "./quoteEventRepo";
```

- [ ] **Step 5: Run tests, expect pass**

```powershell
npx vitest run __tests__/repositories/quoteEventRepo.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add lib/repositories/quoteEventRepo.ts lib/repositories/index.ts __tests__/repositories/quoteEventRepo.test.ts
git commit -m "feat(repo): writeQuoteEvent for audit log"
```

### Task 4.2: `markQuoteSent` repo function

- [ ] **Step 1: Add a failing test** in `__tests__/repositories/quoteRepo.test.ts`

Append to the existing file (after the existing describe blocks):

```typescript
describe("markQuoteSent", () => {
  it("updates Quote send fields and writes a 'sent' event when first send", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "draft", sentAt: null });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const { markQuoteSent } = await import("@/lib/repositories/quoteRepo");
    const eventCreate = vi.fn().mockResolvedValue({ id: 9 });
    txMock.quoteEvent = { create: eventCreate };

    const result = await markQuoteSent(1, "org1", {
      to: "buyer@example.com",
      subject: "Quote #5001 from Acme",
      sentByEmail: "alex@org.com",
      sentByName: "Alex",
    });

    expect(result).toBe(true);
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: {
        status: "sent",
        sentAt: expect.any(Date),
        sentToEmail: "buyer@example.com",
        sentByEmail: "alex@org.com",
        sentByName: "Alex",
      },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 1,
          type: "sent",
          actorEmail: "alex@org.com",
          actorName: "Alex",
          metadata: { to: "buyer@example.com", subject: "Quote #5001 from Acme" },
        }),
      })
    );
  });

  it("writes a 'resent' event when sentAt was already set", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "viewed", sentAt: new Date() });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const { markQuoteSent } = await import("@/lib/repositories/quoteRepo");
    const eventCreate = vi.fn().mockResolvedValue({ id: 10 });
    txMock.quoteEvent = { create: eventCreate };

    await markQuoteSent(1, "org1", {
      to: "buyer@example.com",
      subject: "Resend",
      sentByEmail: "alex@org.com",
      sentByName: "Alex",
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "resent" }) })
    );
  });

  it("returns false when quote not in org", async () => {
    quoteFindFirst.mockResolvedValue(null);
    const { markQuoteSent } = await import("@/lib/repositories/quoteRepo");
    const result = await markQuoteSent(99, "org1", {
      to: "x@x.com", subject: "x", sentByEmail: "a@a.com", sentByName: "A",
    });
    expect(result).toBe(false);
  });
});
```

Also extend the existing `txMock` declaration at the top of the file to include `quoteEvent: { create: vi.fn() }` so the mock surface compiles.

- [ ] **Step 2: Run test, expect fail (function missing)**

- [ ] **Step 3: Add `markQuoteSent` to `lib/repositories/quoteRepo.ts`**

After the existing `rotateApprovalToken` function:

```typescript
export interface MarkQuoteSentInput {
  to: string;
  subject: string;
  sentByEmail: string;
  sentByName: string;
}

/**
 * Mark a quote as sent (or resent). Updates Quote.status/sentAt/etc. and
 * appends a QuoteEvent of type 'sent' (first send) or 'resent' (subsequent).
 * Returns false if the quote isn't in the org.
 */
export async function markQuoteSent(
  id: number,
  orgId: string,
  input: MarkQuoteSentInput
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, sentAt: true },
    });
    if (!existing) return false;

    await tx.quote.updateMany({
      where: { id, orgId },
      data: {
        status: existing.status === "accepted" || existing.status === "declined"
          ? existing.status
          : "sent",
        sentAt: new Date(),
        sentToEmail: input.to,
        sentByEmail: input.sentByEmail,
        sentByName: input.sentByName,
      },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId: id,
        type: existing.sentAt ? "resent" : "sent",
        actorEmail: input.sentByEmail,
        actorName: input.sentByName,
        metadata: { to: input.to, subject: input.subject },
      },
    });

    return true;
  });
}
```

Note: the `accepted`/`declined` branch is defensive — the API layer rejects these with 409 first, but if anyone calls this repo directly we won't silently downgrade their status.

- [ ] **Step 4: Run repo tests, expect all pass**

```powershell
npx vitest run __tests__/repositories/quoteRepo.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add lib/repositories/quoteRepo.ts __tests__/repositories/quoteRepo.test.ts
git commit -m "feat(repo): markQuoteSent with sent/resent event"
```

### Task 4.3: Customer email template

- [ ] **Step 1: Create `lib/email/CustomerQuoteEmail.tsx`**

```tsx
import { Body, Button, Container, Head, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";

export interface CustomerQuoteEmailProps {
  customerName: string;
  orgName: string;
  orgPhone: string | null;
  orgLogo: string | null;
  quoteNumber: number;
  totalFormatted: string; // e.g. "$6,326.22"
  message?: string;
  publicUrl: string;
}

const main = { backgroundColor: "#f4f3ed", fontFamily: "system-ui, sans-serif" };
const container = { backgroundColor: "#fafaf7", padding: "32px", maxWidth: "560px", margin: "0 auto", borderRadius: "8px" };
const heading = { fontSize: "20px", fontWeight: 700, color: "#1a1a17", margin: "0 0 8px" };
const muted = { fontSize: "12px", color: "#6b6b66", margin: "0" };
const para = { fontSize: "14px", color: "#3a3a35", lineHeight: 1.6, margin: "16px 0" };
const card = { backgroundColor: "#ffffff", border: "1px solid #e6e4dd", borderRadius: "6px", padding: "16px", margin: "16px 0" };
const button = { backgroundColor: "#c0341a", color: "#ffffff", padding: "14px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 600, textDecoration: "none", display: "inline-block" };
const fallback = { fontSize: "11px", color: "#6b6b66", marginTop: "12px", wordBreak: "break-all" as const };

export function CustomerQuoteEmail(props: CustomerQuoteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Quote #{props.quoteNumber} from {props.orgName} — {props.totalFormatted}
      </Preview>
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
            <Text style={para}>Hi {props.customerName},</Text>
            {props.message ? <Text style={para}>{props.message}</Text> : null}
            <Text style={para}>
              Your quote is ready. Click below to review and sign.
            </Text>
          </Section>
          <Section style={card}>
            <Text style={muted}>QUOTE #{props.quoteNumber}</Text>
            <Text style={{ ...heading, fontSize: "24px", margin: "4px 0 0" }}>
              {props.totalFormatted}
            </Text>
          </Section>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button href={props.publicUrl} style={button}>
              View &amp; sign quote
            </Button>
            <Text style={fallback}>Or paste this link: {props.publicUrl}</Text>
          </Section>
          <Hr />
          <Text style={muted}>
            From {props.orgName} · Powered by SqFt
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Create `lib/email/sendQuoteEmail.ts`**

```typescript
import { fmtDollar } from "@/lib/utils";
import { sendEmail, type SendEmailResult } from "./client";
import { CustomerQuoteEmail } from "./CustomerQuoteEmail";

export interface SendQuoteEmailInput {
  to: string;
  subject: string;
  message?: string;
  publicUrl: string;
  customerName: string;
  org: { name: string; phone: string | null; logo: string | null };
  quoteNumber: number;
  totalDollars: number;
  replyTo: string;
}

export function sendQuoteEmail(input: SendQuoteEmailInput): Promise<SendEmailResult> {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    react: CustomerQuoteEmail({
      customerName: input.customerName || "there",
      orgName: input.org.name,
      orgPhone: input.org.phone,
      orgLogo: input.org.logo,
      quoteNumber: input.quoteNumber,
      totalFormatted: fmtDollar(input.totalDollars),
      message: input.message,
      publicUrl: input.publicUrl,
    }),
  });
}
```

- [ ] **Step 3: Write the test** at `__tests__/lib/email/sendQuoteEmail.test.ts`

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { resetSentEmails, sentEmails } from "@/lib/email/test-helpers";
import { sendQuoteEmail } from "@/lib/email/sendQuoteEmail";

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  resetSentEmails();
});

describe("sendQuoteEmail", () => {
  it("records a single email with the configured subject and reply-to", async () => {
    const result = await sendQuoteEmail({
      to: "buyer@example.com",
      subject: "Quote #5001 from Acme",
      message: "Hi Janet — please review.",
      publicUrl: "https://app.sqft.app/q/abc123",
      customerName: "Janet",
      org: { name: "Acme Floors", phone: "555-1234", logo: null },
      quoteNumber: 5001,
      totalDollars: 6326.22,
      replyTo: "alex@acme.com",
    });

    expect(result.ok).toBe(true);
    const sent = sentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Quote #5001 from Acme");
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].replyTo).toBe("alex@acme.com");
  });
});
```

- [ ] **Step 4: Run, expect pass**

```powershell
npx vitest run __tests__/lib/email/
```

- [ ] **Step 5: Commit**

```powershell
git add lib/email/CustomerQuoteEmail.tsx lib/email/sendQuoteEmail.ts __tests__/lib/email/sendQuoteEmail.test.ts
git commit -m "feat(email): customer quote email template + send wrapper"
```

### Task 4.4: `POST /api/quotes/[id]/send` route

- [ ] **Step 1: Write the failing test** at `__tests__/api/quotes.[id].send.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuote: vi.fn(),
  rotateApprovalToken: vi.fn(),
  markQuoteSent: vi.fn(),
  writeQuoteEvent: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({ getOrgId: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email/sendQuoteEmail", () => ({ sendQuoteEmail: vi.fn() }));
vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: pass-through
  withLogging: (fn: any) => fn,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const { getQuote, rotateApprovalToken, markQuoteSent, writeQuoteEvent } =
  await import("@/lib/repositories");
const { getOrgId } = await import("@/lib/tenant");
const { auth } = await import("@/lib/auth");
const { sendQuoteEmail } = await import("@/lib/email/sendQuoteEmail");
const { POST } = await import("@/app/api/quotes/[id]/send/route");

const mockGetOrgId = vi.mocked(getOrgId);
const mockGetQuote = vi.mocked(getQuote);
const mockRotate = vi.mocked(rotateApprovalToken);
const mockMarkSent = vi.mocked(markQuoteSent);
const mockWriteEvent = vi.mocked(writeQuoteEvent);
const mockAuth = vi.mocked(auth);
const mockSendQuoteEmail = vi.mocked(sendQuoteEmail);

function makeReq(body: unknown) {
  return new Request("http://localhost/api/quotes/1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.sqft.app";
});

describe("POST /api/quotes/[id]/send", () => {
  it("sends a fresh email when the quote already has a token", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({ user: { email: "alex@org.com", name: "Alex" } } as never);
    mockGetQuote.mockResolvedValue({
      id: 1,
      orgId: "org1",
      status: "draft",
      approvalToken: "token-xyz",
      quoteNumber: 5001,
      taxRate: 0.08,
      markupPct: 0,
      depositPct: 0.5,
      lineItems: [{ id: 1, name: "LVP", rate: 4.85, qtyMode: "manual", qty: 100, wastePct: 0, unitLabel: "ft²", linkedRoomIds: [], sortOrder: 0 }],
      estimate: {
        items: [],
        customer: { name: "Janet", email: "henderson@example.com" },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test stub
    } as any);
    mockSendQuoteEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(
      makeReq({ to: "henderson@example.com", subject: "Q5001" }),
      params("1")
    );

    expect(res.status).toBe(200);
    expect(mockRotate).not.toHaveBeenCalled();
    expect(mockSendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "henderson@example.com",
        subject: "Q5001",
        replyTo: "alex@org.com",
        publicUrl: "https://app.sqft.app/q/token-xyz",
      })
    );
    expect(mockMarkSent).toHaveBeenCalledWith(1, "org1", expect.any(Object));
  });

  it("rotates the token when none exists and logs link_rotated", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({ user: { email: "alex@org.com", name: "Alex" } } as never);
    mockGetQuote.mockResolvedValue({
      id: 1, orgId: "org1", status: "draft", approvalToken: null, quoteNumber: 5001,
      taxRate: 0.08, markupPct: 0, depositPct: 0.5,
      lineItems: [], estimate: { items: [], customer: { name: "X", email: "x@x.com" } },
      // biome-ignore lint/suspicious/noExplicitAny: test stub
    } as any);
    mockRotate.mockResolvedValue("new-token-aaa");
    mockSendQuoteEmail.mockResolvedValue({ ok: true });
    mockMarkSent.mockResolvedValue(true);

    const res = await POST(makeReq({ to: "x@x.com", subject: "x" }), params("1"));
    expect(res.status).toBe(200);
    expect(mockRotate).toHaveBeenCalledWith(1, "org1");
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "link_rotated", actorEmail: "alex@org.com" })
    );
    expect(mockSendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ publicUrl: "https://app.sqft.app/q/new-token-aaa" })
    );
  });

  it("returns 409 when the quote is already accepted", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({ user: { email: "alex@org.com", name: "Alex" } } as never);
    mockGetQuote.mockResolvedValue({ id: 1, orgId: "org1", status: "accepted", approvalToken: "t" } as never);
    const res = await POST(makeReq({ to: "x@x.com", subject: "x" }), params("1"));
    expect(res.status).toBe(409);
    expect(mockSendQuoteEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the quote isn't in the org", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({ user: { email: "alex@org.com", name: "Alex" } } as never);
    mockGetQuote.mockResolvedValue(null);
    const res = await POST(makeReq({ to: "x@x.com", subject: "x" }), params("99"));
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid email", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({ user: { email: "alex@org.com", name: "Alex" } } as never);
    const res = await POST(makeReq({ to: "not-an-email", subject: "x" }), params("1"));
    expect(res.status).toBe(400);
  });

  it("does NOT mark sent when sendQuoteEmail fails", async () => {
    mockGetOrgId.mockResolvedValue("org1");
    mockAuth.mockResolvedValue({ user: { email: "alex@org.com", name: "Alex" } } as never);
    mockGetQuote.mockResolvedValue({
      id: 1, orgId: "org1", status: "draft", approvalToken: "t",
      quoteNumber: 5001, taxRate: 0.08, markupPct: 0, depositPct: 0.5,
      lineItems: [], estimate: { items: [], customer: { name: "X", email: "x@x.com" } },
    } as never);
    mockSendQuoteEmail.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(makeReq({ to: "x@x.com", subject: "x" }), params("1"));
    expect(res.status).toBe(502);
    expect(mockMarkSent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect fail (route + auth import missing)**

```powershell
npx vitest run __tests__/api/quotes.[id].send.test.ts
```

- [ ] **Step 3: Verify the auth import path**

The mock above uses `@/lib/auth`. Check that `lib/auth.ts` exports an `auth` function (NextAuth v5 pattern). If the export name differs, update both the test and the route to match.

```powershell
npx grep "export" lib/auth.ts
```

If it exports a different shape (e.g. `getServerSession`), substitute that name throughout.

- [ ] **Step 4: Create `app/api/quotes/[id]/send/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sendQuoteEmail } from "@/lib/email/sendQuoteEmail";
import { logError } from "@/lib/logger";
import {
  getQuote,
  markQuoteSent,
  rotateApprovalToken,
  writeQuoteEvent,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { liSubtotal, type RoomItem } from "@/lib/utils";
import { withLogging } from "@/lib/with-logging";

const bodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  regenerateLink: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const session = await auth();
      const sender = session?.user;
      if (!sender?.email || !sender?.name) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;
      const quoteId = parseInt(id, 10);
      if (Number.isNaN(quoteId)) {
        return NextResponse.json({ error: "Bad id" }, { status: 400 });
      }

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid body" },
          { status: 400 }
        );
      }
      const { to, subject, message, regenerateLink } = parsed.data;

      const quote = await getQuote(quoteId, orgId);
      if (!quote) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (quote.status === "accepted" || quote.status === "declined") {
        return NextResponse.json(
          { error: `Cannot re-send a ${quote.status} quote` },
          { status: 409 }
        );
      }

      let token = quote.approvalToken;
      if (regenerateLink || !token) {
        token = await rotateApprovalToken(quoteId, orgId);
        if (!token) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        await writeQuoteEvent({
          quoteId,
          type: "link_rotated",
          actorEmail: sender.email,
          actorName: sender.name,
        });
      }

      const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
      const publicUrl = `${baseUrl}/q/${token}`;

      // Compute totals from the quote we already fetched
      const rooms = (quote.estimate.items ?? []).filter(
        (i): i is RoomItem => i.type === "room"
      );
      const subtotal = quote.lineItems.reduce(
        (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
        0
      );
      const beforeTax = subtotal * (1 + quote.markupPct / 100);
      const total = beforeTax * (1 + quote.taxRate);

      // Load org for email branding
      const org = await getOrgForEmail(orgId);

      const sendResult = await sendQuoteEmail({
        to,
        subject,
        message,
        publicUrl,
        customerName: quote.estimate.customer?.name ?? "there",
        org: { name: org.name, phone: org.phone, logo: org.logo },
        quoteNumber: quote.quoteNumber,
        totalDollars: total,
        replyTo: sender.email,
      });

      if (!sendResult.ok) {
        return NextResponse.json(
          { error: sendResult.error ?? "Email failed" },
          { status: 502 }
        );
      }

      const marked = await markQuoteSent(quoteId, orgId, {
        to,
        subject,
        sentByEmail: sender.email,
        sentByName: sender.name,
      });
      if (!marked) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // best-effort save customer email if it changed (we do this last so a failure
      // doesn't block the user-visible success)
      if (
        quote.estimate.customer &&
        quote.estimate.customer.email !== to
      ) {
        // intentionally fire-and-forget; not critical
        void updateCustomerEmail(quote.estimate.customer.id, orgId, to);
      }

      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      logError({
        errorMessage: err instanceof Error ? err.message : "send quote failed",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

// ── helpers ──────────────────────────────────────────────────────────────────

async function getOrgForEmail(orgId: string) {
  const { prisma } = await import("@/lib/prisma");
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, phone: true, logo: true },
  });
  return org;
}

async function updateCustomerEmail(customerId: number, orgId: string, email: string) {
  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.customer.updateMany({
      where: { id: customerId, orgId },
      data: { email },
    });
  } catch (err) {
    logError({ errorMessage: "Failed to save customer email", err });
  }
}
```

Notes for the implementer:
- `lib/auth.ts` exports `auth` from NextAuth v5 — the imports above are correct.
- The customer-email save is fire-and-forget on purpose. If you want stricter "only save when an explicit toggle is on", add a `saveCustomerEmail: boolean` field to `bodySchema` and gate the `updateCustomerEmail` call on it (the Send dialog in Phase 5 already has the checkbox UI for this; we keep it simple here since the dialog only sends the address through when the user has confirmed it).

- [ ] **Step 5: Run tests, expect pass**

```powershell
npx vitest run __tests__/api/quotes.[id].send.test.ts
```

If a test fails because `auth` returns a different shape, update the route + test together.

- [ ] **Step 6: Lint + commit**

```powershell
npx biome ci .
git add app/api/quotes/[id]/send/ __tests__/api/quotes.[id].send.test.ts
git commit -m "feat(api): POST /api/quotes/[id]/send"
```

---

## Phase 5 — SendQuoteDialog + builder integration

**Files:**
- Create: `components/quotes/SendQuoteDialog.tsx`
- Create: `lib/hooks/useSendQuote.ts` (or extend `lib/hooks/useQuotes.ts`)
- Modify: `components/quotes/QuoteBuilder.tsx`

### Task 5.1: Add the React Query mutation

- [ ] **Step 1: Read `lib/hooks/useQuotes.ts`**

Confirm the file exists and follow its pattern (likely `useMutation` returning a typed mutator). Add the new hook in the same file.

- [ ] **Step 2: Add `useSendQuote`**

Append at the end of `lib/hooks/useQuotes.ts`:

```typescript
export interface SendQuoteVariables {
  to: string;
  subject: string;
  message?: string;
  regenerateLink?: boolean;
}

export function useSendQuote(quoteId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SendQuoteVariables): Promise<{ ok: true }> => {
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Send failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote", quoteId] });
    },
  });
}
```

If `useQueryClient` / `useMutation` aren't already imported, add:
```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
```

(Existing functions in this file likely already import them; reuse the existing import line.)

- [ ] **Step 3: Commit**

```powershell
git add lib/hooks/useQuotes.ts
git commit -m "feat(hooks): useSendQuote mutation"
```

### Task 5.2: SendQuoteDialog component

- [ ] **Step 1: Create `components/quotes/SendQuoteDialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useSendQuote } from "@/lib/hooks/useQuotes";

interface Props {
  quoteId: number;
  quoteNumber: number;
  orgName: string;
  customerEmail: string | null;
  hasToken: boolean;
  open: boolean;
  onClose: () => void;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function SendQuoteDialog({
  quoteId,
  quoteNumber,
  orgName,
  customerEmail,
  hasToken,
  open,
  onClose,
}: Props) {
  const send = useSendQuote(quoteId);
  const { showToast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [regenerate, setRegenerate] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(customerEmail ?? "");
      setSubject(`Quote #${quoteNumber} from ${orgName}`);
      setMessage("");
      setRegenerate(false);
    }
  }, [open, customerEmail, quoteNumber, orgName]);

  if (!open) return null;

  const canSend = isEmail(to) && subject.trim().length > 0 && !send.isPending;

  async function onSend() {
    try {
      await send.mutateAsync({
        to: to.trim(),
        subject: subject.trim(),
        message: message.trim() || undefined,
        regenerateLink: regenerate || undefined,
      });
      showToast("Quote sent");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-quote-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[480px] w-[calc(100%-32px)] shadow-2xl">
        <h2 id="send-quote-title" className="text-[20px] font-[700] tracking-[-0.02em] mb-1">
          Send quote to customer
        </h2>
        <p className="text-[13px] text-[var(--ink-2)] mb-4">
          They'll get an email with a link to review and sign.
        </p>

        <label className="block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1" htmlFor="send-to">
          To
        </label>
        <input
          id="send-to"
          type="email"
          className="w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="janet@example.com"
          required
        />

        <label className="block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1" htmlFor="send-subject">
          Subject
        </label>
        <input
          id="send-subject"
          type="text"
          className="w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <label className="block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1" htmlFor="send-message">
          Message (optional)
        </label>
        <textarea
          id="send-message"
          className="w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 min-h-[96px] resize-y focus:outline-none focus:border-[var(--ink)]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hi Janet — here's the quote we discussed."
        />

        {hasToken && (
          <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)] mb-4">
            <input
              type="checkbox"
              checked={regenerate}
              onChange={(e) => setRegenerate(e.target.checked)}
            />
            Generate a new link (invalidates the old one)
          </label>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button
            variant="primary"
            onClick={onSend}
            disabled={!canSend}
            type="button"
          >
            {send.isPending ? "Sending…" : "Send quote →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

```powershell
npx biome ci components/quotes/SendQuoteDialog.tsx
```

Expected: clean.

### Task 5.3: Wire into QuoteBuilder

- [ ] **Step 1: Read [components/quotes/QuoteBuilder.tsx](../../../components/quotes/QuoteBuilder.tsx)**

Specifically lines 102–135, the existing "Send to customer →" dropdown.

- [ ] **Step 2: Replace the dropdown structure**

Change the action area to:
- Primary: `[Send to customer →]` button — opens SendQuoteDialog
- Secondary kebab: a `[ ⋮ ]` button that opens a small menu with "Copy share link" / "Regenerate link" (the existing `copyShareLink(false)` / `copyShareLink(true)` handlers are reused)

```tsx
{/* near top of component, alongside other useState calls */}
const [sendDialogOpen, setSendDialogOpen] = useState(false);
```

Replace lines 106–134 (the existing `<div className="relative" ref={actionsRef}>` block) with:

```tsx
<Button variant="primary" onClick={() => setSendDialogOpen(true)}>
  Send to customer →
</Button>
<div className="relative" ref={actionsRef}>
  <Button
    variant="ghost"
    onClick={() => setActionsOpen((v) => !v)}
    aria-label="More actions"
    type="button"
  >
    ⋮
  </Button>
  {actionsOpen && (
    <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg z-10 min-w-[180px] py-1">
      <button
        type="button"
        className="w-full text-left px-4 py-2.5 font-[var(--font-mono)] text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => copyShareLink(false)}
        disabled={rotateToken.isPending}
      >
        {quote.approvalToken ? "Copy share link" : "Create share link"}
      </button>
      {quote.approvalToken ? (
        <button
          type="button"
          className="w-full text-left px-4 py-2.5 font-[var(--font-mono)] text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => copyShareLink(true)}
          disabled={rotateToken.isPending}
        >
          Regenerate link
        </button>
      ) : null}
    </div>
  )}
</div>
```

And at the bottom of the JSX (after `<QuoteSummary … />`), add:
```tsx
<SendQuoteDialog
  quoteId={quote.id}
  quoteNumber={quote.quoteNumber}
  orgName={quote.org?.name ?? ""}
  customerEmail={quote.estimate.customer?.email ?? null}
  hasToken={Boolean(quote.approvalToken)}
  open={sendDialogOpen}
  onClose={() => setSendDialogOpen(false)}
/>
```

Add the import at the top:
```tsx
import { SendQuoteDialog } from "@/components/quotes/SendQuoteDialog";
```

- [ ] **Step 3: Verify the existing quote object includes `org` and `estimate.customer.email`**

Open `lib/hooks/useQuotes.ts` and `lib/repositories/quoteRepo.ts` `getQuote()` — the existing `QuoteWithDetails` includes `estimate.customer` (full row), so `email` is present. Confirm `quote.org` is loaded; if not, you'll need to extend `QuoteWithDetails` to select `org.name`. (It currently does NOT include org; add `org: { select: { name: true } }` to the include in `getQuote`.)

If you extended `getQuote`'s return shape, also adjust any callers' types. Run:
```powershell
npx tsc --noEmit
```
to catch breaks.

- [ ] **Step 4: Run typecheck + lint**

```powershell
npx tsc --noEmit
npx biome ci .
```

- [ ] **Step 5: Manual smoke test**

```powershell
npm run dev
```

Open a quote in the builder, click "Send to customer →", confirm dialog opens, fill and submit, confirm toast "Quote sent" appears, and that the kebab menu still copies/regenerates the link.

- [ ] **Step 6: Commit**

```powershell
git add components/quotes/QuoteBuilder.tsx components/quotes/SendQuoteDialog.tsx lib/repositories/quoteRepo.ts
git commit -m "feat(builder): replace dropdown with primary Send button + dialog"
```

---

## Phase 6 — Public viewer rewrite (read-only sections)

**Files:**
- Modify: `components/estimates/PublicQuoteView.tsx` (replace existing implementation)
- Create: `components/estimates/public-quote/PublicQuoteHeader.tsx`
- Create: `components/estimates/public-quote/PublicQuoteStatusBar.tsx`
- Create: `components/estimates/public-quote/Letterhead.tsx`
- Create: `components/estimates/public-quote/PartiesBlock.tsx`
- Create: `components/estimates/public-quote/RoomsList.tsx`
- Create: `components/estimates/public-quote/LineItemsTable.tsx`
- Create: `components/estimates/public-quote/TotalsBlock.tsx`

The visual reference is [design/SqFt - Quote Viewer.html](../../../design/SqFt%20-%20Quote%20Viewer.html). Port the styles to Tailwind 4 utility classes using existing CSS variables (`var(--accent)`, `var(--paper)`, etc.) defined in `app/globals.css`.

### Task 6.1: Update `PublicQuote` type to carry status fields

- [ ] **Step 1: Edit the existing `PublicQuote` interface in `components/estimates/PublicQuoteView.tsx`**

Add the new fields the rewrite needs:
```typescript
export interface PublicQuote {
  // ...existing fields...
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  sentAt?: Date | string | null;
  viewedAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  signature?: {
    signedByName: string;
    signedByEmail: string;
    signedAt: Date | string;
    signatureData: string;
  } | null;
}
```

- [ ] **Step 2: Update `app/q/[token]/page.tsx`**

Map the new fields into the `view` object:
```typescript
const view: PublicQuote = {
  // ...existing mapping...
  status: quote.status as PublicQuote["status"],
  sentAt: quote.sentAt,
  viewedAt: quote.viewedAt,
  acceptedAt: quote.acceptedAt,
  declinedAt: quote.declinedAt,
  declineReason: quote.declineReason,
  signature: quote.signature
    ? {
        signedByName: quote.signature.signedByName,
        signedByEmail: quote.signature.signedByEmail,
        signedAt: quote.signature.signedAt,
        signatureData: quote.signature.signatureData,
      }
    : null,
};
```

This requires `getQuoteByToken` to include the signature relation. Update `lib/repositories/quoteRepo.ts` `QuoteWithPublicView` type and the `getQuoteByToken` function:
```typescript
export type QuoteWithPublicView = Prisma.QuoteGetPayload<{
  include: {
    estimate: { include: { customer: true; items: { orderBy: { sortOrder: "asc" } } } };
    lineItems: { orderBy: { sortOrder: "asc" } };
    org: { select: { name: true; phone: true; address: true; licenseNumber: true; logo: true } };
    signature: true;
  };
}>;
```
And in `getQuoteByToken`'s `include`, add `signature: true,`.

- [ ] **Step 3: Typecheck**

```powershell
npx tsc --noEmit
```

### Task 6.2: Build the sub-components

- [ ] **Step 1: Create `components/estimates/public-quote/PublicQuoteHeader.tsx`**

```tsx
interface Props {
  orgName: string;
  orgAddress: string | null;
}

export function PublicQuoteHeader({ orgName, orgAddress }: Props) {
  return (
    <header className="px-7 py-[18px] flex items-center gap-[14px] max-w-[880px] mx-auto">
      <div className="font-[800] text-[18px] tracking-[-0.025em]">
        <em className="not-italic text-[var(--accent)]">Sq</em>Ft
      </div>
      <div className="w-px h-[18px] bg-[var(--line-2)]" />
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] uppercase">
        {orgName}{orgAddress ? ` · ${orgAddress}` : ""}
      </div>
      <div className="ml-auto">
        <button
          type="button"
          className="font-[var(--font-mono)] text-[11px] px-3 py-[7px] border border-[var(--line-2)] bg-transparent text-[var(--ink-2)] rounded-md inline-flex items-center gap-1.5 hover:border-[var(--ink)] hover:text-[var(--ink)] hover:bg-[var(--surface)] print:hidden"
          onClick={() => window.print()}
        >
          ⤓ Download PDF
        </button>
      </div>
    </header>
  );
}
```

(The button uses `window.print()` — since this is a server component context, you may need `"use client"` at the top. Add it.)

- [ ] **Step 2: Create `components/estimates/public-quote/PublicQuoteStatusBar.tsx`**

```tsx
interface Props {
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  sentAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
}

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function PublicQuoteStatusBar({ status, sentAt, acceptedAt, declinedAt }: Props) {
  let pillClass = "text-[var(--gold)]";
  let label = "Awaiting your response";
  let meta: string | null = null;

  if (status === "accepted" && acceptedAt) {
    pillClass = "text-[var(--sage)] bg-[rgba(61,107,74,0.08)]";
    label = "Accepted";
    meta = `Signed ${fmtDate(acceptedAt)}`;
  } else if (status === "declined" && declinedAt) {
    pillClass = "text-[var(--muted)]";
    label = "Declined";
    meta = `Declined ${fmtDate(declinedAt)}`;
  } else if (sentAt) {
    meta = `Sent ${fmtDate(sentAt)}`;
  }

  return (
    <div className="max-w-[880px] mx-auto mb-[14px] px-7 flex items-center gap-3 flex-wrap">
      <span className={`font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] px-2.5 py-[5px] rounded-full border border-current font-[600] inline-flex items-center gap-1.5 ${pillClass}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {label}
      </span>
      {meta && (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.02em]">
          {meta}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/estimates/public-quote/Letterhead.tsx`**

```tsx
interface Props {
  quoteNumber: number;
  date: Date | string;
  org: { name: string; address: string | null; phone: string | null; licenseNumber: string | null; logo: string | null };
}

export function Letterhead({ quoteNumber, date, org }: Props) {
  const dateLabel = new Date(date)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();

  return (
    <div className="flex items-start justify-between gap-6 pb-7 border-b border-[var(--line)] mb-8 flex-wrap">
      <div className="flex flex-col gap-1">
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em]">
          Estimate &amp; Proposal
        </div>
        <div className="text-[42px] font-[700] tracking-[-0.03em] leading-none mt-2 sm:text-[42px] text-[32px]">
          Quote
        </div>
        <div className="font-[var(--font-mono)] text-[13px] text-[var(--accent)] font-[600] mt-2 tracking-[.04em]">
          № {quoteNumber} · {dateLabel}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[14px] font-[700] tracking-[-0.01em]">{org.name}</div>
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] leading-relaxed mt-1">
          {org.address ? <>{org.address}<br /></> : null}
          {org.phone ? <>{org.phone}<br /></> : null}
          {org.licenseNumber ? <>License #{org.licenseNumber}</> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/estimates/public-quote/PartiesBlock.tsx`**

```tsx
interface Props {
  customer: { name: string; address: string | null } | null;
  projectTitle: string;
}

export function PartiesBlock({ customer, projectTitle }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-9">
      <div>
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
          Prepared for
        </div>
        <div className="text-[18px] font-[600] tracking-[-0.015em] mb-1.5">
          {customer?.name ?? "—"}
        </div>
        {customer?.address && (
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--ink-2)] leading-relaxed whitespace-pre-line">
            {customer.address}
          </div>
        )}
      </div>
      <div>
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
          Project
        </div>
        <div className="text-[18px] font-[600] tracking-[-0.015em]">
          {projectTitle || "—"}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `components/estimates/public-quote/RoomsList.tsx`**

```tsx
import { type RoomItem, roomSqft } from "@/lib/utils";

interface Props { rooms: RoomItem[]; }

export function RoomsList({ rooms }: Props) {
  if (rooms.length === 0) return null;
  return (
    <>
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-3.5">
        Rooms included
      </div>
      <div className="flex flex-wrap gap-1.5 mb-9">
        {rooms.map((r) => {
          const sqft = Math.round(roomSqft(r));
          const dim = r.shape === "rect" && r.w && r.l ? `${r.w}×${r.l}` : r.shape ?? "";
          return (
            <span
              key={r.id}
              className="font-[var(--font-mono)] text-[11px] px-3 py-1.5 border border-[var(--line-2)] rounded-full text-[var(--ink-2)] bg-[var(--surface)] inline-flex items-center gap-1.5"
            >
              <strong className="text-[var(--ink)] font-[600]">{r.name || "Room"}</strong>
              <span className="text-[var(--muted)]">{dim ? `${dim} · ` : ""}{sqft} sqft</span>
            </span>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Create `components/estimates/public-quote/LineItemsTable.tsx`**

```tsx
import { fmtDollar, getEffectiveQty, type LineItemCalc, liSubtotal, type RoomItem } from "@/lib/utils";

interface Props { lineItems: LineItemCalc[]; rooms: RoomItem[]; }

export function LineItemsTable({ lineItems, rooms }: Props) {
  if (lineItems.length === 0) return null;
  return (
    <>
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-3.5">
        Line items
      </div>
      <div className="mb-6">
        <div className="grid grid-cols-[1fr_90px_100px_110px] gap-3.5 pb-2.5 border-b-[1.5px] border-[var(--ink)] font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] font-[600]">
          <div>Description</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Rate</div>
          <div className="text-right">Subtotal</div>
        </div>
        {lineItems.map((li) => {
          const qty = getEffectiveQty(li, rooms);
          const sub = liSubtotal(li, rooms);
          return (
            <div
              key={li.id}
              className="grid grid-cols-[1fr_90px_100px_110px] gap-3.5 py-3.5 border-b border-[var(--line)] items-baseline last:border-b-0"
            >
              <div>
                <div className="text-[14px] font-[500] tracking-[-0.005em]">{li.name}</div>
              </div>
              <div className="font-[var(--font-mono)] text-[13px] text-right text-[var(--ink-2)] font-[500]">
                {qty != null ? qty.toFixed(1) : "—"} {li.unitLabel}
              </div>
              <div className="font-[var(--font-mono)] text-[13px] text-right text-[var(--ink-2)] font-[500]">
                {fmtDollar(li.rate)}
              </div>
              <div className="text-[14px] text-right font-[600] tracking-[-0.01em]">
                {sub != null ? fmtDollar(sub) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 7: Create `components/estimates/public-quote/TotalsBlock.tsx`**

```tsx
import { fmtDollar } from "@/lib/utils";

interface Props {
  subtotal: number;
  markup: number;
  markupPct: number;
  tax: number;
  taxRate: number;
  total: number;
  deposit: number;
  depositPct: number;
}

export function TotalsBlock(props: Props) {
  return (
    <div className="mt-6 flex flex-col items-end gap-2">
      <Row label="Subtotal" value={fmtDollar(props.subtotal)} />
      <Row label={`Tax · ${(props.taxRate * 100).toFixed(1)}%`} value={fmtDollar(props.tax)} />
      {props.markupPct > 0 && (
        <Row label={`Labor &amp; margin · ${props.markupPct}%`} value={fmtDollar(props.markup)} />
      )}
      <div className="h-[1.5px] bg-[var(--ink)] w-[280px] my-1.5" />
      <div className="grid grid-cols-[auto_140px] gap-8 items-baseline">
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink)] tracking-[.06em] uppercase font-[600] text-right">
          Total due
        </div>
        <div className="text-[32px] font-[700] tracking-[-0.025em] text-right text-[var(--accent)]">
          {fmtDollar(props.total)}
        </div>
      </div>
      {props.depositPct > 0 && (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-1">
          Deposit due: {fmtDollar(props.deposit)} ({Math.round(props.depositPct * 100)}%)
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_140px] gap-8 items-baseline">
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] text-right">
        {label}
      </div>
      <div className="font-[var(--font-mono)] text-[13px] font-[600] text-right text-[var(--ink-2)]">
        {value}
      </div>
    </div>
  );
}
```

### Task 6.3: Rewrite `PublicQuoteView`

- [ ] **Step 1: Rewrite `components/estimates/PublicQuoteView.tsx`**

Replace the entire file with:

```tsx
import { liSubtotal, type RoomItem } from "@/lib/utils";
import { Letterhead } from "./public-quote/Letterhead";
import { LineItemsTable } from "./public-quote/LineItemsTable";
import { PartiesBlock } from "./public-quote/PartiesBlock";
import { PublicQuoteHeader } from "./public-quote/PublicQuoteHeader";
import { PublicQuoteStatusBar } from "./public-quote/PublicQuoteStatusBar";
import { RoomsList } from "./public-quote/RoomsList";
import { TotalsBlock } from "./public-quote/TotalsBlock";

// ── PublicQuote type — keep export so app/q/[token]/page.tsx can import it ──
import type { LineItemCalc, RoomItem as _RoomItem } from "@/lib/utils";

export interface PublicQuote {
  id: number;
  quoteNumber: number;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  date: string | Date;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  estimate: { id: number; estimateNumber: number | null; title: string };
  customer: { name: string; address: string | null } | null;
  items: _RoomItem[];
  lineItems: LineItemCalc[];
  org: { name: string; phone: string | null; address: string | null; licenseNumber: string | null; logo: string | null };
  sentAt?: Date | string | null;
  viewedAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  signature?: {
    signedByName: string;
    signedByEmail: string;
    signedAt: Date | string;
    signatureData: string;
  } | null;
}

interface Props { quote: PublicQuote; }

export function PublicQuoteView({ quote }: Props) {
  const rooms = quote.items.filter((i): i is RoomItem => i.type === "room");
  const subtotal = quote.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const markup = subtotal * (quote.markupPct / 100);
  const beforeTax = subtotal + markup;
  const tax = beforeTax * quote.taxRate;
  const total = beforeTax + tax;
  const deposit = total * quote.depositPct;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <PublicQuoteHeader orgName={quote.org.name} orgAddress={quote.org.address} />
      <PublicQuoteStatusBar
        status={quote.status}
        sentAt={quote.sentAt}
        acceptedAt={quote.acceptedAt}
        declinedAt={quote.declinedAt}
      />
      <div className="max-w-[880px] mx-auto mb-8 px-7">
        <div className="bg-[var(--paper)] rounded-lg shadow-[0_1px_0_rgba(20,18,12,0.04),0_6px_22px_rgba(20,18,12,0.07),0_32px_80px_rgba(20,18,12,0.06)] overflow-hidden relative print:shadow-none print:border print:border-[#ddd]">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-l)] print:hidden" />
          <div className="p-12 sm:p-14">
            <Letterhead quoteNumber={quote.quoteNumber} date={quote.date} org={quote.org} />
            <PartiesBlock
              customer={quote.customer}
              projectTitle={quote.estimate.title}
            />
            <RoomsList rooms={rooms} />
            <LineItemsTable lineItems={quote.lineItems} rooms={rooms} />
            <TotalsBlock
              subtotal={subtotal}
              markup={markup}
              markupPct={quote.markupPct}
              tax={tax}
              taxRate={quote.taxRate}
              total={total}
              deposit={deposit}
              depositPct={quote.depositPct}
            />
            {/* Acceptance / Signed / Declined block lands in Phases 8–9 */}
            {quote.status === "declined" && (
              <div className="mt-9 pt-6 border-t border-[var(--line)] text-[14px] text-[var(--ink-2)]">
                This quote was declined on{" "}
                {new Date(quote.declinedAt ?? Date.now()).toLocaleDateString()}.
                {quote.declineReason ? (
                  <div className="mt-2 italic text-[var(--muted)]">
                    "{quote.declineReason}"
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run E2E to verify the existing tests still pass**

```powershell
npx playwright test tests/e2e/public-quote.spec.ts
```

Expected: all 6 existing tests pass. (They check for `QUOTE` text, customer name, and org name — all still rendered.)

If a test fails because `QUOTE` text changed (the new layout uses "Quote" with a different case), update either the test or the component to match. Acceptable: change the test selector to `getByText(/Quote/i)`.

- [ ] **Step 3: Manual smoke test**

```powershell
npm run dev
```

Open `/q/seed-token-sent-quote-aaaaaaaaaaaaaaaaaaaa` (the seed fixture). Compare against `design/SqFt - Quote Viewer.html` side-by-side. Print preview should look reasonable.

- [ ] **Step 4: Lint + commit**

```powershell
npx biome ci .
git add components/estimates/ app/q/ lib/repositories/quoteRepo.ts
git commit -m "feat(public-quote): rewrite viewer to match design HTML"
```

---

## Phase 7 — View tracking

**Files:**
- Modify: `lib/repositories/quoteRepo.ts` (add `markQuoteViewed`)
- Modify: `__tests__/repositories/quoteRepo.test.ts`
- Modify: `app/q/[token]/page.tsx`

### Task 7.1: `markQuoteViewed` repo

- [ ] **Step 1: Add the failing test** to `__tests__/repositories/quoteRepo.test.ts`

```typescript
describe("markQuoteViewed", () => {
  it("flips sent → viewed and writes a viewed event", async () => {
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const eventCreate = vi.fn().mockResolvedValue({ id: 5 });
    txMock.quoteEvent = { create: eventCreate };
    quoteFindFirst.mockResolvedValue({ id: 1, status: "sent" });
    const { markQuoteViewed } = await import("@/lib/repositories/quoteRepo");

    await markQuoteViewed(1, { ip: "1.2.3.4", userAgent: "UA" });

    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "sent" },
      data: { status: "viewed", viewedAt: expect.any(Date) },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 1,
          type: "viewed",
          ip: "1.2.3.4",
          userAgent: "UA",
        }),
      })
    );
  });

  it("writes only an event (no status update) when status is already viewed", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "viewed" });
    const eventCreate = vi.fn();
    txMock.quoteEvent = { create: eventCreate };
    const { markQuoteViewed } = await import("@/lib/repositories/quoteRepo");
    await markQuoteViewed(1, { ip: null, userAgent: null });
    expect(quoteUpdateMany).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalled();
  });

  it("does nothing when status is accepted or declined", async () => {
    const eventCreate = vi.fn();
    txMock.quoteEvent = { create: eventCreate };
    quoteFindFirst.mockResolvedValue({ id: 1, status: "accepted" });
    const { markQuoteViewed } = await import("@/lib/repositories/quoteRepo");
    await markQuoteViewed(1, { ip: null, userAgent: null });
    expect(eventCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Add the implementation** to `lib/repositories/quoteRepo.ts`

```typescript
export interface MarkQuoteViewedInput {
  ip: string | null;
  userAgent: string | null;
}

export async function markQuoteViewed(
  quoteId: number,
  input: MarkQuoteViewedInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!q) return;
    if (q.status === "accepted" || q.status === "declined") return;

    if (q.status === "sent") {
      await tx.quote.updateMany({
        where: { id: quoteId, status: "sent" },
        data: { status: "viewed", viewedAt: new Date() },
      });
    }

    await tx.quoteEvent.create({
      data: {
        quoteId,
        type: "viewed",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  });
}
```

- [ ] **Step 3: Run tests, expect pass**

```powershell
npx vitest run __tests__/repositories/quoteRepo.test.ts
```

### Task 7.2: Wire view tracking into the public page

- [ ] **Step 1: Modify `app/q/[token]/page.tsx`**

After `getQuoteByToken()`, before building the `view` object:

```typescript
import { headers } from "next/headers";
// ...

if (quote.status !== "accepted" && quote.status !== "declined") {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;
  // Fire-and-forget; do NOT await on the critical path. Returning a
  // promise from a Server Component is fine — Next will keep the
  // function alive long enough to complete.
  void markQuoteViewed(quote.id, { ip, userAgent });
}
```

Add the import:
```typescript
import { getQuoteByToken, markQuoteViewed } from "@/lib/repositories";
```

- [ ] **Step 2: Smoke test**

```powershell
npm run dev
```

1. Reset DB to a clean seed (`npm run seed:dev`).
2. Open `/q/seed-token-sent-quote-aaaaaaaaaaaaaaaaaaaa`.
3. Open Prisma Studio: confirm Quote.status flipped from `sent` to `viewed` and `viewedAt` is set.
4. Reload the page: confirm a second `QuoteEvent` row of type `viewed` appears (not a status change).

- [ ] **Step 3: Lint + commit**

```powershell
npx biome ci .
git add lib/repositories/quoteRepo.ts __tests__/repositories/quoteRepo.test.ts app/q/[token]/page.tsx
git commit -m "feat(public-quote): track viewed status on first load"
```

---

## Phase 8 — Signature pad + accept API + signed view + owner notification

**Files:**
- Create: `components/estimates/public-quote/SignaturePad.tsx`
- Create: `components/estimates/public-quote/PublicQuoteAcceptBlock.tsx`
- Create: `components/estimates/public-quote/PublicQuoteSignedView.tsx`
- Create: `lib/repositories/quoteSignatureRepo.ts`
- Modify: `lib/repositories/index.ts`
- Create: `__tests__/repositories/quoteSignatureRepo.test.ts`
- Create: `lib/email/SignedNotificationEmail.tsx`
- Create: `lib/email/sendSignedNotification.ts`
- Create: `app/api/q/[token]/accept/route.ts`
- Create: `__tests__/api/q.[token].accept.test.ts`
- Modify: `components/estimates/PublicQuoteView.tsx` (mount the AcceptBlock / SignedView)
- Extend: `tests/e2e/public-quote.spec.ts`

### Task 8.1: SignaturePad component

- [ ] **Step 1: Create `components/estimates/public-quote/SignaturePad.tsx`**

```tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface SignaturePadHandle {
  /** Returns null if the user hasn't drawn anything. */
  getDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(
  function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hasInk, setHasInk] = useState(false);
    const drawingRef = useRef(false);
    const lastPtRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * ratio;
      canvas.height = r.height * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a17";
    }, []);

    function getPt(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function start(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      const p = getPt(e);
      if (!p) return;
      drawingRef.current = true;
      lastPtRef.current = p;
      canvasRef.current?.setPointerCapture(e.pointerId);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const p = getPt(e);
      const last = lastPtRef.current;
      if (!p || !last) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPtRef.current = p;
      if (!hasInk) {
        setHasInk(true);
        onChange?.(true);
      }
    }

    function end(e: React.PointerEvent<HTMLCanvasElement>) {
      drawingRef.current = false;
      lastPtRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    useImperativeHandle(
      ref,
      () => ({
        getDataUrl: () => (hasInk ? canvasRef.current?.toDataURL("image/png") ?? null : null),
        isEmpty: () => !hasInk,
        clear: () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasInk(false);
          onChange?.(false);
        },
      }),
      [hasInk, onChange]
    );

    return (
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`w-full h-[130px] bg-[var(--paper)] border-[1.5px] ${
            hasInk ? "border-solid border-[var(--ink)]" : "border-dashed border-[var(--line-2)]"
          } rounded-md cursor-crosshair touch-none block`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-hand,cursive)] text-[22px] text-[var(--line-2)] pointer-events-none font-[500]">
            Sign here
          </span>
        )}
      </div>
    );
  }
);
```

- [ ] **Step 2: Lint check** — `npx biome ci components/estimates/public-quote/SignaturePad.tsx`

### Task 8.2: `quoteSignatureRepo` — atomic accept

- [ ] **Step 1: Write the failing test** at `__tests__/repositories/quoteSignatureRepo.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteSignatureCreate = vi.fn();
const quoteUpdateMany = vi.fn();
const quoteFindFirst = vi.fn();
const quoteEventCreate = vi.fn();
const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
  cb({
    quote: { findFirst: quoteFindFirst, updateMany: quoteUpdateMany },
    quoteSignature: { create: quoteSignatureCreate },
    quoteEvent: { create: quoteEventCreate },
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction },
}));

const { acceptQuoteByToken } = await import("@/lib/repositories/quoteSignatureRepo");

beforeEach(() => vi.clearAllMocks());

describe("acceptQuoteByToken", () => {
  const validInput = {
    quoteId: 1,
    signedByName: "Janet Henderson",
    signedByEmail: "h@example.com",
    signatureData: "data:image/png;base64,iVBORw0KGgo=",
    consentText: "consent",
    quoteSnapshot: { quoteNumber: 5001 },
    snapshotHash: "deadbeef",
    signedIp: "1.2.3.4",
    signedUserAgent: "UA",
  };

  it("creates signature, updates quote, writes event in one transaction", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "viewed" });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    quoteSignatureCreate.mockResolvedValue({ id: 1 });

    const result = await acceptQuoteByToken(validInput);
    expect(result).toBe("ok");
    expect(quoteSignatureCreate).toHaveBeenCalled();
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "accepted", acceptedAt: expect.any(Date) },
    });
    expect(quoteEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 1,
          type: "accepted",
          actorEmail: "h@example.com",
          actorName: "Janet Henderson",
        }),
      })
    );
  });

  it("returns 'already_signed' when status is already accepted", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "accepted" });
    const result = await acceptQuoteByToken(validInput);
    expect(result).toBe("already_signed");
    expect(quoteSignatureCreate).not.toHaveBeenCalled();
  });

  it("returns 'declined' when status is declined", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "declined" });
    expect(await acceptQuoteByToken(validInput)).toBe("declined");
  });

  it("returns 'not_found' when quote doesn't exist", async () => {
    quoteFindFirst.mockResolvedValue(null);
    expect(await acceptQuoteByToken(validInput)).toBe("not_found");
  });
});
```

- [ ] **Step 2: Create `lib/repositories/quoteSignatureRepo.ts`**

```typescript
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface AcceptQuoteInput {
  quoteId: number;
  signedByName: string;
  signedByEmail: string;
  signatureData: string;
  consentText: string;
  quoteSnapshot: Prisma.InputJsonValue;
  snapshotHash: string;
  signedIp: string;
  signedUserAgent: string;
}

export type AcceptQuoteResult = "ok" | "already_signed" | "declined" | "not_found";

/**
 * Atomically write the QuoteSignature, flip Quote.status to accepted,
 * and append a 'accepted' QuoteEvent. Concurrent calls for the same
 * quote will fail at the QuoteSignature.quoteId @unique constraint and
 * return "already_signed".
 */
export async function acceptQuoteByToken(input: AcceptQuoteInput): Promise<AcceptQuoteResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: input.quoteId },
      select: { id: true, status: true },
    });
    if (!q) return "not_found" as const;
    if (q.status === "accepted") return "already_signed" as const;
    if (q.status === "declined") return "declined" as const;

    try {
      await tx.quoteSignature.create({
        data: {
          quoteId: input.quoteId,
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signatureData: input.signatureData,
          signedIp: input.signedIp,
          signedUserAgent: input.signedUserAgent,
          consentText: input.consentText,
          quoteSnapshot: input.quoteSnapshot,
          snapshotHash: input.snapshotHash,
        },
      });
    } catch (err) {
      // Unique constraint on quoteId — another request beat us
      if (err instanceof Error && err.message.includes("Unique")) {
        return "already_signed" as const;
      }
      throw err;
    }

    await tx.quote.updateMany({
      where: { id: input.quoteId, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId: input.quoteId,
        type: "accepted",
        actorEmail: input.signedByEmail,
        actorName: input.signedByName,
        ip: input.signedIp,
        userAgent: input.signedUserAgent,
      },
    });

    return "ok" as const;
  });
}

export async function getQuoteSignature(quoteId: number) {
  return prisma.quoteSignature.findUnique({ where: { quoteId } });
}
```

- [ ] **Step 3: Re-export from `lib/repositories/index.ts`**

```typescript
export * from "./quoteSignatureRepo";
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npx vitest run __tests__/repositories/quoteSignatureRepo.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add lib/repositories/quoteSignatureRepo.ts lib/repositories/index.ts __tests__/repositories/quoteSignatureRepo.test.ts
git commit -m "feat(repo): acceptQuoteByToken atomic accept"
```

### Task 8.3: Owner notification email

- [ ] **Step 1: Create `lib/email/SignedNotificationEmail.tsx`**

```tsx
import { Body, Button, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

export interface SignedNotificationEmailProps {
  variant: "accepted" | "declined";
  quoteNumber: number;
  customerName: string;
  customerEmail: string | null;
  signedAtFormatted: string;
  totalFormatted: string;
  depositFormatted: string;
  declineReason?: string;
  builderUrl: string; // /quotes/{id} or /quotes/{id}/signed
}

const main = { backgroundColor: "#f4f3ed", fontFamily: "system-ui, sans-serif" };
const container = { backgroundColor: "#fafaf7", padding: "32px", maxWidth: "560px", margin: "0 auto", borderRadius: "8px" };
const heading = { fontSize: "20px", fontWeight: 700, color: "#1a1a17", margin: "0 0 8px" };
const para = { fontSize: "14px", color: "#3a3a35", lineHeight: 1.6, margin: "12px 0" };
const button = { backgroundColor: "#1a1a17", color: "#ffffff", padding: "12px 22px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, textDecoration: "none", display: "inline-block" };

export function SignedNotificationEmail(p: SignedNotificationEmailProps) {
  const accepted = p.variant === "accepted";
  return (
    <Html>
      <Head />
      <Preview>
        {accepted ? "✓" : "✗"} {p.customerName} {accepted ? "signed" : "declined"} Quote #{p.quoteNumber}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>
            {accepted ? "Quote signed" : "Quote declined"}
          </Text>
          <Text style={para}>
            {p.customerName} {accepted ? "signed" : "declined"} Quote #{p.quoteNumber} on{" "}
            {p.signedAtFormatted}.
          </Text>
          {accepted ? (
            <>
              <Text style={para}>
                <strong>Total:</strong> {p.totalFormatted} ·{" "}
                <strong>Deposit due:</strong> {p.depositFormatted}
              </Text>
              {p.customerEmail && (
                <Text style={para}>Customer email: {p.customerEmail}</Text>
              )}
              <Text style={para}>
                What's next: contact {p.customerName.split(" ")[0]} to schedule and send the deposit invoice.
              </Text>
            </>
          ) : (
            p.declineReason && (
              <Text style={para}>Reason given: <em>{p.declineReason}</em></Text>
            )
          )}
          <Section style={{ margin: "20px 0" }}>
            <Button href={p.builderUrl} style={button}>
              {accepted ? "View signed quote" : "Open quote"}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Create `lib/email/sendSignedNotification.ts`**

```typescript
import { fmtDollar } from "@/lib/utils";
import { sendEmail, type SendEmailResult } from "./client";
import { SignedNotificationEmail } from "./SignedNotificationEmail";

export interface SendSignedNotificationInput {
  variant: "accepted" | "declined";
  to: string[];
  quoteId: number;
  quoteNumber: number;
  customerName: string;
  customerEmail: string | null;
  signedAt: Date;
  total: number;
  deposit: number;
  declineReason?: string;
}

export function sendSignedNotification(input: SendSignedNotificationInput): Promise<SendEmailResult> {
  if (input.to.length === 0) {
    return Promise.resolve({ ok: true, id: "no-recipients" });
  }
  const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const builderUrl = input.variant === "accepted"
    ? `${baseUrl}/quotes/${input.quoteId}/signed`
    : `${baseUrl}/quotes/${input.quoteId}`;

  return sendEmail({
    to: input.to,
    subject:
      input.variant === "accepted"
        ? `✓ ${input.customerName} signed Quote #${input.quoteNumber}`
        : `Quote #${input.quoteNumber} was declined`,
    react: SignedNotificationEmail({
      variant: input.variant,
      quoteNumber: input.quoteNumber,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      signedAtFormatted: input.signedAt.toLocaleString("en-US", {
        month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
      }),
      totalFormatted: fmtDollar(input.total),
      depositFormatted: fmtDollar(input.deposit),
      declineReason: input.declineReason,
      builderUrl,
    }),
  });
}
```

- [ ] **Step 3: Commit**

```powershell
git add lib/email/SignedNotificationEmail.tsx lib/email/sendSignedNotification.ts
git commit -m "feat(email): owner notification template + send wrapper"
```

### Task 8.4: `POST /api/q/[token]/accept` route

- [ ] **Step 1: Write the failing test** at `__tests__/api/q.[token].accept.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuoteByToken: vi.fn(),
  acceptQuoteByToken: vi.fn(),
}));
vi.mock("@/lib/email/sendSignedNotification", () => ({
  sendSignedNotification: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: pass-through
  withLogging: (fn: any) => fn,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn().mockResolvedValue([{ email: "owner@org.com" }]) } },
}));

const { getQuoteByToken, acceptQuoteByToken } = await import("@/lib/repositories");
const { sendSignedNotification } = await import("@/lib/email/sendSignedNotification");
const { POST } = await import("@/app/api/q/[token]/accept/route");

const mockGetByToken = vi.mocked(getQuoteByToken);
const mockAccept = vi.mocked(acceptQuoteByToken);
const mockSend = vi.mocked(sendSignedNotification);

const validBody = {
  name: "Janet Henderson",
  email: "h@example.com",
  signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  consentText: "I consent",
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/q/abc/accept", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", "user-agent": "UA" },
    body: JSON.stringify(body),
  });
}
function params(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/q/[token]/accept", () => {
  it("accepts a valid sign and triggers owner notification", async () => {
    mockGetByToken.mockResolvedValue({
      id: 1, orgId: "org1", quoteNumber: 5001,
      status: "viewed", taxRate: 0.08, markupPct: 0, depositPct: 0.5,
      lineItems: [], date: new Date(),
      estimate: { customer: { name: "Janet", email: "h@example.com", address: null, phone: null }, items: [] },
      org: { name: "Acme", address: null, phone: null, licenseNumber: null, logo: null },
      // biome-ignore lint/suspicious/noExplicitAny: stub
    } as any);
    mockAccept.mockResolvedValue("ok");

    const res = await POST(makeReq(validBody), params("abc"));
    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalled();
    // notification fires (fire-and-forget; we await microtask in the route's `void`)
  });

  it("returns 404 for an invalid token", async () => {
    mockGetByToken.mockResolvedValue(null);
    const res = await POST(makeReq(validBody), params("nope"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when quote is already accepted", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "accepted" } as never);
    const res = await POST(makeReq(validBody), params("abc"));
    expect(res.status).toBe(409);
  });

  it("returns 400 on bad signature data URL", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "viewed" } as never);
    const res = await POST(makeReq({ ...validBody, signatureDataUrl: "not-a-data-url" }), params("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 400 on signature larger than 100KB", async () => {
    mockGetByToken.mockResolvedValue({ id: 1, status: "viewed" } as never);
    const huge = "data:image/png;base64," + "A".repeat(150_000);
    const res = await POST(makeReq({ ...validBody, signatureDataUrl: huge }), params("abc"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Create `app/api/q/[token]/accept/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendSignedNotification } from "@/lib/email/sendSignedNotification";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { acceptQuoteByToken, getQuoteByToken } from "@/lib/repositories";
import { canonicalize, sha256, snapshotQuote } from "@/lib/signature/snapshot";
import { liSubtotal, type RoomItem } from "@/lib/utils";
import { withLogging } from "@/lib/with-logging";

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  signatureDataUrl: z
    .string()
    .startsWith("data:image/png;base64,", "Signature must be a base64 PNG"),
  consentText: z.string().min(1).max(2000),
});

const MAX_SIG_BYTES = 100 * 1024;

type RouteParams = { params: Promise<{ token: string }> };

export const POST = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const { token } = await params;
      if (!token || token.length < 16 || token.length > 128) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid body" },
          { status: 400 }
        );
      }
      const { name, email, signatureDataUrl, consentText } = parsed.data;

      // Decoded length check (base64 → bytes ≈ length × 3/4)
      const b64 = signatureDataUrl.slice("data:image/png;base64,".length);
      if ((b64.length * 3) / 4 > MAX_SIG_BYTES) {
        return NextResponse.json(
          { error: "Signature image too large (>100KB)" },
          { status: 400 }
        );
      }

      const quote = await getQuoteByToken(token);
      if (!quote) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (quote.status === "accepted" || quote.status === "declined") {
        return NextResponse.json(
          { error: `Quote already ${quote.status}` },
          { status: 409 }
        );
      }

      // Build snapshot from the live quote
      const snap = snapshotQuote({
        quoteNumber: quote.quoteNumber,
        date: quote.date,
        taxRate: quote.taxRate,
        markupPct: quote.markupPct,
        depositPct: quote.depositPct,
        estimate: {
          customer: quote.estimate.customer
            ? {
                name: quote.estimate.customer.name,
                address: quote.estimate.customer.address,
                email: quote.estimate.customer.email,
                phone: quote.estimate.customer.phone,
              }
            : null,
          items: quote.estimate.items as RoomItem[],
        },
        lineItems: quote.lineItems,
        org: quote.org,
      });
      const snapshotHash = sha256(canonicalize(snap));

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const userAgent = req.headers.get("user-agent") ?? "unknown";

      const result = await acceptQuoteByToken({
        quoteId: quote.id,
        signedByName: name,
        signedByEmail: email,
        signatureData: signatureDataUrl,
        consentText,
        quoteSnapshot: snap as never,
        snapshotHash,
        signedIp: ip,
        signedUserAgent: userAgent,
      });

      if (result === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (result === "already_signed" || result === "declined") {
        return NextResponse.json(
          { error: `Quote already ${result === "already_signed" ? "accepted" : "declined"}` },
          { status: 409 }
        );
      }

      // Fire-and-forget owner notification
      void notifyOwners(quote.orgId, {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        customerName: name,
        customerEmail: email,
        total: snap.totals.total,
        deposit: snap.totals.deposit,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      logError({
        errorMessage: err instanceof Error ? err.message : "accept failed",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

async function notifyOwners(
  orgId: string,
  args: {
    quoteId: number;
    quoteNumber: number;
    customerName: string;
    customerEmail: string;
    total: number;
    deposit: number;
  }
) {
  try {
    const owners = await prisma.user.findMany({
      where: { orgId, role: "owner" },
      select: { email: true },
    });
    const recipients = owners.map((o) => o.email).filter(Boolean);
    await sendSignedNotification({
      variant: "accepted",
      to: recipients,
      quoteId: args.quoteId,
      quoteNumber: args.quoteNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      signedAt: new Date(),
      total: args.total,
      deposit: args.deposit,
    });
  } catch (err) {
    logError({ errorMessage: "Owner notification failed", err });
  }
}
```

- [ ] **Step 3: Run tests, expect pass**

```powershell
npx vitest run __tests__/api/q.[token].accept.test.ts
```

- [ ] **Step 4: Commit**

```powershell
git add app/api/q/ __tests__/api/q.[token].accept.test.ts
git commit -m "feat(api): POST /api/q/[token]/accept with snapshot+hash"
```

### Task 8.5: AcceptBlock + SignedView UI

- [ ] **Step 1: Create `components/estimates/public-quote/PublicQuoteSignedView.tsx`**

```tsx
interface Props {
  signedByName: string;
  signedAt: Date | string;
  signatureData: string;
}

export function PublicQuoteSignedView({ signedByName, signedAt, signatureData }: Props) {
  const date = new Date(signedAt);
  return (
    <div className="mt-9 bg-[#fdfcf6] border-[1.5px] border-[var(--sage)] rounded-lg p-8">
      <div className="flex items-center gap-3.5 p-4 bg-[rgba(61,107,74,0.08)] rounded-md mb-5">
        <div className="w-9 h-9 rounded-full bg-[var(--sage)] text-white flex items-center justify-center font-[700]">
          ✓
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-[600] text-[var(--sage)]">
            Quote accepted &amp; signed
          </div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink-2)] mt-0.5">
            {signedByName} ·{" "}
            {date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
      </div>
      <div className="text-[13px] text-[var(--ink-2)] leading-relaxed mb-4">
        A confirmation has been sent to your email. We'll be in touch within 1 business day to
        schedule your install and arrange the deposit invoice.
      </div>
      <div className="p-3.5 bg-[var(--paper)] border border-[var(--line)] rounded-md flex items-center gap-6 flex-wrap">
        <div>
          <div className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.08em] mb-1">Signed by</div>
          <div className="font-[var(--font-hand,cursive)] text-[28px] text-[var(--ink)] font-[600]">{signedByName}</div>
        </div>
        <div>
          <div className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.08em] mb-1">Date</div>
          <div className="text-[14px]">
            {date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <div className="ml-auto">
          {/* biome-ignore lint/performance/noImgElement: data URL */}
          <img src={signatureData} alt="signature" className="max-h-[60px] max-w-[200px] block" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/estimates/public-quote/PublicQuoteAcceptBlock.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

const CONSENT_TEXT =
  "By typing my name and signing below, I consent to use an electronic signature, and agree this signature has the same legal effect as a handwritten signature on this quote.";

interface Props {
  token: string;
  customerEmail: string | null;
  onDeclineClick: () => void;
}

export function PublicQuoteAcceptBlock({ token, customerEmail, onDeclineClick }: Props) {
  const router = useRouter();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(customerEmail ?? "");
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && hasInk;

  async function onAccept() {
    if (submitting) return;
    const sig = sigRef.current?.getDataUrl();
    if (!sig) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/q/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          signatureDataUrl: sig,
          consentText: CONSENT_TEXT,
        }),
      });
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-9 bg-[var(--surface)] border border-[var(--line-2)] rounded-lg p-8 print:hidden">
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-2">
        Sign &amp; Accept
      </div>
      <div className="text-[22px] font-[700] tracking-[-0.02em] mb-1.5 leading-tight">
        Approve this quote to get on the schedule.
      </div>
      <div className="text-[13px] text-[var(--ink-2)] leading-snug mb-6">
        {CONSENT_TEXT}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sig-name" className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Full name
          </label>
          <input
            id="sig-name"
            type="text"
            className="w-full text-[14px] border-0 border-b-[1.5px] border-[var(--line-2)] bg-transparent py-2 focus:outline-none focus:border-[var(--ink)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sig-email" className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
            Email (for receipt)
          </label>
          <input
            id="sig-email"
            type="email"
            className="w-full text-[14px] border-0 border-b-[1.5px] border-[var(--line-2)] bg-transparent py-2 focus:outline-none focus:border-[var(--ink)]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mb-5">
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
          Signature
        </span>
        <SignaturePad ref={sigRef} onChange={setHasInk} />
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] tracking-[.04em]">
            Use your finger or mouse
          </span>
          <button
            type="button"
            className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.04em] hover:text-[var(--accent)]"
            onClick={() => sigRef.current?.clear()}
          >
            Clear
          </button>
        </div>
      </div>

      {error && <div className="text-[13px] text-[var(--accent)] mb-3">{error}</div>}

      <div className="flex gap-2.5 flex-wrap mt-5">
        <button
          type="button"
          className="flex-1 min-w-[200px] py-3.5 px-5 bg-[var(--accent)] text-white border-0 rounded-md text-[14px] font-[600] tracking-[-0.01em] inline-flex items-center justify-center gap-2 transition-all hover:bg-[var(--accent-l)] hover:-translate-y-px disabled:bg-[var(--line-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed disabled:transform-none"
          disabled={!valid || submitting}
          onClick={onAccept}
        >
          ✓ {submitting ? "Submitting…" : "Accept & sign quote"}
        </button>
        <button
          type="button"
          className="py-3.5 px-4 bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-2)] rounded-md text-[13px] font-[500] font-[var(--font-mono)] tracking-[.02em] hover:bg-[var(--paper)] hover:border-[var(--ink-2)]"
          onClick={onDeclineClick}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount AcceptBlock and SignedView in `PublicQuoteView`**

Edit `components/estimates/PublicQuoteView.tsx`. The component is a Server Component currently. Since AcceptBlock is `"use client"`, you can import it directly into a Server Component — it will render as a client island.

Add a `token` prop to `PublicQuoteView`:
```tsx
interface Props { quote: PublicQuote; token: string; }
export function PublicQuoteView({ quote, token }: Props) { … }
```

First, update the `PublicQuote.customer` type in `components/estimates/PublicQuoteView.tsx` to include email:
```typescript
customer: { name: string; address: string | null; email: string | null } | null;
```

Then update [app/q/[token]/page.tsx](../../../app/q/[token]/page.tsx) to pass `token` and to include `customer.email` in the mapping:
```typescript
customer: quote.estimate.customer
  ? {
      name: quote.estimate.customer.name,
      address: quote.estimate.customer.address,
      email: quote.estimate.customer.email,
    }
  : null,
// ...
return <PublicQuoteView quote={view} token={token} />;
```

Then add inside the `<div className="p-12 sm:p-14">` block (after `<TotalsBlock … />`):

```tsx
{quote.status === "accepted" && quote.signature ? (
  <PublicQuoteSignedView
    signedByName={quote.signature.signedByName}
    signedAt={quote.signature.signedAt}
    signatureData={quote.signature.signatureData}
  />
) : quote.status === "declined" ? null /* declined message already rendered above */ : (
  <PublicQuoteAcceptBlock
    token={token}
    customerEmail={quote.customer?.email ?? null}
    onDeclineClick={() => {/* re-wired to DeclineModal in Phase 9 */}}
  />
)}
```

For Phase 8 the Decline button must not be a dead click — render it as `disabled` with a tooltip until Phase 9 lands. Change the Decline button in `PublicQuoteAcceptBlock.tsx` to:
```tsx
<button
  type="button"
  disabled
  title="Decline option coming in the next slice"
  className="py-3.5 px-4 bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-2)] rounded-md text-[13px] font-[500] font-[var(--font-mono)] tracking-[.02em] opacity-40 cursor-not-allowed"
>
  Decline
</button>
```

Phase 9 Task 9.3 re-enables it and wires `onClick={onDeclineClick}`.

- [ ] **Step 4: Manual smoke test**

```powershell
npm run seed:dev
npm run dev
```

1. Open `/q/seed-token-sent-quote-aaaaaaaaaaaaaaaaaaaa` → AcceptBlock visible.
2. Type name + email, sign, click Accept.
3. Page refreshes → SignedView shown.
4. Open Prisma Studio → confirm `QuoteSignature` row exists with hash, snapshot, IP. Confirm Quote.status=accepted, acceptedAt set. Confirm `QuoteEvent(type=accepted)` row.
5. Check console: a recorded "test-mode" email or actual Resend send happened.

- [ ] **Step 5: Extend the E2E test** in `tests/e2e/public-quote.spec.ts`

Add tests after the existing block (still inside the `describe.serial`):

```typescript
test("1.4.7 sends email and flips status to sent", async ({ browser, request }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  // create a fresh quote for this test (use beforeAll's pattern)
  const fresh = await ctx.request.post("/api/quotes", { data: { estimateId: <reuse> } });
  const f = await fresh.json();
  await ctx.request.post(`/api/quotes/${f.id}/approval-token`);
  const sendRes = await ctx.request.post(`/api/quotes/${f.id}/send`, {
    data: { to: "buyer@example.com", subject: `Quote #${f.quoteNumber}` },
  });
  expect(sendRes.status()).toBe(200);
  await ctx.close();
});

test("1.4.8 customer signs the quote — status flips to accepted", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/q/${approvalToken}`);
  // 1×1 PNG
  const sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const acceptRes = await ctx.request.post(`/api/q/${approvalToken}/accept`, {
    data: {
      name: "Carla Customer",
      email: "carla@example.com",
      signatureDataUrl: sig,
      consentText: "I consent",
    },
  });
  expect(acceptRes.status()).toBe(200);

  // Reload public page; SignedView renders
  await page.reload();
  await expect(page.getByText("Quote accepted")).toBeVisible();
  await ctx.close();
});

test("1.4.9 second accept attempt returns 409", async ({ browser }) => {
  const ctx = await browser.newContext();
  const sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const res = await ctx.request.post(`/api/q/${approvalToken}/accept`, {
    data: { name: "X", email: "x@x.com", signatureDataUrl: sig, consentText: "I consent" },
  });
  expect(res.status()).toBe(409);
  await ctx.close();
});
```

Note: replace `<reuse>` with the existing `estimateId` variable scoped to this test file.

- [ ] **Step 6: Run E2E**

```powershell
npx playwright test tests/e2e/public-quote.spec.ts
```

Expected: all tests pass, including the three new ones.

- [ ] **Step 7: Lint + commit**

```powershell
npx biome ci .
git add components/estimates/ app/q/[token]/page.tsx tests/e2e/public-quote.spec.ts
git commit -m "feat(public-quote): in-browser signature + signed view + owner notify"
```

---

## Phase 9 — Decline modal + decline API

**Files:**
- Create: `components/estimates/public-quote/DeclineModal.tsx`
- Create: `app/api/q/[token]/decline/route.ts`
- Create: `__tests__/api/q.[token].decline.test.ts`
- Modify: `lib/repositories/quoteRepo.ts` (add `declineQuoteByToken`)
- Modify: `__tests__/repositories/quoteRepo.test.ts`
- Modify: `components/estimates/public-quote/PublicQuoteAcceptBlock.tsx` (re-enable Decline button)
- Modify: `components/estimates/PublicQuoteView.tsx` (wire modal + onDeclineClick)

### Task 9.1: `declineQuoteByToken` repo

- [ ] **Step 1: Failing test** in `__tests__/repositories/quoteRepo.test.ts`

```typescript
describe("declineQuoteByToken", () => {
  it("flips draft|sent|viewed → declined and writes event", async () => {
    quoteFindFirst.mockResolvedValue({ id: 1, status: "viewed" });
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const eventCreate = vi.fn();
    txMock.quoteEvent = { create: eventCreate };
    const { declineQuoteByToken } = await import("@/lib/repositories/quoteRepo");

    const result = await declineQuoteByToken(1, {
      reason: "went with another vendor",
      ip: "1.2.3.4",
      userAgent: "UA",
    });
    expect(result).toBe("ok");
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "declined", declinedAt: expect.any(Date), declineReason: "went with another vendor" },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "declined", metadata: { reason: "went with another vendor" } }),
      })
    );
  });

  it("returns 'already_signed' on accepted; 'already_declined' on declined", async () => {
    quoteFindFirst.mockResolvedValueOnce({ id: 1, status: "accepted" });
    let r = await (await import("@/lib/repositories/quoteRepo")).declineQuoteByToken(1, { reason: null, ip: null, userAgent: null });
    expect(r).toBe("already_signed");
    quoteFindFirst.mockResolvedValueOnce({ id: 1, status: "declined" });
    r = await (await import("@/lib/repositories/quoteRepo")).declineQuoteByToken(1, { reason: null, ip: null, userAgent: null });
    expect(r).toBe("already_declined");
  });
});
```

- [ ] **Step 2: Implement** in `lib/repositories/quoteRepo.ts`

```typescript
export interface DeclineQuoteInput {
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type DeclineResult = "ok" | "already_signed" | "already_declined" | "not_found";

export async function declineQuoteByToken(
  quoteId: number,
  input: DeclineQuoteInput
): Promise<DeclineResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!q) return "not_found";
    if (q.status === "accepted") return "already_signed";
    if (q.status === "declined") return "already_declined";

    await tx.quote.updateMany({
      where: { id: quoteId, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "declined", declinedAt: new Date(), declineReason: input.reason },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId,
        type: "declined",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
    });

    return "ok";
  });
}
```

- [ ] **Step 3: Run + commit**

```powershell
npx vitest run __tests__/repositories/quoteRepo.test.ts
git add lib/repositories/quoteRepo.ts __tests__/repositories/quoteRepo.test.ts
git commit -m "feat(repo): declineQuoteByToken"
```

### Task 9.2: Decline API route

- [ ] **Step 1: Failing test** at `__tests__/api/q.[token].decline.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories", () => ({
  getQuoteByToken: vi.fn(),
  declineQuoteByToken: vi.fn(),
}));
vi.mock("@/lib/email/sendSignedNotification", () => ({
  sendSignedNotification: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/with-logging", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: pass-through
  withLogging: (fn: any) => fn,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn().mockResolvedValue([]) } },
}));

const { getQuoteByToken, declineQuoteByToken } = await import("@/lib/repositories");
const { POST } = await import("@/app/api/q/[token]/decline/route");

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request("http://localhost/api/q/abc/decline", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}
const params = (token: string) => ({ params: Promise.resolve({ token }) });

describe("POST /api/q/[token]/decline", () => {
  it("declines with optional reason", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue({ id: 1, status: "viewed", orgId: "o", quoteNumber: 1 } as never);
    vi.mocked(declineQuoteByToken).mockResolvedValue("ok");
    const res = await POST(makeReq({ reason: "too expensive" }), params("abc"));
    expect(res.status).toBe(200);
  });

  it("accepts empty body", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue({ id: 1, status: "viewed", orgId: "o", quoteNumber: 1 } as never);
    vi.mocked(declineQuoteByToken).mockResolvedValue("ok");
    const res = await POST(makeReq({}), params("abc"));
    expect(res.status).toBe(200);
  });

  it("returns 409 when already accepted", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue({ id: 1, status: "accepted" } as never);
    const res = await POST(makeReq({}), params("abc"));
    expect(res.status).toBe(409);
  });

  it("returns 404 on bad token", async () => {
    vi.mocked(getQuoteByToken).mockResolvedValue(null);
    const res = await POST(makeReq({}), params("nope"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Create `app/api/q/[token]/decline/route.ts`**

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendSignedNotification } from "@/lib/email/sendSignedNotification";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { declineQuoteByToken, getQuoteByToken } from "@/lib/repositories";
import { withLogging } from "@/lib/with-logging";

const bodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

type RouteParams = { params: Promise<{ token: string }> };

export const POST = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const { token } = await params;
      if (!token || token.length < 16 || token.length > 128) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }

      const quote = await getQuoteByToken(token);
      if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (quote.status === "accepted" || quote.status === "declined") {
        return NextResponse.json(
          { error: `Quote already ${quote.status}` },
          { status: 409 }
        );
      }

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const userAgent = req.headers.get("user-agent") ?? null;

      const result = await declineQuoteByToken(quote.id, {
        reason: parsed.data.reason ?? null,
        ip,
        userAgent,
      });
      if (result === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (result !== "ok") {
        return NextResponse.json({ error: `Quote already ${result.replace("already_", "")}` }, { status: 409 });
      }

      // Fire-and-forget owner notification
      void notifyDeclined(quote.orgId, {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        customerName: quote.estimate.customer?.name ?? "Customer",
        customerEmail: quote.estimate.customer?.email ?? null,
        reason: parsed.data.reason,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      logError({
        errorMessage: err instanceof Error ? err.message : "decline failed",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

async function notifyDeclined(
  orgId: string,
  args: {
    quoteId: number;
    quoteNumber: number;
    customerName: string;
    customerEmail: string | null;
    reason?: string;
  }
) {
  try {
    const owners = await prisma.user.findMany({
      where: { orgId, role: "owner" },
      select: { email: true },
    });
    await sendSignedNotification({
      variant: "declined",
      to: owners.map((o) => o.email).filter(Boolean),
      quoteId: args.quoteId,
      quoteNumber: args.quoteNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      signedAt: new Date(),
      total: 0,
      deposit: 0,
      declineReason: args.reason,
    });
  } catch (err) {
    logError({ errorMessage: "Decline notification failed", err });
  }
}
```

- [ ] **Step 3: Run tests, expect pass**

```powershell
npx vitest run __tests__/api/q.[token].decline.test.ts
```

### Task 9.3: DeclineModal + wire into AcceptBlock

- [ ] **Step 1: Create `components/estimates/public-quote/DeclineModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  token: string;
  open: boolean;
  onClose: () => void;
}

export function DeclineModal({ token, open, onClose }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/q/${token}/decline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="bg-[var(--paper)] rounded-lg p-8 max-w-[440px] w-[calc(100%-32px)] shadow-2xl">
        <h2 id="decline-title" className="text-[20px] font-[700] tracking-[-0.02em] mb-1.5">
          Decline this quote?
        </h2>
        <p className="text-[13px] text-[var(--ink-2)] mb-4">
          No hard feelings — a quick note helps us improve.
        </p>
        <textarea
          className="w-full text-[13px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2.5 rounded resize-y min-h-[96px] focus:outline-none focus:border-[var(--ink)]"
          placeholder="Optional — e.g., went with another vendor, scope changed, budget…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <div className="text-[12px] text-[var(--accent)] mt-2">{error}</div>}
        <div className="flex gap-2 mt-4 justify-end">
          <button
            type="button"
            className="py-2.5 px-4 bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-2)] rounded-md text-[13px] font-[var(--font-mono)]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="py-2.5 px-4 bg-[var(--surface-2)] text-[var(--accent)] border border-[var(--accent)] rounded-md text-[13px] font-[var(--font-mono)]"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Declining…" : "Decline quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Re-enable the Decline button in `PublicQuoteAcceptBlock.tsx`**

Remove the `disabled` and `title="Coming soon"` from the Decline button. Keep `onClick={onDeclineClick}`.

- [ ] **Step 3: Wire the modal in `PublicQuoteView`**

In `PublicQuoteView`, you can't use `useState` because it's a Server Component. Wrap the AcceptBlock + DeclineModal pair in a small `"use client"` component, e.g. `components/estimates/public-quote/PublicQuoteAcceptBlockWithDecline.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DeclineModal } from "./DeclineModal";
import { PublicQuoteAcceptBlock } from "./PublicQuoteAcceptBlock";

interface Props {
  token: string;
  customerEmail: string | null;
}

export function PublicQuoteAcceptBlockWithDecline({ token, customerEmail }: Props) {
  const [declineOpen, setDeclineOpen] = useState(false);
  return (
    <>
      <PublicQuoteAcceptBlock
        token={token}
        customerEmail={customerEmail}
        onDeclineClick={() => setDeclineOpen(true)}
      />
      <DeclineModal
        token={token}
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
      />
    </>
  );
}
```

In `PublicQuoteView.tsx`, replace the `<PublicQuoteAcceptBlock …>` usage with `<PublicQuoteAcceptBlockWithDecline token={token} customerEmail={quote.customer?.email ?? null} />`.

- [ ] **Step 4: Manual smoke test**

```powershell
npm run seed:dev
npm run dev
```

1. Open the seeded `sent` quote.
2. Click Decline → modal opens → submit empty → page shows "This quote was declined on…".
3. Refresh — Decline button gone (status=declined branch renders).
4. Open Prisma Studio: declineReason null, declinedAt set, QuoteEvent(type=declined) row exists.

- [ ] **Step 5: Lint + commit**

```powershell
npx biome ci .
git add components/estimates/ app/api/q/[token]/decline/ __tests__/api/q.[token].decline.test.ts
git commit -m "feat(public-quote): decline modal + decline API + owner notification"
```

---

## Phase 10 — Builder-side `/quotes/[id]/signed` audit view

**Files:**
- Create: `app/(app)/quotes/[id]/signed/page.tsx`
- Modify: `components/quotes/QuoteBuilder.tsx` (add link when accepted)

### Task 10.1: Audit page

- [ ] **Step 1: Create `app/(app)/quotes/[id]/signed/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getQuote, getQuoteSignature } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";

interface Props { params: Promise<{ id: string }>; }

export const metadata = { title: "Signed quote — SqFt" };

export default async function SignedQuotePage({ params }: Props) {
  const orgId = await getOrgId();
  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (Number.isNaN(quoteId)) notFound();

  const [quote, signature] = await Promise.all([
    getQuote(quoteId, orgId),
    getQuoteSignature(quoteId),
  ]);
  if (!quote || quote.status !== "accepted" || !signature) notFound();

  const snap = signature.quoteSnapshot as Record<string, unknown> & {
    totals?: { total?: number; deposit?: number };
    customer?: { name?: string };
  };

  return (
    <div className="max-w-[800px] mx-auto px-6 py-10">
      <h1 className="text-[28px] font-[700] tracking-[-0.025em] mb-2">
        Signed Quote #{quote.quoteNumber}
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        This is the legal record — a snapshot of the quote at the moment the customer signed. The
        live quote may have been edited since.
      </p>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
        <h2 className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)] mb-2">
          Signature
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[12px] text-[var(--muted)]">Signed by</div>
            <div className="text-[16px] font-[600]">{signature.signedByName}</div>
            <div className="text-[12px] text-[var(--muted)]">{signature.signedByEmail}</div>
          </div>
          <div>
            <div className="text-[12px] text-[var(--muted)]">Date</div>
            <div className="text-[14px]">
              {new Date(signature.signedAt).toLocaleString("en-US", {
                year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </div>
          </div>
          <div>
            {/* biome-ignore lint/performance/noImgElement: data URL */}
            <img src={signature.signatureData} alt="signature" className="max-h-[60px] max-w-[200px]" />
          </div>
        </div>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
        <h2 className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)] mb-2">
          Audit details
        </h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-[var(--muted)]">IP address</dt>
          <dd className="font-[var(--font-mono)]">{signature.signedIp}</dd>
          <dt className="text-[var(--muted)]">User agent</dt>
          <dd className="font-[var(--font-mono)] break-all">{signature.signedUserAgent}</dd>
          <dt className="text-[var(--muted)]">Snapshot hash</dt>
          <dd className="font-[var(--font-mono)] break-all">{signature.snapshotHash}</dd>
          <dt className="text-[var(--muted)]">Consent text</dt>
          <dd className="text-[12px] italic">{signature.consentText}</dd>
        </dl>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6">
        <h2 className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)] mb-2">
          Document at signing
        </h2>
        <div className="text-[14px] mb-1">Customer: {snap.customer?.name ?? "—"}</div>
        <div className="text-[14px] mb-3">
          Total: ${snap.totals?.total?.toFixed(2) ?? "—"} · Deposit: ${snap.totals?.deposit?.toFixed(2) ?? "—"}
        </div>
        <details>
          <summary className="cursor-pointer text-[12px] text-[var(--muted)]">
            Show full snapshot JSON
          </summary>
          <pre className="text-[11px] bg-[var(--paper)] p-3 rounded mt-2 overflow-x-auto">
            {JSON.stringify(snap, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add link from QuoteBuilder when status=accepted**

Edit `components/quotes/QuoteBuilder.tsx` near the header status line. After `Quote #{quote.quoteNumber} · {quote.status} · …`, conditionally render:

```tsx
{quote.status === "accepted" && (
  <Link
    href={`/quotes/${quote.id}/signed`}
    className="ml-3 font-[var(--font-mono)] text-[11px] text-[var(--accent)] underline"
  >
    View signed quote →
  </Link>
)}
```

- [ ] **Step 3: Manual smoke test**

```powershell
npm run dev
```

1. Log in.
2. Open the seeded accepted quote builder (`/quotes/<id>` for the accepted one).
3. Click "View signed quote →".
4. Confirm signature image, IP, hash, snapshot JSON all render.

- [ ] **Step 4: Lint + commit**

```powershell
npx biome ci .
git add app/(app)/quotes/[id]/signed/ components/quotes/QuoteBuilder.tsx
git commit -m "feat(builder): add signed-quote audit view"
```

---

## Final pass

- [ ] **Step 1: Run the full test suite**

```powershell
npx vitest run
npx playwright test
```

Both must be green. Investigate and fix any failures before moving on.

- [ ] **Step 2: Final lint + typecheck**

```powershell
npx biome ci .
npx tsc --noEmit
```

- [ ] **Step 3: Update the spec status**

Edit [docs/superpowers/specs/2026-05-10-quote-email-signature-design.md](../specs/2026-05-10-quote-email-signature-design.md): change `**Status:** Approved (awaiting plan)` → `**Status:** Implemented`.

```powershell
git add docs/superpowers/specs/2026-05-10-quote-email-signature-design.md
git commit -m "docs(spec): mark quote-email-signature as implemented"
```

- [ ] **Step 4: Open a PR**

```powershell
git push -u origin claude/musing-chebyshev-e9e273
gh pr create --title "feat: quote → email → signature flow" --body "$(cat <<'EOF'
## Summary
- Customer email send from QuoteBuilder using Resend + react-email
- Public viewer rewrite matching design/SqFt - Quote Viewer.html
- In-browser canvas signature with ESIGN-grade audit trail (snapshot JSON + sha256 + IP + UA + consent text)
- New `QuoteSignature` (1:1) and `QuoteEvent` (append-only) tables
- Owner notifications on accept and decline
- Decline flow with optional reason
- View tracking on first public-page load
- Builder-side `/quotes/[id]/signed` legal-record audit view

## Test plan
- [ ] `npx vitest run` — unit + integration suites pass
- [ ] `npx playwright test` — public-quote E2E (incl. send + sign + double-sign) passes
- [ ] Manual: send a quote in dev, open the link, sign, confirm Quote.status=accepted in Prisma Studio, confirm `quotes@sqft.app` email received in Resend dashboard
- [ ] Manual: decline a quote, confirm declined state renders, owner notification fires
- [ ] Spec: docs/superpowers/specs/2026-05-10-quote-email-signature-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec coverage check

A quick map from spec sections → plan tasks (run before declaring "done"):

| Spec requirement | Implemented in |
|---|---|
| `Quote` columns (sentAt, sentToEmail, sentByEmail, sentByName, viewedAt, acceptedAt, declinedAt, declineReason) | Task 1.1 |
| `QuoteSignature` model | Task 1.1 |
| `QuoteEvent` model | Task 1.1 |
| Seed sent + accepted fixtures | Task 1.2 |
| `lib/signature/snapshot.ts` (canonicalize + sha256 + snapshotQuote) | Phase 2 |
| Resend wrapper with test-mode no-op | Phase 3 |
| `markQuoteSent` + sent/resent event | Task 4.2 |
| Customer email template | Task 4.3 |
| `POST /api/quotes/[id]/send` | Task 4.4 |
| SendQuoteDialog + builder integration | Phase 5 |
| Public viewer rewrite (header, status bar, letterhead, parties, rooms, line items, totals) | Phase 6 |
| View tracking | Phase 7 |
| SignaturePad component | Task 8.1 |
| `acceptQuoteByToken` repo (atomic) | Task 8.2 |
| Owner notification email + `sendSignedNotification` | Task 8.3 |
| `POST /api/q/[token]/accept` (snapshot+hash, IP/UA, 100KB cap) | Task 8.4 |
| AcceptBlock + SignedView | Task 8.5 |
| `declineQuoteByToken` repo | Task 9.1 |
| `POST /api/q/[token]/decline` | Task 9.2 |
| DeclineModal + wiring | Task 9.3 |
| Builder-side `/quotes/[id]/signed` audit view | Phase 10 |
| Tenant boundary: public routes use token, no `getOrgId()` | Phase 8 + 9 routes |
| Status flow `draft → sent → viewed → accepted|declined` (terminal) | Tasks 4.2, 7.1, 8.2, 9.1 (each repo enforces the allowed transitions) |

Anything missing → add a task before handing off.

---

## Open ops items (outside this codebase)

- Verify `sqft.app` sending domain in the Resend dashboard (SPF/DKIM/DMARC). The plan ships a working test-mode that doesn't require this; production sends will go to spam without it.
- `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_BASE_URL` already added to Vercel + local `.env` files (per spec).
