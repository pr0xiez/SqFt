# Quote Terminal-State Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock accepted and declined quotes from edits, give the builder a "Revise" action that clones into a new draft, and have a customer accept auto-decline the open sibling quotes on the same estimate.

**Architecture:** Two small schema additions (`Quote.revisedFromId` self-relation, `QuoteEvent.source`). New repository function `reviseQuote` and one API route. Lockdown enforced at the repository layer in `saveQuote`. Acceptance flow extended with an in-transaction sibling sweep. Builder UI gains a read-only mode driven by terminal status, plus banners and a Revise button. Customer-side decline page gets builder contact info.

**Tech Stack:** Next.js (App Router), Prisma + Postgres (Neon), Vitest (unit), Playwright (e2e), Tailwind v4 + CSS vars for theming.

**Spec:** [docs/superpowers/specs/2026-05-16-quote-terminal-behavior-design.md](../specs/2026-05-16-quote-terminal-behavior-design.md)

---

## Phase 1 — Schema

### Task 1.1: Add `revisedFromId` and `QuoteEvent.source` to schema

**Files:**
- Modify: `prisma/schema.prisma:99-126` (Quote model)
- Modify: `prisma/schema.prisma:158-171` (QuoteEvent model)

- [ ] **Step 1: Edit the Quote model**

Add to `model Quote` after the `quoteEvents` relation line, before the closing brace:

```prisma
  // Revision chain — Revise on an accepted/declined quote clones it
  // into a new draft with this field set to the predecessor's id.
  revisedFromId Int?
  revisedFrom   Quote?  @relation("QuoteRevisions", fields: [revisedFromId], references: [id], onDelete: SetNull)
  revisedBy     Quote[] @relation("QuoteRevisions")
```

- [ ] **Step 2: Edit the QuoteEvent model**

Add `source` between `metadata` and `createdAt` in `model QuoteEvent`:

```prisma
  source     String?  // "customer" | "builder" | "system_supersede" — null = legacy
```

- [ ] **Step 3: Create the migration**

Run: `npx prisma migrate dev --name quote_revisions_and_event_source`
Expected: new directory under `prisma/migrations/` with a `migration.sql` that adds `revisedFromId` to `Quote` and `source` to `QuoteEvent`, plus the self-relation foreign key.

- [ ] **Step 4: Verify generated migration SQL**

Open the new `migration.sql`. Confirm three statements: `ALTER TABLE "Quote" ADD COLUMN "revisedFromId" INTEGER;`, `ALTER TABLE "QuoteEvent" ADD COLUMN "source" TEXT;`, and a foreign key constraint on `Quote.revisedFromId` referencing `Quote(id)` with `ON DELETE SET NULL`.

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "✔ Generated Prisma Client" and no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Quote.revisedFromId and QuoteEvent.source"
```

---

### Task 1.2: Update seed.ts to set `source` on existing QuoteEvent writes

**Files:**
- Modify: `prisma/seed.ts`

Per AGENTS.md, the seed must reflect schema changes.

- [ ] **Step 1: Find all `quoteEvent.create` and `prisma.quoteEvent.create` calls in seed.ts**

Run: `grep -n "quoteEvent" prisma/seed.ts`

For each call, add `source: "customer"` (for `type: "accepted"` and `type: "declined"`) or `source: "builder"` (for `type: "sent"`, `type: "viewed"`, `type: "link_rotated"`, `type: "resent"`) into the `data` object.

- [ ] **Step 2: Run the seed**

Run: `npm run seed`
Expected: completes without error. Confirm message "Seeding demo data…" through to the success line.

- [ ] **Step 3: Verify in psql / Prisma Studio (optional)**

Run: `npx prisma studio` and open the QuoteEvent table — every row should have a non-null `source`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): set QuoteEvent.source on seeded events"
```

---

## Phase 2 — `reviseQuote` repository + API route

### Task 2.1: Write the `reviseQuote` repository function

