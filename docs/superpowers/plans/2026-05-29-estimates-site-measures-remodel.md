# Estimates / Site Measures Remodel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the domain (Quote→Estimate, Estimate→SiteMeasure), introduce a first-class `Location` entity between Customer and SiteMeasure, and replace the drawn-signature workflow with one-click customer approval backed by a lightweight snapshot.

**Architecture:** Done in four phases. Phase 1 is a **pure mechanical rename** that keeps behavior identical and the whole app green (the existing tests, renamed, still pass). Phase 2 adds the `Location` entity and repoints SiteMeasure at it. Phase 3 converts the signature apparatus to one-click approval and renames the public route. Phase 4 rebuilds the seed, updates the glossary, and runs all gates. Because Prisma's generated client types change atomically with the schema, each rename phase reaches its green checkpoint as a unit rather than per-file.

**Tech Stack:** Next.js (vendored build — see `node_modules/next/dist/docs/`), Prisma (client generated to `app/generated/prisma`), PostgreSQL (Neon), Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-05-29-estimates-site-measures-remodel-design.md`

---

## Conventions & Gates

- **Dev DB only.** All `prisma migrate`/`seed` commands run against `.env` (Neon host `ep-billowing-fire-...`). **Never** run them against `.env.prd.local` (`ep-holy-credit-...`). Use the `:dev` npm scripts, never `:prd`.
- **Green checkpoint** (run at the end of every phase, all must pass):
  ```bash
  npm run typecheck   # tsc --noEmit
  npm run lint:ci     # biome ci .
  npm run test        # vitest run
  npm run seed:dev    # reseed the dev DB against the current schema
  npx playwright test # e2e
  ```
- **Migrations during the work:** use `dotenv -e .env -- npx prisma migrate dev --name <desc>` for each schema change so the dev DB and generated client stay in sync. Renames will be emitted by Prisma as drop+create (data loss) — acceptable pre-launch; we reseed. The migration history is **squashed to a single baseline in Task 4.3**, so intermediate migration names don't matter.
- **Rename discipline:** never blind-sed the whole repo. Work the symbol/file maps below in order, then let `npm run typecheck` surface stragglers; fix until clean.

---

## File Structure (target state)

```
prisma/schema.prisma          Location (new), SiteMeasure (was Estimate),
                              SiteMeasureItem (was EstimateItem), Estimate (was Quote),
                              EstimateApproval (was QuoteSignature, gutted),
                              EstimateEvent (was QuoteEvent). Customer.address removed.
app/(app)/site-measures/      was app/(app)/estimates/   (measurement UI pages)
app/(app)/estimates/          was app/(app)/quotes/      (priced-estimate UI pages)
app/api/site-measures/        was app/api/estimates/
app/api/estimates/            was app/api/quotes/
app/estimate-review/[token]/  was app/q/[token]/         (public page)
app/api/estimate-review/[token]/approve   was app/api/q/[token]/accept
app/api/estimate-review/[token]/decline   was app/api/q/[token]/decline
lib/siteMeasures/             was lib/estimates/
lib/estimates/, lib/estimateStatus.ts   was lib/quotes/, lib/quoteStatus.ts
lib/estimateView/             was lib/quoteView/
lib/repositories/siteMeasureRepo.ts      was estimateRepo.ts
lib/repositories/estimateRepo.ts         was quoteRepo.ts
lib/repositories/estimateEventRepo.ts    was quoteEventRepo.ts
lib/repositories/estimateApprovalRepo.ts was quoteSignatureRepo.ts (rewritten)
lib/repositories/locationRepo.ts         NEW
lib/hooks/useSiteMeasures.ts  was useEstimates.ts
lib/hooks/useEstimates.ts     was useQuotes.ts
components/siteMeasures/      was the measurement files in components/estimates/
components/estimates/         the priced files from components/quotes/ + public page
```

---

# Phase 1 — Mechanical Rename Sweep (no behavior change)

Two ordered passes. **Pass A first** (vacates the word "estimate" for the old measurement concept), **then Pass B** (frees "quote" into "estimate"). Behavior is unchanged; status string stays `accepted` for now (changed in Phase 3).

## Task 1.1: Schema rename — both passes, no structural change yet

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Apply Pass A renames to the schema** (old Estimate concept → SiteMeasure)

In `prisma/schema.prisma` rename, **in this exact order so identifiers don't collide**:
  - `model EstimateItem` → `model SiteMeasureItem`
  - `model Estimate` → `model SiteMeasure` (the measurement model: `items`, `quotes`, `title`, `estimateNumber`, `customerId`)
  - field `estimateNumber` → `siteMeasureNumber` (on the new SiteMeasure)
  - relation field `estimates SiteMeasure[]` wherever it appears (on `Organization`, `Customer`) — rename the **field** to `siteMeasures` (the type already became `SiteMeasure`)
  - on the `Quote` model: relation `estimate Estimate` → `siteMeasure SiteMeasure`, and FK `estimateId` → `siteMeasureId`
  - on `SiteMeasureItem`: `estimateId`/`estimate` → `siteMeasureId`/`siteMeasure`
  - on `Organization`: `nextEstimateNumber` → `nextSiteMeasureNumber`

- [ ] **Step 2: Apply Pass B renames to the schema** (Quote concept → Estimate)
  - `model Quote` → `model Estimate`
  - `model QuoteSignature` → `model EstimateSignature` (faithful rename only — gutted in Phase 3)
  - `model QuoteEvent` → `model EstimateEvent`
  - fields: `quoteNumber` → `estimateNumber`; `quoteId` FKs → `estimateId` (on `EstimateSignature`, `EstimateEvent`, `LineItem`, `Event`)
  - relation fields named `quote`/`quotes`/`quoteEvents`/`signature` → `estimate`/`estimates`/`estimateEvents`/`approval`? **No** — keep `signature` named `signature` for now (Phase 3 renames to `approval`). Rename `quotes` (on SiteMeasure) → `estimates`; `quoteEvents` → `estimateEvents`.
  - on `Organization`: `nextQuoteNumber` → `nextEstimateNumber`; `showLicenseOnQuotes` → `showLicenseOnEstimates`; relation `quotes Quote[]` → `estimates Estimate[]`
  - leave `status` default `"draft"` and the `accepted`/`declined` literals in comments as-is for now

- [ ] **Step 3: Sanity-check the schema parses**

Run: `dotenv -e .env -- npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