**Files:**
- Modify: `lib/repositories/quoteRepo.ts`
- Test: `__tests__/repositories/reviseQuote.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/reviseQuote.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviseQuote } from "@/lib/repositories/quoteRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    quote: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    lineItem: {
      createMany: vi.fn(),
    },
    quoteEvent: {
      create: vi.fn(),
    },
    organization: {
      update: vi.fn(),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
// biome-ignore lint/suspicious/noExplicitAny: test helper
const tx = (prisma as any).__tx;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reviseQuote", () => {
  it("clones a quote into a new draft with revisedFromId set", async () => {
    tx.quote.findFirst.mockResolvedValue({
      id: 7,
      orgId: "org_1",
      estimateId: 42,
      quoteNumber: 5001,
      taxRate: 0.08,
      markupPct: 35,
      depositPct: 0.5,
      items: [{ id: "r1", type: "room", name: "Kitchen", area: 200 }],
      lineItems: [
        {
          name: "Hardwood",
          unitLabel: "sqft",
          rate: 9.5,
          qtyMode: "auto",
          qtyManual: null,
          roomLinks: [],
        },
      ],
    });
    tx.organization.update.mockResolvedValue({ nextQuoteNumber: 5002 });
    tx.quote.create.mockResolvedValue({ id: 99 });

    const result = await reviseQuote(7, "org_1");

    expect(result).toEqual({ id: 99 });
    expect(tx.quote.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.quote.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("draft");
    expect(createArgs.data.revisedFromId).toBe(7);
    expect(createArgs.data.acceptedAt).toBeUndefined();
    expect(createArgs.data.declinedAt).toBeUndefined();
    expect(createArgs.data.approvalToken).toBeDefined();
    expect(tx.lineItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.quoteEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 99,
          type: "revised_from",
          source: "builder",
          metadata: { revisedFromId: 7, revisedFromQuoteNumber: 5001 },
        }),
      })
    );
  });

  it("returns null when the original quote is missing or wrong org", async () => {
    tx.quote.findFirst.mockResolvedValue(null);
    const result = await reviseQuote(7, "org_1");
    expect(result).toBeNull();
    expect(tx.quote.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run __tests__/repositories/reviseQuote.test.ts`
Expected: FAIL — `reviseQuote is not a function` or import error.

- [ ] **Step 3: Add `revised_from` to the QuoteEvent type union**

In `lib/repositories/quoteEventRepo.ts` (lines 4–10 per the file map), extend the union:

```ts
export type QuoteEventType =
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "link_rotated"
  | "resent"
  | "revised_from";
```

Also update the comment on the Prisma `QuoteEvent.type` field in `prisma/schema.prisma:162` to include `revised_from`.

- [ ] **Step 4: Implement `reviseQuote`**

Add to `lib/repositories/quoteRepo.ts` after `rotateApprovalToken` (line 283). The existing `generateToken()` helper used by `rotateApprovalToken` is in scope — reuse it instead of importing `randomBytes` directly. Quote items live on `Estimate`, not `Quote`, so a revision inherits them automatically through `estimateId` — only `lineItems` need copying.

```ts
/**
 * Clone an accepted or declined quote into a new draft quote on the
 * same estimate. The new quote is linked back via `revisedFromId`.
 * Returns null if the source quote isn't found / not in the org.
 */
export async function reviseQuote(
  quoteId: number,
  orgId: string
): Promise<{ id: number } | null> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.quote.findFirst({
      where: { id: quoteId, orgId },
      include: { lineItems: true },
    });
    if (!original) return null;

    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextQuoteNumber: { increment: 1 } },
      select: { nextQuoteNumber: true },
    });
    const newQuoteNumber = org.nextQuoteNumber - 1;

    const created = await tx.quote.create({
      data: {
        orgId: original.orgId,
        estimateId: original.estimateId,
        quoteNumber: newQuoteNumber,
        status: "draft",
        date: new Date(),
        taxRate: original.taxRate,
        markupPct: original.markupPct,
        depositPct: original.depositPct,
        approvalToken: generateToken(),
        revisedFromId: original.id,
      },
      select: { id: true },
    });

    if (original.lineItems.length > 0) {
      await tx.lineItem.createMany({
        data: original.lineItems.map((li) => ({
          quoteId: created.id,
          name: li.name,
          unitLabel: li.unitLabel,
          rate: li.rate,
          qtyMode: li.qtyMode,
          qtyManual: li.qtyManual,
          roomLinks: li.roomLinks ?? [],
        })),
      });
    }

    await tx.quoteEvent.create({
      data: {
        quoteId: created.id,
        type: "revised_from",
        source: "builder",
        metadata: {
          revisedFromId: original.id,
          revisedFromQuoteNumber: original.quoteNumber,
        },
      },
    });

    return { id: created.id };
  });
}
```

If `generateToken` lives in another module, follow the same import path that `rotateApprovalToken` uses — search `grep -n "generateToken" lib/repositories/quoteRepo.ts` for the existing reference.