## Task 1.2: Migrate + regenerate client

- [ ] **Step 1: Generate the migration and regenerate the client**

Run: `dotenv -e .env -- npx prisma migrate dev --name rename_quote_estimate_sitemeasure`
Expected: migration applies (with data-loss warning — accept), then `✔ Generated Prisma Client`. The dev DB is now empty of demo data; we reseed at the phase gate.

- [ ] **Step 2: Confirm the generated client exposes the new accessors**

Run: `node -e "const{PrismaClient}=require('./app/generated/prisma/client');const p=new PrismaClient();console.log(typeof p.siteMeasure,typeof p.estimate,typeof p.siteMeasureItem,typeof p.estimateEvent)"`
Expected: `object object object object` (no `undefined`). `p.quote` would now be `undefined` — that's expected; the code sweep fixes callers next.

## Task 1.3: Code symbol + file sweep — Pass A (measurement → SiteMeasure)

Apply across `lib/`, `app/`, `components/`, `__tests__/`, `tests/`. **Move files/dirs and rename symbols together.** After this task the build is still broken (Pass B not done) — that's expected; do **not** commit mid-sweep.

**Directory / file moves (Pass A):**
- [ ] `app/(app)/estimates/` → `app/(app)/site-measures/`
- [ ] `app/api/estimates/` → `app/api/site-measures/`
- [ ] `lib/estimates/` → `lib/siteMeasures/`
- [ ] `lib/repositories/estimateRepo.ts` → `lib/repositories/siteMeasureRepo.ts`
- [ ] `lib/hooks/useEstimates.ts` → `lib/hooks/useSiteMeasures.ts`
- [ ] Move measurement components out of `components/estimates/` into a new `components/siteMeasures/`:
  - `EstimateBuilder.tsx` → `components/siteMeasures/SiteMeasureBuilder.tsx`
  - `EstimateList.tsx` → `components/siteMeasures/SiteMeasureList.tsx`
  - `filterEstimates.ts` → `components/siteMeasures/filterSiteMeasures.ts`
  - `EstimateQuotesCard.tsx` → `components/siteMeasures/SiteMeasureEstimatesCard.tsx` (the inner "quotes" become "estimates" in Pass B)
  - **Leave in `components/estimates/`:** `PublicQuoteView.tsx`, `public-quote/`, `LineItemSection.tsx` (these are Quote-concept; handled in Pass B)
- [ ] `components/dashboard/EstimatesTable.tsx` → `SiteMeasuresTable.tsx`
- [ ] Tests: `__tests__/repositories/estimateRepo.test.ts` → `siteMeasureRepo.test.ts`; `__tests__/components/estimates/filterEstimates.test.ts` → `__tests__/components/siteMeasures/filterSiteMeasures.test.ts`; `tests/e2e/estimate-builder.spec.ts` → `tests/e2e/site-measure-builder.spec.ts`; `tests/e2e/estimates-list.spec.ts` → `tests/e2e/site-measures-list.spec.ts`

**Symbol renames (Pass A), case-sensitive, whole-word where possible:**
- [ ] `Estimate` → `SiteMeasure`, `estimate` → `siteMeasure`, `estimates` → `siteMeasures`, `Estimates` → `SiteMeasures`
- [ ] `EstimateItem` → `SiteMeasureItem`, `estimateItem` → `siteMeasureItem`
- [ ] `estimateNumber` → `siteMeasureNumber`, `nextEstimateNumber` → `nextSiteMeasureNumber`
- [ ] `estimateId` → `siteMeasureId` (the FK from Quote→Estimate becomes Quote→SiteMeasure)
- [ ] `EstimateBuilder` → `SiteMeasureBuilder`, `EstimateList` → `SiteMeasureList`, `filterEstimates` → `filterSiteMeasures`, `useEstimates` → `useSiteMeasures`, `EstimateQuotesCard` → `SiteMeasureEstimatesCard`, `EstimatesTable` → `SiteMeasuresTable`
- [ ] route literals `/estimates` → `/site-measures`, `/api/estimates` → `/api/site-measures`
- [ ] user-facing strings "Estimate"/"estimate" referring to the measurement → "Site Measure"/"site measure"

## Task 1.4: Code symbol + file sweep — Pass B (Quote → Estimate)

**Directory / file moves (Pass B):**
- [ ] `app/(app)/quotes/` → `app/(app)/estimates/` (now free)
- [ ] `app/api/quotes/` → `app/api/estimates/`
- [ ] `lib/quotes/` → `lib/estimates/`; `lib/quoteStatus.ts` → `lib/estimateStatus.ts`
- [ ] `lib/quoteView/` → `lib/estimateView/` (rename inner `compute.ts` export `computeQuoteView` → `computeEstimateView`, `fromPrismaQuote` → `fromPrismaEstimate`, types `QuoteInput`/`QuoteView`/`QuoteSnapshot*` → `Estimate*`)
- [ ] `lib/repositories/quoteRepo.ts` → `estimateRepo.ts` (now free); `quoteEventRepo.ts` → `estimateEventRepo.ts`; `quoteSignatureRepo.ts` → `estimateSignatureRepo.ts` (gutted in Phase 3)
- [ ] `lib/hooks/useQuotes.ts` → `useEstimates.ts` (now free)
- [ ] Move priced components from `components/quotes/` into `components/estimates/`:
  - `QuoteBuilder.tsx` → `components/estimates/EstimateBuilder.tsx` (name now free), `QuoteList.tsx` → `EstimateList.tsx`, `QuoteLockBanner.tsx` → `EstimateLockBanner.tsx`, `ReviseButton.tsx` (keep), `SendQuoteDialog.tsx` → `SendEstimateDialog.tsx`, `filterQuotes.ts` → `filterEstimates.ts`
  - Rename in place under `components/estimates/`: `PublicQuoteView.tsx` → `PublicEstimateView.tsx`; `public-quote/` → `public-estimate/` (and the `PublicQuote*` components → `PublicEstimate*`)
- [ ] `lib/email/CustomerQuoteEmail.tsx` → `CustomerEstimateEmail.tsx`; `lib/email/sendQuoteEmail.ts` → `sendEstimateEmail.ts`
- [ ] Tests: `quotes.test.ts`→`estimates.test.ts`, `quotes.[id].test.ts`, `quotes.[id].send.test.ts`, `filterQuotes.test.ts`→`__tests__/components/estimates/filterEstimates.test.ts`, `quoteRepo.test.ts`→`estimateRepo.test.ts`, `quoteEventRepo.test.ts`→`estimateEventRepo.test.ts`, `reviseQuote.test.ts`→`reviseEstimate.test.ts`, `saveQuote-locked.test.ts`→`saveEstimate-locked.test.ts`, `quoteView/*`→`estimateView/*`, `sendQuoteEmail.test.ts`→`sendEstimateEmail.test.ts`, e2e `quote-*.spec.ts`→`estimate-*.spec.ts`, `quotes-list.spec.ts`→`estimates-list.spec.ts`

**Symbol renames (Pass B):**
- [ ] `Quote` → `Estimate`, `quote` → `estimate`, `quotes` → `estimates`, `Quotes` → `Estimates`, `QUOTE` → `ESTIMATE`
- [ ] `quoteNumber` → `estimateNumber`, `nextQuoteNumber` → `nextEstimateNumber`, `quoteId` → `estimateId`, `showLicenseOnQuotes` → `showLicenseOnEstimates`
- [ ] `QuoteEvent`/`quoteEvent(s)` → `EstimateEvent`/`estimateEvent(s)`; `QuoteSignature` → `EstimateSignature`
- [ ] `computeQuoteView`→`computeEstimateView`, `fromPrismaQuote`→`fromPrismaEstimate`, `useQuotes`→`useEstimates`, `QuoteBuilder`→`EstimateBuilder`, etc. (mirror the file moves above)
- [ ] error classes `QuoteLockedError`/`QuoteHasEventsError` → `EstimateLockedError`/`EstimateHasEventsError`; codes `QUOTE_LOCKED`→`ESTIMATE_LOCKED`, `QUOTE_HAS_EVENTS`→`ESTIMATE_HAS_EVENTS` (in `lib/api/errors.ts` and all throwers/clients). Update `QuoteLockedError`'s param type to `"accepted" | "declined"` for now (becomes `"approved"` in Phase 3).
- [ ] route literals `/quotes`→`/estimates`, `/api/quotes`→`/api/estimates`
- [ ] user-facing strings "Quote"/"quote" → "Estimate"/"estimate"
- [ ] update `lib/repositories/index.ts` re-exports to the new filenames