- [ ] **Step 5: Run the test — expect pass**

Run: `npx vitest run __tests__/repositories/reviseQuote.test.ts`
Expected: PASS, both cases green.

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/quoteRepo.ts lib/repositories/quoteEventRepo.ts prisma/schema.prisma __tests__/repositories/reviseQuote.test.ts
git commit -m "feat(repo): reviseQuote clones a quote into a new draft"
```

---

### Task 2.2: Add `POST /api/quotes/[id]/revise` route

**Files:**
- Create: `app/api/quotes/[id]/revise/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { auth } from "@/lib/auth";
import { reviseQuote, getQuote } from "@/lib/repositories/quoteRepo";
import { getOrgId } from "@/lib/tenant";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = await getOrgId();
  const { id } = await params;
  const quoteId = Number.parseInt(id, 10);
  if (Number.isNaN(quoteId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const original = await getQuote(quoteId, orgId);
  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (original.status !== "accepted" && original.status !== "declined") {
    return NextResponse.json(
      { error: "Only accepted or declined quotes can be revised" },
      { status: 409 }
    );
  }

  const result = await reviseQuote(quoteId, orgId);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
```

- [ ] **Step 2: Manually smoke-test the route**

Run: `npm run dev`
Then in another shell, with the dev server running and a known accepted quote (e.g. seeded `q5002`):

```bash
curl -X POST http://localhost:3000/api/quotes/<accepted-quote-id>/revise \
  -H "Cookie: <session cookie>" -i
```

Expected: 200 `{ "ok": true, "id": <new id> }`. Confirm in Prisma Studio that a new Quote row exists with `revisedFromId` set.

- [ ] **Step 3: Commit**

```bash
git add app/api/quotes/[id]/revise/route.ts
git commit -m "feat(api): POST /api/quotes/[id]/revise"
```

---

## Phase 3 — Lockdown

### Task 3.1: Reject mutations on terminal-state quotes in `saveQuote`

**Files:**
- Modify: `lib/repositories/quoteRepo.ts:199-258` (saveQuote)
- Test: `__tests__/repositories/saveQuote-locked.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/saveQuote-locked.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveQuote } from "@/lib/repositories/quoteRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    quote: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    lineItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
// biome-ignore lint/suspicious/noExplicitAny: test helper
const tx = (prisma as any).__tx;

beforeEach(() => vi.clearAllMocks());

describe("saveQuote lockdown", () => {
  it("returns null and does not mutate when quote is accepted", async () => {
    tx.quote.findFirst.mockResolvedValue({ id: 7, status: "accepted" });
    const result = await saveQuote(7, "org_1", { taxRate: 0.1 });
    expect(result).toBeNull();
    expect(tx.quote.update).not.toHaveBeenCalled();
  });

  it("returns null and does not mutate when quote is declined", async () => {
    tx.quote.findFirst.mockResolvedValue({ id: 7, status: "declined" });
    const result = await saveQuote(7, "org_1", { taxRate: 0.1 });
    expect(result).toBeNull();
    expect(tx.quote.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run __tests__/repositories/saveQuote-locked.test.ts`
Expected: FAIL — current `saveQuote` doesn't check status before updating.

- [ ] **Step 3: Add the lock check**

At the top of `saveQuote`'s transaction (inside `$transaction`, before any update call), add:

```ts
const existing = await tx.quote.findFirst({
  where: { id, orgId },
  select: { id: true, status: true },
});
if (!existing) return null;
if (existing.status === "accepted" || existing.status === "declined") {
  return null;
}
```

If `saveQuote` already does a `findFirst` for the row, extend its select to include `status` and add the terminal-state check there. Otherwise insert the block above as the first statement inside the transaction.

- [ ] **Step 4: Run the test — expect pass**

Run: `npx vitest run __tests__/repositories/saveQuote-locked.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a guard at the API layer for a clearer error message**

Modify the PATCH handler at `app/api/quotes/[id]/route.ts` (the file that contains the Zod `status` enum on line 26). After loading the existing quote, before calling `saveQuote`, add:

```ts
if (existing.status === "accepted" || existing.status === "declined") {
  return NextResponse.json(
    { error: `Quote is locked (status: ${existing.status})` },
    { status: 409 }
  );
}
```

(If the route fetches the existing quote already, reuse it. If not, call `getQuote(quoteId, orgId)` first.)

- [ ] **Step 6: Run unit tests**

Run: `npx vitest run __tests__/repositories/`
Expected: all pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add lib/repositories/quoteRepo.ts "app/api/quotes/[id]/route.ts" __tests__/repositories/saveQuote-locked.test.ts
git commit -m "feat(repo): lock saveQuote on accepted/declined quotes"
```

---

## Phase 4 — Auto-decline siblings on accept

### Task 4.1: Extend `acceptQuoteByToken` to auto-decline open siblings

**Files:**
- Modify: `lib/repositories/quoteSignatureRepo.ts:28-83` (acceptQuoteByToken)
- Test: `__tests__/repositories/acceptQuoteByToken-siblings.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/acceptQuoteByToken-siblings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptQuoteByToken } from "@/lib/repositories/quoteSignatureRepo";

vi.mock("@/lib/prisma", () => {
  const tx = {
    quote: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    quoteSignature: {
      create: vi.fn(),
    },
    quoteEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});

import { prisma } from "@/lib/prisma";
// biome-ignore lint/suspicious/noExplicitAny: test helper
const tx = (prisma as any).__tx;

beforeEach(() => vi.clearAllMocks());

const baseInput = {
  quoteId: 7,
  signedByName: "Jane",
  signedByEmail: "jane@example.com",
  signatureData: "data:image/png;base64,xxxx",
  signedIp: "127.0.0.1",
  signedUserAgent: "vitest",
  consentText: "consent",
  quoteSnapshot: { totals: {} },
  snapshotHash: "hash",
};

describe("acceptQuoteByToken — sibling auto-decline", () => {
  it("auto-declines open sibling quotes on the same estimate", async () => {
    tx.quote.findFirst.mockResolvedValueOnce({
      id: 7,
      status: "sent",
      estimateId: 42,
      quoteNumber: 5002,
    });
    tx.quote.findMany.mockResolvedValueOnce([
      { id: 8, quoteNumber: 5003 },
      { id: 9, quoteNumber: 5004 },
    ]);

    const result = await acceptQuoteByToken(baseInput);

    expect(result).toBe("ok");
    // sibling sweep updateMany
    const siblingCall = tx.quote.updateMany.mock.calls.find(
      (c: unknown[]) =>
        // biome-ignore lint/suspicious/noExplicitAny: test inspect
        (c[0] as any).where?.id?.not === 7
    );
    expect(siblingCall).toBeTruthy();
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const where = (siblingCall as any[])[0].where;
    // biome-ignore lint/suspicious/noExplicitAny: test inspect
    const data = (siblingCall as any[])[0].data;
    expect(where.estimateId).toBe(42);
    expect(where.status).toEqual({ in: ["draft", "sent", "viewed"] });
    expect(data.status).toBe("declined");
    expect(data.declineReason).toMatch(/^Superseded — customer accepted Quote #5002/);
    // one QuoteEvent per affected sibling
    expect(tx.quoteEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          quoteId: 8,
          type: "declined",
          source: "system_supersede",
        }),
        expect.objectContaining({
          quoteId: 9,
          type: "declined",
          source: "system_supersede",
        }),
      ]),
    });
  });

  it("does not touch already-terminal siblings", async () => {
    tx.quote.findFirst.mockResolvedValueOnce({
      id: 7,
      status: "sent",
      estimateId: 42,
      quoteNumber: 5002,
    });
    tx.quote.findMany.mockResolvedValueOnce([]);

    await acceptQuoteByToken(baseInput);

    // updateMany still called, but with an empty in-scope set
    const siblingCall = tx.quote.updateMany.mock.calls.find(
      (c: unknown[]) =>
        // biome-ignore lint/suspicious/noExplicitAny: test inspect
        (c[0] as any).where?.id?.not === 7
    );
    expect(siblingCall).toBeTruthy();
    expect(tx.quoteEvent.createMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run __tests__/repositories/acceptQuoteByToken-siblings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `acceptQuoteByToken`**

Replace the body of the function in `lib/repositories/quoteSignatureRepo.ts` with:

```ts
export async function acceptQuoteByToken(
  input: AcceptQuoteInput
): Promise<AcceptQuoteResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findFirst({
      where: { id: input.quoteId },
      select: { id: true, status: true, estimateId: true, quoteNumber: true },
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
      if (err instanceof Error && err.message.includes("Unique")) {
        return "already_signed" as const;
      }
      throw err;
    }

    await tx.quote.updateMany({
      where: {
        id: input.quoteId,
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    await tx.quoteEvent.create({
      data: {
        quoteId: input.quoteId,
        type: "accepted",
        source: "customer",
        actorEmail: input.signedByEmail,
        actorName: input.signedByName,
        ip: input.signedIp,
        userAgent: input.signedUserAgent,
      },
    });

    // Identify open siblings, then sweep them to declined.
    const openSiblings = await tx.quote.findMany({
      where: {
        estimateId: q.estimateId,
        id: { not: q.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      select: { id: true, quoteNumber: true },
    });

    const declineReason = `Superseded — customer accepted Quote #${q.quoteNumber}`;
    await tx.quote.updateMany({
      where: {
        estimateId: q.estimateId,
        id: { not: q.id },
        status: { in: ["draft", "sent", "viewed"] },
      },
      data: {
        status: "declined",
        declinedAt: new Date(),
        declineReason,
      },
    });

    if (openSiblings.length > 0) {
      await tx.quoteEvent.createMany({
        data: openSiblings.map((s) => ({
          quoteId: s.id,
          type: "declined",
          source: "system_supersede",
          metadata: { supersededByQuoteId: q.id, supersededByQuoteNumber: q.quoteNumber },
        })),
      });
    }

    return "ok" as const;
  });
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npx vitest run __tests__/repositories/acceptQuoteByToken-siblings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/quoteSignatureRepo.ts __tests__/repositories/acceptQuoteByToken-siblings.test.ts
git commit -m "feat(repo): auto-decline open sibling quotes on accept"
```

---

### Task 4.2: Set `source` on customer decline

**Files:**
- Modify: `lib/repositories/quoteRepo.ts:394-428` (declineQuoteByToken)

- [ ] **Step 1: Add `source: "customer"` to the QuoteEvent write**

In the `tx.quoteEvent.create` call inside `declineQuoteByToken`, add `source: "customer"` to the `data` object:

```ts
await tx.quoteEvent.create({
  data: {
    quoteId,
    type: "declined",
    source: "customer",
    ip: input.ip ?? undefined,
    userAgent: input.userAgent ?? undefined,
    metadata: input.reason ? { reason: input.reason } : undefined,
  },
});
```

- [ ] **Step 2: Update other QuoteEvent writes for consistency**

Search for other `quoteEvent.create` calls in `lib/repositories/*.ts`. For each, set `source` to the appropriate value:
- `markQuoteSent` → `source: "builder"`
- `markQuoteViewed` → `source: "customer"`
- `rotateApprovalToken` (if it writes a `link_rotated` event) → `source: "builder"`
- Any resend → `source: "builder"`

Run: `grep -rn "quoteEvent.create" lib/repositories/`

- [ ] **Step 3: Run all repo tests**

Run: `npx vitest run __tests__/repositories/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/repositories/
git commit -m "feat(repo): set source on all QuoteEvent writes"
```

---

## Phase 5 — Builder UI

### Task 5.1: Add a `locked` derived flag and read-only mode wiring

**Files:**
- Modify: `components/quotes/QuoteBuilder.tsx`

- [ ] **Step 1: Compute `locked` at the top of the component**

Near the top of the `QuoteBuilder` function body, before the return statement, add:

```tsx
const locked = quote.status === "accepted" || quote.status === "declined";
```

- [ ] **Step 2: Pass `locked` through to child editors**

Find the `LineItemSection` render (around `QuoteBuilder.tsx:174-187` per the file map) and the `QuoteSummary` render (around 190-204). Pass `locked` as a `readOnly` prop:

```tsx
<LineItemSection
  // ...existing props
  readOnly={locked}
/>
<QuoteSummary
  // ...existing props
  readOnly={locked}
/>
```

- [ ] **Step 3: In each child, accept `readOnly` and disable mutation paths**

In `components/quotes/LineItemSection.tsx` (and `QuoteSummary.tsx`), add `readOnly?: boolean` to props, then:
- Disable all `<input>` / `<button>` editor controls (`disabled={readOnly}` or skip rendering Add / Delete buttons).
- Guard `onChange` / `onSave` handlers with `if (readOnly) return;` early-exit.

If the child renders a `<form>` or an editable table cell, replace it with a static span when `readOnly` is true.

- [ ] **Step 4: Hide the Save button when locked**

Find the Save button in `QuoteBuilder.tsx`. Wrap it: `{!locked && <SaveButton ... />}`.

- [ ] **Step 5: Build to confirm no type errors**

Run: `npx tsc --noEmit 2>&1 | grep -v "Cannot find module 'resend'" | grep -v "Cannot find module '@react-email/components'"`
Expected: empty output (no new type errors beyond the pre-existing email-deps gaps).

- [ ] **Step 6: Commit**

```bash
git add components/quotes/
git commit -m "feat(ui): read-only mode for accepted/declined quotes"
```

---

### Task 5.2: Add accepted and declined banners

**Files:**
- Create: `components/quotes/QuoteLockBanner.tsx` (NEW)
- Modify: `components/quotes/QuoteBuilder.tsx`

- [ ] **Step 1: Create the banner component**

`components/quotes/QuoteLockBanner.tsx`:

```tsx
interface Props {
  status: "accepted" | "declined";
  acceptedByName?: string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  declineSource?: string | null; // "customer" | "system_supersede" | null
  supersededByQuoteNumber?: number | null;
  signedHref?: string;
}

export function QuoteLockBanner({
  status,
  acceptedByName,
  acceptedAt,
  declinedAt,
  declineReason,
  declineSource,
  supersededByQuoteNumber,
  signedHref,
}: Props) {
  if (status === "accepted") {
    const date = acceptedAt
      ? new Date(acceptedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-md bg-[rgba(61,107,74,0.10)] border border-[var(--sage)]">
        <div className="w-8 h-8 rounded-full bg-[var(--sage)] text-white flex items-center justify-center font-[700]">
          ✓
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-[600] text-[var(--sage)]">
            Accepted{acceptedByName ? ` by ${acceptedByName}` : ""}
            {date ? ` on ${date}` : ""}
          </div>
          <div className="text-[12px] text-[var(--ink-2)]">
            This quote is locked. Use Revise to make changes.
          </div>
        </div>
        {signedHref && (
          <a
            href={signedHref}
            className="text-[12px] font-[var(--font-mono)] text-[var(--accent)] underline"
          >
            View signed quote →
          </a>
        )}
      </div>
    );
  }

  const date = declinedAt
    ? new Date(declinedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const isSuperseded = declineSource === "system_supersede";
  const heading = isSuperseded
    ? `Auto-declined${
        supersededByQuoteNumber
          ? ` when Quote #${supersededByQuoteNumber} was accepted`
          : ""
      }`
    : `Declined by customer${date ? ` on ${date}` : ""}`;

  return (
    <div className="mb-6 p-4 rounded-md bg-[rgba(192,52,26,0.06)] border border-[var(--accent)]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-[700]">
          ✗
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-[600] text-[var(--accent)]">
            {heading}
          </div>
          <div className="text-[12px] text-[var(--ink-2)]">
            This quote is locked. Use Revise to send a new version.
          </div>
        </div>
      </div>
      {!isSuperseded && declineReason ? (
        <div className="mt-3 pl-11 text-[16px] italic text-[var(--ink)]">
          "{declineReason}"
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire the banner into QuoteBuilder**

In `components/quotes/QuoteBuilder.tsx`, just under the header block (around line 154 per the file map), insert:

```tsx
{locked && (
  <QuoteLockBanner
    status={quote.status as "accepted" | "declined"}
    acceptedByName={quote.signature?.signedByName ?? null}
    acceptedAt={quote.acceptedAt ?? null}
    declinedAt={quote.declinedAt ?? null}
    declineReason={quote.declineReason ?? null}
    declineSource={quote.latestDeclineEvent?.source ?? null}
    supersededByQuoteNumber={
      (quote.latestDeclineEvent?.metadata as {
        supersededByQuoteNumber?: number;
      } | null)?.supersededByQuoteNumber ?? null
    }
    signedHref={`/quotes/${quote.id}/signed`}
  />
)}
```

You'll need to load `latestDeclineEvent` and `signature.signedByName` in the existing `getQuote` repository function. Update its `include` to:

```ts
include: {
  // ...existing
  signature: { select: { signedByName: true } },
  quoteEvents: {
    where: { type: "declined" },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
}
```

Then surface `quote.quoteEvents[0]` as `latestDeclineEvent` in the page that renders `QuoteBuilder`.

- [ ] **Step 3: Import the banner**

At the top of `QuoteBuilder.tsx`:

```tsx
import { QuoteLockBanner } from "./QuoteLockBanner";
```

- [ ] **Step 4: Build to confirm types**

Run: `npx tsc --noEmit` and resolve any new errors related to the new prop.

- [ ] **Step 5: Visual smoke test**

Run: `npm run dev`. Navigate to an accepted quote (seeded `q5002`) and a declined quote. Confirm both banners render in both light and dark modes.

- [ ] **Step 6: Commit**

```bash
git add components/quotes/QuoteBuilder.tsx components/quotes/QuoteLockBanner.tsx lib/repositories/quoteRepo.ts
git commit -m "feat(ui): accepted/declined banners on quote builder"
```

---

### Task 5.3: Add the Revise button

**Files:**
- Modify: `components/quotes/QuoteBuilder.tsx`

- [ ] **Step 1: Render a Revise button when locked**

In the header action area of `QuoteBuilder.tsx` (around line 119 per the file map), add:

```tsx
{locked && <ReviseButton quoteId={quote.id} />}
```

- [ ] **Step 2: Create the `ReviseButton` component**

Inline or as a small file `components/quotes/ReviseButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviseButton({ quoteId }: { quoteId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/revise`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const body = (await res.json()) as { id: number };
      router.push(`/quotes/${body.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revise");
      setPending(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="py-2.5 px-4 bg-[var(--accent)] text-white border-0 rounded-md text-[13px] font-[600] inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {pending ? "Revising…" : "Revise"}
    </button>
  );
}
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. From an accepted quote, click Revise. Confirm the URL changes to the new quote id and the new draft has the same line items.

- [ ] **Step 4: Commit**

```bash
git add components/quotes/QuoteBuilder.tsx components/quotes/ReviseButton.tsx
git commit -m "feat(ui): Revise button on locked quotes"
```

---

### Task 5.4: Show revision-chain links

**Files:**
- Modify: `lib/repositories/quoteRepo.ts:131-150` (getQuote — include relations)
- Modify: `components/quotes/QuoteBuilder.tsx`

- [ ] **Step 1: Include revision relations in `getQuote`**

In `getQuote`'s `include`, add:

```ts
revisedFrom: { select: { id: true, quoteNumber: true } },
revisedBy: { select: { id: true, quoteNumber: true } },
```

- [ ] **Step 2: Render the links above the page header**

In `QuoteBuilder.tsx`, just before the existing header block (around line 84), add:

```tsx
{(quote.revisedFrom || (quote.revisedBy && quote.revisedBy.length > 0)) && (
  <div className="mb-3 font-[var(--font-mono)] text-[11px] text-[var(--muted)] flex gap-3 flex-wrap">
    {quote.revisedFrom && (
      <a
        href={`/quotes/${quote.revisedFrom.id}`}
        className="text-[var(--accent)] underline"
      >
        ← Revision of Q#{quote.revisedFrom.quoteNumber}
      </a>
    )}
    {quote.revisedBy?.map((rev) => (
      <a
        key={rev.id}
        href={`/quotes/${rev.id}`}
        className="text-[var(--accent)] underline"
      >
        Revised by Q#{rev.quoteNumber} →
      </a>
    ))}
  </div>
)}
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. Confirm clicking through the revision chain in both directions works.

- [ ] **Step 4: Commit**

```bash
git add lib/repositories/quoteRepo.ts components/quotes/QuoteBuilder.tsx
git commit -m "feat(ui): revision-chain links on quote builder"
```

---

## Phase 6 — Customer-side decline page contact info

### Task 6.1: Include builder contact on the public quote payload

**Files:**
- Modify: `lib/repositories/quoteRepo.ts` (the existing `getQuoteByToken` or whichever populates `org` for the public view)
- Modify: `components/estimates/PublicQuoteView.tsx:115-125` (decline branch)

- [ ] **Step 1: Add the owner email to the public payload**

In `getQuoteByToken`, when fetching the org, also include one owner's email. There is no direct `org.ownerEmail` field — query Users with `role: "owner"`, take the first:

```ts
const org = await prisma.organization.findFirst({
  where: { id: quote.orgId },
  select: {
    name: true,
    phone: true,
    address: true,
    licenseNumber: true,
    logo: true,
    users: {
      where: { role: "owner" },
      orderBy: { id: "asc" },
      take: 1,
      select: { email: true },
    },
  },
});
// shape it as `ownerEmail` for the consumer
```

Add `ownerEmail: string | null` to the public `org` shape in the `PublicQuote` interface (`components/estimates/PublicQuoteView.tsx:29-35`).

- [ ] **Step 2: Render contact info on the decline branch**

Replace `components/estimates/PublicQuoteView.tsx:115-125` with:

```tsx
{quote.status === "declined" && (
  <div className="mt-9 pt-6 border-t border-[var(--line)]">
    <div className="text-[14px] text-[var(--ink-2)]">
      This quote was declined on{" "}
      {new Date(quote.declinedAt ?? Date.now()).toLocaleDateString()}.
    </div>
    {quote.declineReason ? (
      <div className="mt-2 italic text-[var(--muted)] text-[14px]">
        "{quote.declineReason}"
      </div>
    ) : null}
    {(quote.org.phone || quote.org.ownerEmail) && (
      <div className="mt-5 text-[13px] text-[var(--ink-2)]">
        Changed your mind or have questions? Contact{" "}
        <span className="font-[600]">{quote.org.name}</span>:
        <div className="mt-1 font-[var(--font-mono)] text-[12px]">
          {quote.org.phone && <span>{quote.org.phone}</span>}
          {quote.org.phone && quote.org.ownerEmail && <span> · </span>}
          {quote.org.ownerEmail && (
            <a
              href={`mailto:${quote.org.ownerEmail}`}
              className="text-[var(--accent)] underline"
            >
              {quote.org.ownerEmail}
            </a>
          )}
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. Visit a declined public quote (`/q/<token>`). Confirm the contact line appears.

- [ ] **Step 4: Commit**

```bash
git add lib/repositories/quoteRepo.ts components/estimates/PublicQuoteView.tsx
git commit -m "feat(public): builder contact on declined quote page"
```

---

## Phase 7 — List view revision badge

### Task 7.1: Show a small badge next to revised quotes

**Files:**
- Modify: `lib/repositories/quoteRepo.ts:88-110` (listQuotes — include flag)
- Modify: `components/quotes/QuoteList.tsx:111-170` (per-row render)

- [ ] **Step 1: Surface `revisedFromId` in the list query**

In `listQuotes`, add `revisedFromId: true` to the select (or include it implicitly via `include`).

- [ ] **Step 2: Render the badge**

In the per-row render of `QuoteList.tsx`, where the quote number is shown (around line 126), add:

```tsx
<span>#{q.quoteNumber}</span>
{q.revisedFromId && (
  <span
    className="ml-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[.04em] text-[var(--muted)] border border-[var(--line-2)] rounded-sm px-1"
    title="Revised quote"
  >
    ↶ rev
  </span>
)}
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. Trigger Phase 2/5 to create a revision. Confirm the badge shows on the new row in `/quotes`.

- [ ] **Step 4: Commit**

```bash
git add lib/repositories/quoteRepo.ts components/quotes/QuoteList.tsx
git commit -m "feat(ui): revision badge in quote list"
```

---

## Final verification

### Task 8.1: Run the full check

- [ ] **Step 1: Lint**

Run: `npx biome ci .`
Expected: no errors.

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "Cannot find module 'resend'" | grep -v "Cannot find module '@react-email/components'"`
Expected: empty.

- [ ] **Step 4: End-to-end manual walkthrough**

1. Open `/quotes` — confirm seeded accepted quote shows correctly.
2. Open an accepted quote in builder — confirm read-only, banner, View signed link, Revise button.
3. Click Revise → confirm new draft opens, edit line items, send (use existing send flow) — manual but verify nothing is broken.
4. From the same estimate's quote list, accept one of the open quotes — confirm sibling open quotes flip to declined with "Superseded — customer accepted Quote #N".
5. Visit `/q/<token>` for a customer-declined quote — confirm contact info renders.
6. Visit `/q/<token>` for a system-superseded quote — confirm it renders as a customer-declined page (no special UI, per spec).
7. From a declined quote, click Revise → confirm new draft.
8. Confirm revision chain links work in both directions.

- [ ] **Step 5: Final commit and PR if everything passes**

```bash
git status   # should be clean
gh pr create --title "feat: lock accepted/declined quotes + Revise flow" \
  --body "$(cat <<'EOF'
## Summary
- Accepted and declined quotes become read-only at the repository layer
- New `Revise` action clones a locked quote into a fresh draft on the same estimate
- Customer accept now auto-declines open sibling quotes on the same estimate
- Builder UI: lock banner, Revise button, revision-chain links, list-view revision badge
- Customer decline page now shows builder contact info

## Spec
docs/superpowers/specs/2026-05-16-quote-terminal-behavior-design.md

## Test plan
- [ ] Unit tests pass (`npm test`)
- [ ] Lint passes (`biome ci .`)
- [ ] Manual walkthrough per plan Task 8.1 Step 4

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