## Task 1.5: Phase 1 green checkpoint

- [ ] **Step 1: Typecheck and fix stragglers** — Run `npm run typecheck`. Fix every error (these are missed references). Repeat until clean.
- [ ] **Step 2: Lint** — Run `npm run lint:ci`. Fix.
- [ ] **Step 3: Reseed** — temporarily skip if the seed isn't renamed yet; minimally update `prisma/seed.ts` symbol references (`prisma.quote`→`prisma.estimate`, `prisma.estimate`→`prisma.siteMeasure`, etc.) so it runs. Run `npm run seed:dev`. (Full seed rebuild is Task 4.1.)
- [ ] **Step 4: Unit tests** — Run `npm run test`. Fix renamed-test failures (assertions referencing old symbols/strings).
- [ ] **Step 5: E2E** — Run `npx playwright test`. Fix selectors/labels that asserted "Quote"/"Estimate" wording. (Spec wording: customer-facing word is now "Estimate".)
- [ ] **Step 6: Build** — Run `npm run build`. Expected: success.
- [ ] **Step 7: Commit**
  ```bash
  git add -A
  git commit -m "refactor: rename Quote->Estimate, Estimate->SiteMeasure (no behavior change)"
  ```

---

# Phase 2 — Location Entity

Introduce `Location` between `Customer` and `SiteMeasure`; SiteMeasure points at a Location (not Customer); drop `Customer.address`.

## Task 2.1: Schema — add Location, repoint SiteMeasure, drop Customer.address

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Add the Location model and rewire**

```prisma
model Location {
  id         Int          @id @default(autoincrement())
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  customerId Int
  customer   Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  address    String
  label      String?
  notes      String?
  createdAt  DateTime     @default(now())

  siteMeasures SiteMeasure[]

  @@index([orgId])
  @@index([customerId])
}
```
  - On `Customer`: remove the `address` field; add `locations Location[]`; keep `siteMeasures SiteMeasure[]`? **Remove** the direct `Customer.siteMeasures` relation (site measures reach the customer via Location). Keep `events Event[]`.
  - On `SiteMeasure`: replace `customerId Int` / `customer Customer @relation(...)` with `locationId Int` / `location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)`.
  - On `Organization`: add `locations Location[]`.

- [ ] **Step 2: Migrate**

Run: `dotenv -e .env -- npx prisma migrate dev --name add_location_entity`
Expected: applies with data-loss warning (accept), client regenerated.

## Task 2.2: locationRepo + SiteMeasure-via-Location queries

**Files:**
- Create: `lib/repositories/locationRepo.ts`, `__tests__/repositories/locationRepo.test.ts`
- Modify: `lib/repositories/siteMeasureRepo.ts`, `lib/repositories/customerRepo.ts`, `lib/repositories/index.ts`

- [ ] **Step 1: Write the failing test** (`__tests__/repositories/locationRepo.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLocation, listLocationsForCustomer } from "@/lib/repositories/locationRepo";

describe("locationRepo", () => {
  let orgId: string;
  let customerId: number;

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "L Co", slug: `loc-${Date.now()}` } });
    orgId = org.id;
    const c = await prisma.customer.create({ data: { orgId, name: "Pat" } });
    customerId = c.id;
  });
  afterAll(async () => { await prisma.organization.delete({ where: { id: orgId } }); });

  it("creates multiple locations for one customer", async () => {
    await createLocation({ orgId, customerId, address: "12 Oak St", label: "Rental" });
    await createLocation({ orgId, customerId, address: "9 Elm Ave" });
    const locs = await listLocationsForCustomer(orgId, customerId);
    expect(locs.map((l) => l.address).sort()).toEqual(["12 Oak St", "9 Elm Ave"]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`createLocation` not exported)

Run: `npm run test -- locationRepo`
Expected: FAIL (module/export missing)

- [ ] **Step 3: Implement** (`lib/repositories/locationRepo.ts`)

```ts
import { prisma } from "@/lib/prisma";

export interface CreateLocationInput {
  orgId: string;
  customerId: number;
  address: string;
  label?: string | null;
  notes?: string | null;
}

export function createLocation(input: CreateLocationInput) {
  return prisma.location.create({ data: { ...input } });
}

export function listLocationsForCustomer(orgId: string, customerId: number) {
  return prisma.location.findMany({
    where: { orgId, customerId },
    orderBy: { createdAt: "asc" },
  });
}

export function getLocation(orgId: string, id: number) {
  return prisma.location.findFirst({ where: { orgId, id } });
}
```
Add `export * from "./locationRepo";` to `lib/repositories/index.ts`.

- [ ] **Step 4: Run test — expect PASS** — `npm run test -- locationRepo`

- [ ] **Step 5: Update SiteMeasure/customer queries to traverse Location**

In `lib/repositories/siteMeasureRepo.ts`: anywhere a site measure was created/filtered by `customerId`, change to `locationId`. Any include of `customer` becomes `location: { include: { customer: true } }`. Update callers' read paths from `siteMeasure.customer` to `siteMeasure.location.customer`. In `customerRepo.ts`, replace reads of `customer.address` (now gone) and include `locations` where the customer detail needs addresses. Run `npm run typecheck` and fix all `customer`/`address` access errors.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: add Location entity between Customer and SiteMeasure"`

## Task 2.3: Location in API + UI

**Files:**
- Create: `app/api/locations/route.ts` (+ `[id]/route.ts` if delete/edit needed), Location picker in the site-measure create flow.
- Modify: `components/customers/CustomerDetail.tsx` (list locations instead of single address), the SiteMeasure create path (choose/create a Location), `app/api/site-measures/route.ts` (accept `locationId`).

- [ ] **Step 1: Failing API test** (`__tests__/api/locations.test.ts`) — POST creates a location for a customer in the caller's org; GET lists them; cross-org access 404s. Mirror the structure of the existing `__tests__/api/estimates.test.ts` (same auth/session harness).
- [ ] **Step 2: Run — expect FAIL.** `npm run test -- locations`
- [ ] **Step 3: Implement** `app/api/locations/route.ts` using `publicRoute`/`apiRoute` wrapper (copy the pattern from `app/api/site-measures/route.ts`), a Zod schema `{ customerId, address, label?, notes? }`, calling `createLocation`/`listLocationsForCustomer`. Enforce org scoping via the session helper used by sibling routes.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: UI** — In `CustomerDetail.tsx`, replace the single address line with a Locations list (address + optional label + notes) and an "Add location" control hitting `POST /api/locations`. In the SiteMeasure builder/create flow, require selecting (or quick-adding) a Location; send `locationId` to `POST /api/site-measures`.
- [ ] **Step 6: E2E** — add `tests/e2e/locations.spec.ts`: a customer with two locations; create a site measure under a chosen location; assert it appears under that location.
- [ ] **Step 7: Phase 2 green checkpoint** (typecheck, lint, test, seed:dev [seed still has no locations yet — temporarily attach via a default location so it runs; full rebuild in 4.1], playwright, build). **Commit.**

---

# Phase 3 — One-Click Approval (replace signatures)

Convert `EstimateSignature` → `EstimateApproval` (gutted), drop the drawn-signature UI, rename the public route, change status `accepted`→`approved`, drop snapshot hashing, and source the snapshot address from Location.

## Task 3.1: Schema — EstimateApproval + status/column renames

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Replace the model**

```prisma
model EstimateApproval {
  id         Int      @id @default(autoincrement())
  estimateId Int      @unique
  estimate   Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  approvedAt DateTime @default(now())
  ip         String
  userAgent  String
  snapshot   Json
}
```
  - Remove the old `EstimateSignature` model (the faithful Phase-1 rename of QuoteSignature): drop `signatureData`, `signedByName`, `signedByEmail`, `signedIp`, `signedUserAgent`, `consentText`, `quoteSnapshot`, `snapshotHash`, `signedAt`.
  - On `Estimate`: rename relation `signature EstimateSignature?` → `approval EstimateApproval?`; rename column `acceptedAt` → `approvedAt`. (Keep `declinedAt`, `declineReason`.)
  - Comment on `Estimate.status`: `draft | sent | viewed | approved | declined`.

- [ ] **Step 2: Migrate** — `dotenv -e .env -- npx prisma migrate dev --name estimate_approval` (accept data-loss).

## Task 3.2: estimateApprovalRepo (approveEstimateByToken)

**Files:**
- Rewrite: `lib/repositories/estimateSignatureRepo.ts` → `lib/repositories/estimateApprovalRepo.ts`
- Rewrite test: `__tests__/repositories/quoteSignatureRepo.test.ts` (already renamed in 1.4 to `estimateSignatureRepo.test.ts`) → `estimateApprovalRepo.test.ts`
- Modify: `lib/repositories/index.ts`, `__tests__/repositories/acceptQuoteByToken-siblings.test.ts` → `approveEstimateByToken-siblings.test.ts`

- [ ] **Step 1: Write the failing test** (`__tests__/repositories/estimateApprovalRepo.test.ts`)

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { approveEstimateByToken } from "@/lib/repositories/estimateApprovalRepo";

// builds org→customer→location→siteMeasure→estimate (status "sent"); returns ids
async function makeSentEstimate() {
  const org = await prisma.organization.create({
    data: { name: "Approve Co", slug: `appr-${Date.now()}-${Math.round(performance.now())}` },
  });
  const customer = await prisma.customer.create({ data: { orgId: org.id, name: "Pat" } });
  const location = await prisma.location.create({
    data: { orgId: org.id, customerId: customer.id, address: "12 Oak St" },
  });
  const siteMeasure = await prisma.siteMeasure.create({
    data: { orgId: org.id, locationId: location.id, siteMeasureNumber: 1, title: "Kitchen" },
  });
  const estimate = await prisma.estimate.create({
    data: {
      orgId: org.id, siteMeasureId: siteMeasure.id, estimateNumber: 1,
      status: "sent", approvalToken: `tok-${Date.now()}-${Math.round(performance.now())}`,
    },
  });
  return { orgId: org.id, siteMeasureId: siteMeasure.id, estimateId: estimate.id };
}

describe("approveEstimateByToken", () => {
  it("sets status=approved, writes EstimateApproval (no signature), logs event", async () => {
    const { estimateId } = await makeSentEstimate();
    const res = await approveEstimateByToken({
      estimateId, ip: "1.2.3.4", userAgent: "jest", snapshot: { totals: { total: 100 } },
    });
    expect(res).toBe("ok");
    const e = await prisma.estimate.findUnique({ where: { id: estimateId }, include: { approval: true, estimateEvents: true } });
    expect(e?.status).toBe("approved");
    expect(e?.approvedAt).toBeTruthy();
    expect(e?.approval?.ip).toBe("1.2.3.4");
    expect(e?.approval).not.toHaveProperty("signatureData");
    expect(e?.estimateEvents.some((ev) => ev.type === "approved")).toBe(true);
  });

  it("supersedes open sibling estimates under the same site measure", async () => {
    /* create two sent estimates on one siteMeasure; approve one; assert the other
       becomes declined with a 'Superseded' reason and a system_supersede event */
  });

  it("is idempotent / rejects a second approval", async () => {
    const { estimateId } = await makeSentEstimate();
    await approveEstimateByToken({ estimateId, ip: "1", userAgent: "j", snapshot: {} });
    expect(await approveEstimateByToken({ estimateId, ip: "1", userAgent: "j", snapshot: {} })).toBe("already_approved");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm run test -- estimateApprovalRepo`

- [ ] **Step 3: Implement** (`lib/repositories/estimateApprovalRepo.ts`) — adapt the old `acceptQuoteByToken`, dropping signature fields and the hash, keeping the sibling-supersede sweep:

```ts
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface ApproveEstimateInput {
  estimateId: number;
  ip: string;
  userAgent: string;
  snapshot: Prisma.InputJsonValue;
}

export type ApproveEstimateResult = "ok" | "already_approved" | "declined" | "not_found";

export async function approveEstimateByToken(input: ApproveEstimateInput): Promise<ApproveEstimateResult> {
  return prisma.$transaction(async (tx) => {
    const e = await tx.estimate.findFirst({
      where: { id: input.estimateId },
      select: { id: true, status: true, siteMeasureId: true, estimateNumber: true },
    });
    if (!e) return "not_found" as const;
    if (e.status === "approved") return "already_approved" as const;
    if (e.status === "declined") return "declined" as const;

    try {
      await tx.estimateApproval.create({
        data: { estimateId: input.estimateId, ip: input.ip, userAgent: input.userAgent, snapshot: input.snapshot },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique")) return "already_approved" as const;
      throw err;
    }

    await tx.estimate.updateMany({
      where: { id: input.estimateId, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "approved", approvedAt: new Date() },
    });

    await tx.estimateEvent.create({
      data: { estimateId: input.estimateId, type: "approved", source: "customer", ip: input.ip, userAgent: input.userAgent },
    });

    const openSiblings = await tx.estimate.findMany({
      where: { siteMeasureId: e.siteMeasureId, id: { not: e.id }, status: { in: ["draft", "sent", "viewed"] } },
      select: { id: true },
    });
    const declineReason = `Superseded — customer approved Estimate #${e.estimateNumber}`;
    await tx.estimate.updateMany({
      where: { siteMeasureId: e.siteMeasureId, id: { not: e.id }, status: { in: ["draft", "sent", "viewed"] } },
      data: { status: "declined", declinedAt: new Date(), declineReason },
    });
    if (openSiblings.length > 0) {
      await tx.estimateEvent.createMany({
        data: openSiblings.map((s) => ({
          estimateId: s.id, type: "declined", source: "system_supersede",
          metadata: { supersededByEstimateId: e.id, supersededByEstimateNumber: e.estimateNumber },
        })),
      });
    }
    return "ok" as const;
  });
}

export function getEstimateApproval(estimateId: number) {
  return prisma.estimateApproval.findUnique({ where: { estimateId } });
}
```
Update `lib/repositories/index.ts` export to `./estimateApprovalRepo`.

- [ ] **Step 4: Run — expect PASS.** `npm run test -- estimateApprovalRepo`
- [ ] **Step 5: Migrate the siblings test** into `approveEstimateByToken-siblings.test.ts` (rename, retarget to `approveEstimateByToken`, drop signature inputs). Run it green.
- [ ] **Step 6: Commit** — `git commit -am "feat: one-click estimate approval repo (no signature)"`

## Task 3.3: Snapshot without hash, address from Location

**Files:** Modify `lib/estimateView/snapshot.ts`, `__tests__/lib/estimateView/snapshot.test.ts`

- [ ] **Step 1: Update the snapshot test** — delete assertions on `snapshotHash`/`canonicalize`; assert `snapshotEstimate(...)` returns the right `EstimateView` totals and that the customer block's `address` comes from the passed location.
- [ ] **Step 2: Run — expect FAIL.** `npm run test -- snapshot`
- [ ] **Step 3: Implement** — In `snapshot.ts`: delete `import { createHash }`, the `sha256`, and `canonicalize` exports. Change `EstimateSnapshotMeta.customer` so `address` is sourced from the approved estimate's `siteMeasure.location.address` rather than `customer.address`. Keep `snapshotEstimate(view, meta)` returning the plain object.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit.**

## Task 3.4: Public route rename + approve/decline endpoints + UI

**Files:**
- Move: `app/q/[token]/` → `app/estimate-review/[token]/`; `app/api/q/[token]/accept/` → `app/api/estimate-review/[token]/approve/`; `app/api/q/[token]/decline/` → `app/api/estimate-review/[token]/decline/`
- Rewrite: `app/api/estimate-review/[token]/approve/route.ts`
- Modify: `app/estimate-review/[token]/page.tsx`, `lib/estimates/schema.ts` (was `lib/quotes/schema.ts`), the public-estimate components
- Delete: `components/estimates/public-estimate/SignaturePad.tsx`, `PublicEstimateSignedView.tsx`, `app/(app)/estimates/[id]/signed/page.tsx`

- [ ] **Step 1: Rewrite the approve route** (`app/api/estimate-review/[token]/approve/route.ts`)

```ts
import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { estimateTokenParams } from "@/lib/estimates/schema";
import { fromPrismaEstimate } from "@/lib/estimateView";
import { snapshotEstimate } from "@/lib/estimateView/snapshot";
import { approveEstimateByToken, getEstimateByToken } from "@/lib/repositories";

export const POST = publicRoute({}, async ({ req, params }) => {
  const { token } = estimateTokenParams.parse(params);
  const estimate = await getEstimateByToken(token);
  if (!estimate) throw new NotFoundError();
  if (estimate.status === "approved" || estimate.status === "declined") {
    throw new ConflictError(`Estimate already ${estimate.status}`);
  }

  const snap = snapshotEstimate(fromPrismaEstimate(estimate), {
    estimateNumber: estimate.estimateNumber,
    date: estimate.date,
    customer: estimate.siteMeasure.location.customer
      ? {
          name: estimate.siteMeasure.location.customer.name,
          address: estimate.siteMeasure.location.address,
          email: estimate.siteMeasure.location.customer.email,
          phone: estimate.siteMeasure.location.customer.phone,
        }
      : null,
    org: estimate.org,
  });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const result = await approveEstimateByToken({ estimateId: estimate.id, ip, userAgent, snapshot: snap as never });
  if (result === "not_found") throw new NotFoundError();
  if (result === "already_approved" || result === "declined") {
    throw new ConflictError(`Estimate already ${result === "already_approved" ? "approved" : "declined"}`);
  }
  return { ok: true };
});
```
  - Update `getEstimateByToken` (in `estimateRepo.ts`) to include `siteMeasure: { include: { location: { include: { customer: true } } } }` so the snapshot can read the location address.
  - Remove `quoteAcceptSchema`/`MAX_SIG_BYTES`/signature validation from `lib/estimates/schema.ts`; keep `estimateTokenParams` and `estimateDeclineSchema`.

- [ ] **Step 2: Update the decline route** (`app/api/estimate-review/[token]/decline/route.ts`) — only symbol/route renames; status guard `approved|declined`. Already mostly handled by Phase 1; verify.

- [ ] **Step 3: Public page UI** (`app/estimate-review/[token]/page.tsx` + `public-estimate/`) — remove `SignaturePad` and the signed-view; the accept block becomes a single primary button **"Approve & get on the schedule"** that POSTs to `/api/estimate-review/[token]/approve` with no body, plus the existing **Decline** (optional reason). Update status-bar copy: "Approved" / "Declined".

- [ ] **Step 4: Delete** `SignaturePad.tsx`, `PublicEstimateSignedView.tsx`, and `app/(app)/estimates/[id]/signed/page.tsx`; remove their imports/links (the in-app "signed" link/banner). Run `npm run typecheck`; fix dangling references.

- [ ] **Step 5: Update error class** — `EstimateLockedError` param type `"approved" | "declined"`; message wording "Estimate is locked". Grep for the literal `"accepted"` status across the codebase and change to `"approved"`; `acceptedAt` → `approvedAt`; `quoteStatusTone`/`estimateStatusTone` `case "accepted"` → `case "approved"` with label "Approved".

- [ ] **Step 6: Rewrite e2e** — `tests/e2e/estimate-approve-decline.spec.ts` (was `quote-accept-decline`): open `/estimate-review/<token>`, click Approve (no signature pad present), assert status→Approved; separately, Decline with reason. Update `public-quote.spec.ts`→`public-estimate-review.spec.ts`, `quote-sibling-decline.spec.ts`→`estimate-sibling-decline.spec.ts` to the approve flow. Remove any signature-pad interactions.

- [ ] **Step 7: Phase 3 green checkpoint** (typecheck, lint, test, seed:dev, playwright, build). **Commit** `feat: one-click approval public flow; drop signatures`.

---

# Phase 4 — Seed, Glossary, Squash, Final Gates

## Task 4.1: Rebuild seed

**Files:** Modify `prisma/seed.ts`, `tests/e2e/fixtures/seed.ts`

- [ ] **Step 1:** Update the demo-reset block — cascades now clean `LineItem`/`EstimateApproval`/`EstimateEvent`/`SiteMeasureItem`/`Location`. Delete `Location` explicitly before `Customer` if not relying on cascade. Update the comment.
- [ ] **Step 2:** For each demo customer, create one or more `Location` rows (use the address strings that were previously on the customer). Create each `SiteMeasure` under a `locationId` (not `customerId`). Ensure at least: **a customer with two locations**, **a location with two site measures**.
- [ ] **Step 3:** For estimates (was quotes): seed statuses `draft`, `sent`, `viewed`, plus **one `approved`** — create the `EstimateApproval` row (`ip`, `userAgent`, `snapshot` via `snapshotEstimate(fromPrismaEstimate(...))`) and set `approvedAt`; **one `declined`**; and **one revision chain** (`revisedFromId`). Schedule an `Event` against a **non-approved** estimate to demonstrate decoupling.
- [ ] **Step 4:** Remove all `signatureData`/`consentText`/`snapshotHash` seed data and any `customer.address` writes (column gone). Update `nextEstimateNumber`/`nextSiteMeasureNumber` usage.
- [ ] **Step 5:** Run `npm run seed:dev` — expect success and the demo data described above. Update `tests/e2e/fixtures/seed.ts` similarly so e2e fixtures build locations/site-measures/estimates.
- [ ] **Step 6:** Commit `feat(seed): rebuild for location/site-measure/estimate model`.

## Task 4.2: Glossary + error-code docs

**Files:** Modify `CONTEXT.md`

- [ ] Rename the "Quote View" section → "Estimate View" (`computeEstimateView`, `lib/estimateView/`, `fromPrismaEstimate`). Remove the **Snapshot/`snapshotHash`/`QuoteSignature`** tamper-evidence paragraph; replace with a short "Estimate Approval" note (one-click, lightweight snapshot, no hash). Add **Location** and **Site Measure** glossary entries and the `Customer → Location → SiteMeasure → Estimate` hierarchy. Update domain error codes: `QUOTE_LOCKED`→`ESTIMATE_LOCKED`, `QUOTE_HAS_EVENTS`→`ESTIMATE_HAS_EVENTS`. Commit.

## Task 4.3: Squash migrations + final verification

**Files:** `prisma/migrations/`

- [ ] **Step 1: Squash to a single baseline.** Delete the entire `prisma/migrations/` directory (keep `migration_lock.toml`). Then: `dotenv -e .env -- npx prisma migrate reset --force` (drops + recreates the dev DB empty), then `dotenv -e .env -- npx prisma migrate dev --name init` to generate one clean baseline migration from the final schema. Confirm the baseline applies cleanly.
- [ ] **Step 2: Reseed** — `npm run seed:dev`. Expect success.
- [ ] **Step 3: Full gate run** — all must pass:
  ```bash
  npm run typecheck
  npm run lint:ci
  npm run test
  npx playwright test
  npm run build
  ```
- [ ] **Step 4: Final commit** — `git add -A && git commit -m "chore: squash migrations to baseline for remodel"`.

---

## Self-Review Notes (coverage check)

- Spec "Domain Model" → Phase 1 (renames) + Phase 2 (Location, SiteMeasure.locationId, drop Customer.address) + Task 3.1 (EstimateApproval, drop QuoteSignature).
- Spec "Lifecycle & Approval" → Task 3.2 (approve repo, supersede), Task 3.4 (public one-click UI, decline, lock, and Step 5 status `accepted`→`approved` + `acceptedAt`→`approvedAt`).
- Spec "Rename Map" (models, routes, modules, error codes, deletions) → Phase 1 Tasks 1.1/1.3/1.4 + Task 3.4 deletions.
- Spec "Migration & Seed" → Task 2.1/3.1 migrations, Task 4.1 seed, Task 4.3 squash.
- Spec "Testing & Verification" → renamed tests in 1.3/1.4, new coverage in 2.2/2.3/3.2/3.3/3.4, gates each phase + 4.3.
- Spec "Out of Scope" (Stripe, admin-notify) → not implemented; `Customer.address` dropped not repurposed (Task 2.1).
