# Organization Onboarding — Phase 1: Shared Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the schema additions and a single transactional `createOrganization` service that every future onboarding path (manual admin, e2e test, Stripe signup) will call. Refactor the seed script to use it. Zero user-visible change.

**Architecture:** A new module `lib/onboarding/` owns tenant creation. `createOrganization(args)` runs in one Prisma transaction: creates the Organization row, creates the admin User (bcrypt-hashed password), seeds default line-item templates, and sets billing fields based on a discriminated `args.billing` union (`manual` | `stripe`). A separate `defaultOrgContent.ts` exports the 6 templates currently inlined in `prisma/seed.ts` so the seed and the service stay aligned. The schema migration adds five nullable Organization columns; existing rows default to `subscriptionStatus = "manual"`. The seed script is rewritten to call `createOrganization` for its demo orgs.

**Tech Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL, bcryptjs, Zod, Vitest. Repo conventions: `apiRoute` wrapper in `lib/api/route.ts`; typed errors in `lib/api/errors.ts`; vitest in `__tests__/`; biome for lint (`biome ci .` must pass).

**Spec:** [docs/superpowers/specs/2026-05-25-organization-onboarding-design.md](../specs/2026-05-25-organization-onboarding-design.md)

## Files

**Create:**
- `prisma/migrations/20260525000000_org_billing_fields/migration.sql` — adds the five Organization columns
- `lib/onboarding/defaultOrgContent.ts` — exported constant for the 6 default line-item templates
- `lib/onboarding/createOrganization.ts` — the shared transactional service
- `lib/onboarding/errors.ts` — `SlugExhaustedError`, `OnboardingError` (re-uses `EmailTakenError` from `lib/api/errors.ts`)
- `lib/onboarding/slug.ts` — `kebabSlug(name)` pure helper (testable in isolation)
- `__tests__/lib/onboarding/slug.test.ts`
- `__tests__/lib/onboarding/createOrganization.test.ts`

**Modify:**
- `prisma/schema.prisma` — add the five Organization fields
- `prisma/seed.ts` — use `createOrganization` for both demo orgs; pull templates from `defaultOrgContent.ts`

---

## Task 1: Add the schema fields

**Files:**
- Modify: `prisma/schema.prisma:15-44` (Organization model)
- Create: `prisma/migrations/20260525000000_org_billing_fields/migration.sql`

- [ ] **Step 1: Add fields to the Prisma schema**

Open `prisma/schema.prisma`. Inside the `Organization` model, immediately after the `createdAt DateTime @default(now())` line (currently line 35), insert the new billing fields. The resulting model should look like (showing only the new lines + their surroundings):

```prisma
model Organization {
  // ... existing fields above ...
  createdAt          DateTime @default(now())

  // ── BILLING (added 2026-05-25) ────────────────────────────────────────────
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?   @unique
  subscriptionStatus   String    @default("manual")
  // manual | trialing | active | past_due | unpaid | canceled
  trialEndsAt          DateTime?
  currentPeriodEndsAt  DateTime?

  users             User[]
  // ... existing relations below ...
}
```

Keep every existing field exactly as it is. Add only the five new fields and the comment lines.

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260525000000_org_billing_fields/migration.sql`:

```sql
-- AlterTable: Organization — billing fields for Stripe integration
-- Existing rows default to subscriptionStatus = 'manual' so demo and seeded
-- orgs become manual orgs automatically.
ALTER TABLE "Organization" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Organization" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "currentPeriodEndsAt" TIMESTAMP(3);

-- Unique constraints on Stripe ids (used for webhook idempotency)
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`

Expected: prints "Generated Prisma Client" to stdout. No errors.

If this fails, the schema is malformed — re-check Step 1.

- [ ] **Step 4: Apply the migration locally**

Run: `npm run migrate:dev`

Expected: prints "Applying migration `20260525000000_org_billing_fields`" and "All migrations have been successfully applied." If you're on a fresh branch and there's no dev DB, you may need to `dotenv -e .env.dev.local -- prisma migrate dev` first; the project usually expects an existing Neon dev branch.

- [ ] **Step 5: Verify with biome and typecheck**

Run: `npm run typecheck && npm run lint:ci`

Expected: both pass with zero errors. If typecheck complains about Organization fields, the Prisma client did not regenerate — re-run Step 3.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260525000000_org_billing_fields
git commit -m "feat(db): add org billing fields (Stripe + subscriptionStatus)"
```

---

## Task 2: Slug helper

**Files:**
- Create: `lib/onboarding/slug.ts`
- Create: `__tests__/lib/onboarding/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/onboarding/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { kebabSlug } from "@/lib/onboarding/slug";

describe("kebabSlug", () => {
  it("lowercases and dashes spaces", () => {
    expect(kebabSlug("Johnson Flooring Co.")).toBe("johnson-flooring-co");
  });

  it("collapses multiple spaces and punctuation", () => {
    expect(kebabSlug("  ABC   Inc., LLC  ")).toBe("abc-inc-llc");
  });

  it("strips non-ASCII", () => {
    expect(kebabSlug("Café & Floors")).toBe("caf-floors");
  });

  it("returns a fallback for all-non-ASCII input", () => {
    expect(kebabSlug("漢字")).toBe("org");
  });

  it("truncates to 60 chars max", () => {
    const long = "A".repeat(200);
    expect(kebabSlug(long).length).toBeLessThanOrEqual(60);
  });

  it("trims leading and trailing dashes", () => {
    expect(kebabSlug("-Foo-Bar-")).toBe("foo-bar");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/onboarding/slug.test.ts`

Expected: FAIL with "Cannot find module '@/lib/onboarding/slug'" or similar.

- [ ] **Step 3: Implement the helper**

Create `lib/onboarding/slug.ts`:

```ts
/**
 * Convert an org display name to a URL-safe kebab-case slug.
 *
 * Rules:
 *  - lowercase
 *  - non-alphanumeric ASCII becomes a dash
 *  - multiple dashes collapse to one
 *  - leading/trailing dashes stripped
 *  - max 60 chars
 *  - empty result falls back to "org"
 */
export function kebabSlug(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const trimmed = ascii.replace(/^-+|-+$/g, "");
  const truncated = trimmed.slice(0, 60).replace(/-+$/g, "");
  return truncated.length > 0 ? truncated : "org";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/onboarding/slug.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint:ci
git add lib/onboarding/slug.ts __tests__/lib/onboarding/slug.test.ts
git commit -m "feat(onboarding): add kebabSlug helper"
```

---

## Task 3: Onboarding-specific errors

**Files:**
- Create: `lib/onboarding/errors.ts`

- [ ] **Step 1: Implement the error classes**

Create `lib/onboarding/errors.ts`:

```ts
/**
 * Errors raised by lib/onboarding/createOrganization. The service composes
 * `EmailTakenError` (re-used from lib/api/errors) plus the two new ones
 * defined here.
 */
import { ApiError } from "@/lib/api/errors";

export class SlugExhaustedError extends ApiError {
  constructor(baseSlug: string) {
    super({
      code: "SLUG_EXHAUSTED",
      status: 500,
      message: `Could not find an available slug derived from "${baseSlug}" within 20 attempts`,
    });
  }
}

export class OnboardingError extends ApiError {
  constructor(message: string) {
    super({ code: "ONBOARDING_FAILED", status: 500, message });
  }
}
```

There is no separate test for this file — these classes are exercised through `createOrganization.test.ts` in the next task.

- [ ] **Step 2: Lint and commit**

```bash
npm run lint:ci
git add lib/onboarding/errors.ts
git commit -m "feat(onboarding): add SlugExhaustedError and OnboardingError"
```

---

## Task 4: Default content helper

**Files:**
- Create: `lib/onboarding/defaultOrgContent.ts`

This is a pure data constant — no test file needed; its content is verified indirectly by Task 5 (which asserts createOrganization seeds them) and by the seed-refactor task at the end.

- [ ] **Step 1: Create the constant**

Create `lib/onboarding/defaultOrgContent.ts`:

```ts
/**
 * Default content that every newly-created Organization receives when
 * `createOrganization` is called with `seed: "minimal"` (the default).
 *
 * Currently: 6 starter line-item templates copied from the historical
 * prisma/seed.ts demo data. Both `createOrganization` and the seed script
 * pull from this constant so they cannot drift.
 */

export type DefaultLineItemTemplate = {
  name: string;
  description: string;
  rate: number;
  unitLabel: string;
  sortOrder: number;
};

export const DEFAULT_LINE_ITEM_TEMPLATES: ReadonlyArray<DefaultLineItemTemplate> =
  [
    {
      name: "LVP — Mohawk RevWood",
      description:
        "Luxury vinyl plank, 5.5mm wear layer. Includes click-lock install over prepped subfloor.",
      rate: 4.85,
      unitLabel: "sqft",
      sortOrder: 0,
    },
    {
      name: "White oak — select grade",
      description:
        '3/4" solid hardwood, select grade. Material only — site-finished separately.',
      rate: 7.2,
      unitLabel: "sqft",
      sortOrder: 1,
    },
    {
      name: "Hardwood install — nail down",
      description: 'Nail-down install over 3/4" plywood subfloor.',
      rate: 3.8,
      unitLabel: "sqft",
      sortOrder: 2,
    },
    {
      name: "Carpet removal & disposal",
      description: "Includes haul-away and dump fees.",
      rate: 1.2,
      unitLabel: "sqft",
      sortOrder: 3,
    },
    {
      name: "Quarter round trim",
      description: "Stain-grade pine quarter round, cut and installed.",
      rate: 2.5,
      unitLabel: "lf",
      sortOrder: 4,
    },
    {
      name: "Floor prep & leveling",
      description: "Self-leveling compound where needed.",
      rate: 0.65,
      unitLabel: "sqft",
      sortOrder: 5,
    },
  ];
```

- [ ] **Step 2: Lint and commit**

```bash
npm run lint:ci
git add lib/onboarding/defaultOrgContent.ts
git commit -m "feat(onboarding): extract default line-item templates constant"
```

---

## Task 5: `createOrganization` service — write the test scaffold + types

**Files:**
- Create: `__tests__/lib/onboarding/createOrganization.test.ts`

This task only sets up the test file with mocks and one minimal failing test. The next tasks add tests and behavior incrementally.

- [ ] **Step 1: Write the initial failing test**

Create `__tests__/lib/onboarding/createOrganization.test.ts`:

```ts
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailTakenError } from "@/lib/api/errors";
import {
  OnboardingError,
  SlugExhaustedError,
} from "@/lib/onboarding/errors";

/**
 * Tests for lib/onboarding/createOrganization.
 *
 * The service runs in a single Prisma transaction. We mock the transaction
 * client to record what the service tries to write, and to simulate
 * collisions and failures. We mock the top-level prisma object too so that
 * any pre-transaction lookups (e.g. slug existence check) can be tracked.
 */

const orgCreate = vi.fn();
const userCreate = vi.fn();
const templateCreateMany = vi.fn();
const orgFindUnique = vi.fn();
const userFindUnique = vi.fn();

// $transaction receives a callback and we invoke it with a fake tx client.
const txClient = {
  organization: {
    create: orgCreate,
    findUnique: orgFindUnique,
  },
  user: {
    create: userCreate,
    findUnique: userFindUnique,
  },
  lineItemTemplate: {
    createMany: templateCreateMany,
  },
};

const $transaction = vi.fn(async (cb: (tx: typeof txClient) => unknown) => {
  return cb(txClient);
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction,
    organization: { findUnique: orgFindUnique },
    user: { findUnique: userFindUnique },
  },
}));

const { createOrganization } = await import(
  "@/lib/onboarding/createOrganization"
);

beforeEach(() => {
  vi.clearAllMocks();
  orgFindUnique.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  orgCreate.mockResolvedValue({ id: "org-new", slug: "acme" });
  userCreate.mockResolvedValue({ id: "user-new" });
  templateCreateMany.mockResolvedValue({ count: 6 });
});

describe("createOrganization (happy path)", () => {
  it("creates org + admin user + templates in a single transaction", async () => {
    const result = await createOrganization({
      org: { name: "Acme Floors" },
      admin: {
        name: "Alex Admin",
        email: "alex@acme.test",
        password: "supersecret1",
      },
      billing: { kind: "manual" },
    });

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(orgCreate).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(templateCreateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      orgId: "org-new",
      adminUserId: "user-new",
      slug: "acme",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: FAIL with "Cannot find module '@/lib/onboarding/createOrganization'".

- [ ] **Step 3: Do NOT commit yet** — `createOrganization` doesn't exist. Move to Task 6.

---

## Task 6: `createOrganization` service — minimal happy path

**Files:**
- Create: `lib/onboarding/createOrganization.ts`

- [ ] **Step 1: Implement the minimal service**

Create `lib/onboarding/createOrganization.ts`:

```ts
/**
 * createOrganization — the single source of truth for tenant creation.
 *
 * Used by:
 *   - prisma/seed.ts (demo orgs)
 *   - app/api/admin/orgs/route.ts (manual super-admin onboarding) — Phase 2
 *   - app/api/test/orgs/route.ts (E2E fixture) — Phase 3
 *   - app/api/stripe/webhook/route.ts (self-serve signup) — Phase 4
 *
 * Runs in one Prisma transaction. Any failure rolls back; partial tenants
 * never persist.
 */
import bcrypt from "bcryptjs";
import { EmailTakenError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LINE_ITEM_TEMPLATES,
  type DefaultLineItemTemplate,
} from "./defaultOrgContent";
import { OnboardingError, SlugExhaustedError } from "./errors";
import { kebabSlug } from "./slug";

const BCRYPT_ROUNDS = 10;
const BCRYPT_HASH_RE = /^\$2[aby]\$/;
const MAX_SLUG_ATTEMPTS = 20;

export type CreateOrganizationArgs = {
  org: { name: string; slug?: string };
  admin: { name: string; email: string; password: string };
  billing:
    | { kind: "manual" }
    | {
        kind: "stripe";
        customerId: string;
        subscriptionId: string;
        status: "trialing" | "active";
        trialEndsAt: Date | null;
        currentPeriodEndsAt: Date;
      };
  seed?: "minimal" | "none";
};

export type CreateOrganizationResult = {
  orgId: string;
  adminUserId: string;
  slug: string;
};

export async function createOrganization(
  args: CreateOrganizationArgs
): Promise<CreateOrganizationResult> {
  const seedKind = args.seed ?? "minimal";
  const passwordHash = await hashIfNeeded(args.admin.password);

  // Pre-flight: email uniqueness check. The User.email column has a unique
  // index so the transaction would also catch this, but we surface a typed
  // error message instead of a Prisma P2002.
  const existingUser = await prisma.user.findUnique({
    where: { email: args.admin.email.toLowerCase() },
    select: { id: true },
  });
  if (existingUser) throw new EmailTakenError();

  const baseSlug = args.org.slug ?? kebabSlug(args.org.name);

  try {
    return await prisma.$transaction(async (tx) => {
      const finalSlug = await resolveSlug(tx, baseSlug);
      const billingFields = billingToFields(args.billing);

      const org = await tx.organization.create({
        data: {
          name: args.org.name,
          slug: finalSlug,
          ...billingFields,
        },
        select: { id: true, slug: true },
      });

      const user = await tx.user.create({
        data: {
          name: args.admin.name,
          email: args.admin.email.toLowerCase(),
          password: passwordHash,
          role: "admin",
          orgId: org.id,
        },
        select: { id: true },
      });

      if (seedKind === "minimal") {
        await tx.lineItemTemplate.createMany({
          data: DEFAULT_LINE_ITEM_TEMPLATES.map(
            (t: DefaultLineItemTemplate) => ({ ...t, orgId: org.id })
          ),
        });
      }

      return { orgId: org.id, adminUserId: user.id, slug: org.slug };
    });
  } catch (err) {
    if (err instanceof EmailTakenError || err instanceof SlugExhaustedError) {
      throw err;
    }
    if (isPrismaUniqueViolation(err, "email")) throw new EmailTakenError();
    throw new OnboardingError(
      err instanceof Error ? err.message : "Failed to create organization"
    );
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function hashIfNeeded(password: string): Promise<string> {
  if (BCRYPT_HASH_RE.test(password)) return password;
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function resolveSlug(tx: TxClient, base: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await tx.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new SlugExhaustedError(base);
}

function billingToFields(billing: CreateOrganizationArgs["billing"]) {
  if (billing.kind === "manual") {
    return {
      subscriptionStatus: "manual" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEndsAt: null,
    };
  }
  return {
    subscriptionStatus: billing.status,
    stripeCustomerId: billing.customerId,
    stripeSubscriptionId: billing.subscriptionId,
    trialEndsAt: billing.trialEndsAt,
    currentPeriodEndsAt: billing.currentPeriodEndsAt,
  };
}

function isPrismaUniqueViolation(err: unknown, fieldHint: string): boolean {
  // Prisma error shape varies between versions; duck-type to catch P2002 on
  // a unique that mentions the field.
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (!target) return false;
  if (Array.isArray(target)) return target.some((t) => t.includes(fieldHint));
  return target.includes(fieldHint);
}
```

- [ ] **Step 2: Run the test from Task 5 to verify it passes**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: the one happy-path test passes.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
npm run typecheck
npm run lint:ci
git add lib/onboarding/createOrganization.ts __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "feat(onboarding): add createOrganization service (happy path)"
```

---

## Task 7: Test — manual vs stripe billing fields

**Files:**
- Modify: `__tests__/lib/onboarding/createOrganization.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/lib/onboarding/createOrganization.test.ts` (inside the file's top scope, after the existing `describe` block):

```ts
describe("createOrganization (billing fields)", () => {
  it("manual billing sets subscriptionStatus='manual' and null Stripe ids", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "a@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "manual",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          trialEndsAt: null,
          currentPeriodEndsAt: null,
        }),
      })
    );
  });

  it("stripe billing populates all Stripe fields verbatim", async () => {
    const trialEnd = new Date("2026-06-08T00:00:00Z");
    const periodEnd = new Date("2026-07-08T00:00:00Z");
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "b@x.test", password: "supersecret1" },
      billing: {
        kind: "stripe",
        customerId: "cus_123",
        subscriptionId: "sub_123",
        status: "trialing",
        trialEndsAt: trialEnd,
        currentPeriodEndsAt: periodEnd,
      },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "trialing",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
          trialEndsAt: trialEnd,
          currentPeriodEndsAt: periodEnd,
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: all tests (the original one + the two new) pass on the first attempt — the implementation from Task 6 already supports this. No code changes needed.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "test(onboarding): cover manual + stripe billing field shapes"
```

---

## Task 8: Test — admin user role and email lowercasing

**Files:**
- Modify: `__tests__/lib/onboarding/createOrganization.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to the test file:

```ts
describe("createOrganization (admin user)", () => {
  it("creates the admin with role='admin' and lowercases the email", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "Mixed.Case@Example.COM", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "admin",
          email: "mixed.case@example.com",
        }),
      })
    );
  });

  it("bcrypts plaintext passwords", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "c@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    const data = userCreate.mock.calls[0]?.[0]?.data as { password: string };
    expect(data.password.startsWith("$2")).toBe(true);
    expect(bcrypt.compareSync("supersecret1", data.password)).toBe(true);
  });

  it("passes already-bcrypted hashes through unchanged", async () => {
    const pre = await bcrypt.hash("anything", 10);
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "d@x.test", password: pre },
      billing: { kind: "manual" },
    });
    const data = userCreate.mock.calls[0]?.[0]?.data as { password: string };
    expect(data.password).toBe(pre);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: all pass. The implementation from Task 6 already lowercases the email and re-uses bcrypt hashes via the `$2[aby]$` prefix check.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "test(onboarding): cover admin role, email casing, password hashing"
```

---

## Task 9: Test — minimal seed templates

**Files:**
- Modify: `__tests__/lib/onboarding/createOrganization.test.ts`

- [ ] **Step 1: Add the failing tests**

Append:

```ts
describe("createOrganization (default content)", () => {
  it("seeds the 6 default line-item templates by default", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "e@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(templateCreateMany).toHaveBeenCalledTimes(1);
    const arg = templateCreateMany.mock.calls[0]?.[0] as {
      data: Array<{ name: string; orgId: string }>;
    };
    expect(arg.data).toHaveLength(6);
    expect(arg.data.every((t) => t.orgId === "org-new")).toBe(true);
    expect(arg.data[0]?.name).toBe("LVP — Mohawk RevWood");
  });

  it("seed: 'none' skips template creation", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "f@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
      seed: "none",
    });
    expect(templateCreateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "test(onboarding): cover default-content seeding modes"
```

---

## Task 10: Test — slug auto-derivation and collision handling

**Files:**
- Modify: `__tests__/lib/onboarding/createOrganization.test.ts`

- [ ] **Step 1: Add the failing tests**

Append:

```ts
describe("createOrganization (slug handling)", () => {
  it("derives slug from name when not provided", async () => {
    await createOrganization({
      org: { name: "Pinecrest Flooring Co." },
      admin: { name: "A", email: "g@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "pinecrest-flooring-co" }),
      })
    );
  });

  it("uses the supplied slug verbatim when present", async () => {
    await createOrganization({
      org: { name: "Pinecrest Flooring Co.", slug: "custom-slug" },
      admin: { name: "A", email: "h@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "custom-slug" }),
      })
    );
  });

  it("appends -2 on first slug collision, -3 on second, etc.", async () => {
    // Pretend "acme" and "acme-2" exist; "acme-3" is free.
    orgFindUnique
      .mockResolvedValueOnce({ id: "exists-1" })
      .mockResolvedValueOnce({ id: "exists-2" })
      .mockResolvedValueOnce(null);

    await createOrganization({
      org: { name: "Acme" },
      admin: { name: "A", email: "i@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "acme-3" }),
      })
    );
  });

  it("throws SlugExhaustedError after 20 attempts", async () => {
    orgFindUnique.mockResolvedValue({ id: "exists" }); // every check finds a collision
    await expect(
      createOrganization({
        org: { name: "Acme" },
        admin: { name: "A", email: "j@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(SlugExhaustedError);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "test(onboarding): cover slug derivation and collision retries"
```

---

## Task 11: Test — email-taken error

**Files:**
- Modify: `__tests__/lib/onboarding/createOrganization.test.ts`

- [ ] **Step 1: Add the failing test**

Append:

```ts
describe("createOrganization (email uniqueness)", () => {
  it("throws EmailTakenError when admin email already exists", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "existing-user" });
    await expect(
      createOrganization({
        org: { name: "Acme Floors" },
        admin: { name: "A", email: "taken@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(EmailTakenError);
    expect($transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "test(onboarding): cover email-taken error path"
```

---

## Task 12: Test — transaction rollback

**Files:**
- Modify: `__tests__/lib/onboarding/createOrganization.test.ts`

- [ ] **Step 1: Add the failing test**

Append:

```ts
describe("createOrganization (rollback)", () => {
  it("wraps unexpected errors in OnboardingError", async () => {
    templateCreateMany.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      createOrganization({
        org: { name: "Acme Floors" },
        admin: { name: "A", email: "k@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(OnboardingError);
  });

  it("rethrows Prisma P2002 on email as EmailTakenError", async () => {
    // Simulate a race: pre-flight check passes, transaction-time write hits
    // the User.email unique index.
    userFindUnique.mockResolvedValueOnce(null);
    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    userCreate.mockRejectedValueOnce(p2002);
    await expect(
      createOrganization({
        org: { name: "Acme Floors" },
        admin: { name: "A", email: "l@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run __tests__/lib/onboarding/createOrganization.test.ts`

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/onboarding/createOrganization.test.ts
git commit -m "test(onboarding): cover transaction-rollback paths"
```

---

## Task 13: Refactor `prisma/seed.ts` to use `createOrganization`

**Files:**
- Modify: `prisma/seed.ts`

This rewires the demo-seed flow so both demo orgs are created through `createOrganization`. All downstream demo content (estimates, quotes, signatures, events) keeps its current shape — only the org + admin user + line-item templates blocks change.

- [ ] **Step 1: Read the current seed to map the changes**

Open `prisma/seed.ts`. Locate:
- The "Organization" block creating `org` via `prisma.organization.upsert` (currently around lines 51–60).
- The "Crew roster" block (4 crew members) — keep as-is.
- The "Line item templates" `prisma.lineItemTemplate.createMany` block (currently around lines 80–134) — this is being replaced by the templates that `createOrganization` seeds.
- The "Demo user" block (currently around lines 137–149) — replaced by `createOrganization`.
- The lead and crew user upserts (currently around lines 151–177) — keep as-is; they are demo-only extra users on the org.
- The "Second org + user" block (currently around lines 180–200) — replaced by a second `createOrganization` call.

- [ ] **Step 2: Replace the first-org and demo-user creation**

Replace the block currently containing the first `prisma.organization.upsert` + the line-item-templates `createMany` + the first `prisma.user.upsert` (which seeds `demo@sqft.dev` as admin) with a single `createOrganization` call. The replacement section:

```ts
import { createOrganization } from "../lib/onboarding/createOrganization";

// ... inside main(), after the demo-wipe block ...

// ── Primary demo org ─────────────────────────────────────────────────────
// Create through the shared onboarding service so seed + production paths
// stay aligned. seed: "minimal" plants the 6 default line-item templates.
const orgResult = await createOrganization({
  org: { name: "Johnson Flooring Co.", slug: "johnson-flooring-demo" },
  admin: {
    name: "Mike Johnson",
    email: "demo@sqft.dev",
    password: "demo1234",
  },
  billing: { kind: "manual" },
  seed: "minimal",
});
const org = await prisma.organization.findUniqueOrThrow({
  where: { id: orgResult.orgId },
});
const user = await prisma.user.findUniqueOrThrow({
  where: { id: orgResult.adminUserId },
});
console.log(`  ✓ Org: ${org.name}`);
console.log(`  ✓ User: ${user.email} / password: demo1234`);
console.log("  ✓ 6 line item templates");
```

The downstream demo data (customers, estimates, quotes) references `org` and `user`, so these `findUniqueOrThrow` calls keep the rest of the seed file working untouched.

- [ ] **Step 3: Keep the lead and crew users; they stay as raw upserts**

The blocks creating `lead@sqft.dev` and `crew@sqft.dev` users (currently around lines 151–177) remain unchanged. They're additional users on the same org for role testing, not the admin.

- [ ] **Step 4: Replace the second-org block**

Replace the `prisma.organization.upsert({ slug: "other-floors-demo" ...})` + `prisma.user.upsert({ email: "demo2@sqft.dev" ...})` block with:

```ts
// ── Second demo org (tenant-isolation tests) ─────────────────────────────
const otherResult = await createOrganization({
  org: { name: "Other Floors Co.", slug: "other-floors-demo" },
  admin: {
    name: "Other Owner",
    email: "demo2@sqft.dev",
    password: "demo1234",
  },
  billing: { kind: "manual" },
  seed: "none", // second demo org doesn't need the template defaults
});
const otherOrg = await prisma.organization.findUniqueOrThrow({
  where: { id: otherResult.orgId },
});
const otherUser = await prisma.user.findUniqueOrThrow({
  where: { id: otherResult.adminUserId },
});
console.log(`  ✓ Org: ${otherOrg.name}`);
console.log(`  ✓ User: ${otherUser.email} / password: demo1234`);
```

- [ ] **Step 5: Handle re-running the seed**

The current seed already wipes demo-org child data before re-running. But the first run after this refactor will hit "email already in use" because `demo@sqft.dev` and `demo2@sqft.dev` are still in the DB from the previous schema. Add a user-wipe step into the existing demo-wipe block. Find this section (currently around lines 26–48):

```ts
const demoOrgSlugs = ["johnson-flooring-demo", "other-floors-demo"];
const demoOrgs = await prisma.organization.findMany({ ... });
if (demoOrgs.length > 0) {
  // ... existing deleteMany calls ...
}
```

Just before the closing brace of the `if (demoOrgs.length > 0)` block, add:

```ts
    // Delete demo users so re-runs of the seed don't collide with the
    // EmailTakenError that createOrganization now raises.
    await prisma.user.deleteMany({ where: { orgId: { in: demoOrgIds } } });
    // Then delete the orgs themselves — cascades clean up any remaining
    // children. createOrganization will recreate them below.
    await prisma.organization.deleteMany({ where: { id: { in: demoOrgIds } } });
```

Also remove the `await prisma.organization.updateMany({ ... nextEstimateNumber: 1, nextQuoteNumber: 1 ... })` line — the orgs are now hard-deleted and recreated, so the counter reset is no longer needed.

- [ ] **Step 6: Restore the explicit counter bump near the end**

The seed currently bumps `nextEstimateNumber` and `nextQuoteNumber` after seeding estimates/quotes (around line 926):

```ts
await prisma.organization.update({
  where: { id: org.id },
  data: { nextEstimateNumber: 1046, nextQuoteNumber: 5007 },
});
```

Keep this line as-is. It still works because the seed creates demo estimates/quotes with explicit ids and needs the next-number counter to start past them.

- [ ] **Step 7: Run the seed to verify it works**

Run: `npm run seed:dev`

Expected output (abbreviated):
```
🌱 Seeding demo data…
  ✓ Cleared prior demo data (... org(s))
  ✓ Org: Johnson Flooring Co.
  ✓ User: demo@sqft.dev / password: demo1234
  ✓ 6 line item templates
  ✓ User: lead@sqft.dev / password: demo1234
  ✓ User: crew@sqft.dev / password: demo1234
  ✓ Org: Other Floors Co.
  ✓ User: demo2@sqft.dev / password: demo1234
  ✓ 6 customers
  ✓ 6 estimates
  ...
✅ Seed complete!
```

If the seed errors with "Email already in use" the demo-wipe step in Step 5 was not applied correctly.

- [ ] **Step 8: Run it again to verify re-runnability**

Run: `npm run seed:dev`

Expected: same output. Idempotent.

- [ ] **Step 9: Verify login still works**

This is a manual check — do NOT skip it because it's the user-facing contract for Phase 1.

Run: `npm run dev` (background terminal).

In a browser, go to `http://localhost:3000/login`, sign in as `demo@sqft.dev` / `demo1234`, confirm the dashboard loads.

Stop the dev server.

- [ ] **Step 10: Commit**

```bash
npm run lint:ci
npm run typecheck
git add prisma/seed.ts
git commit -m "refactor(seed): create demo orgs via createOrganization service"
```

---

## Task 14: Full test sweep

**Files:** none — verification only.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`

Expected: every test passes. Pay specific attention to tests that depend on demo data (`__tests__/api/*`, `__tests__/repositories/*`) — they should still pass because the seed data shape is unchanged.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`

Expected: every spec passes. This is the strongest guarantee that the seed refactor preserved demo-org shape.

If a spec fails: do NOT dismiss as a flake — the seed refactor likely changed something downstream. Read the failing spec and the seed diff. Fix forward.

- [ ] **Step 3: Lint**

Run: `npm run lint:ci`

Expected: zero errors.

- [ ] **Step 4: Final commit (if any fixes were needed)**

If Steps 1–3 surfaced any issues, fix them and commit in a focused commit:

```bash
git add <files>
git commit -m "fix(onboarding): <what you fixed>"
```

If everything was already green, no commit needed here.

---

## Spec Coverage Check

This plan implements the following sections from [the spec](../specs/2026-05-25-organization-onboarding-design.md):

| Spec section | Plan task |
| --- | --- |
| Schema additions (5 Org fields, Phase 1) | Task 1 |
| `lib/onboarding/createOrganization.ts` | Tasks 5–12 |
| `lib/onboarding/defaultOrgContent.ts` | Task 4 |
| `prisma/seed.ts` refactor | Task 13 |
| Phase 1 acceptance: tests green, lint clean, demo login works | Task 14 + Task 13 Step 9 |

Out of scope (later phases): `PendingSignup` model, `lib/auth/superAdmin.ts`, `lib/api/billingGuard.ts`, admin UI routes, test-API routes, Stripe integration. These will get their own plans.

---

## Acceptance Criteria

When this plan is fully executed:

1. `prisma/schema.prisma` has five new nullable billing fields on `Organization`. Migration `20260525000000_org_billing_fields` is applied locally.
2. `lib/onboarding/createOrganization.ts` exists with the documented signature, runs in one Prisma transaction, and is fully covered by Vitest.
3. `prisma/seed.ts` creates both demo orgs (and their admin users + line-item templates) by calling `createOrganization`. The seed is re-runnable.
4. `demo@sqft.dev` / `demo1234` and `demo2@sqft.dev` / `demo1234` still log in successfully.
5. `npm test` and `npm run test:e2e` both pass.
6. `biome ci .` produces zero errors.

Phase 1 is then complete. Phase 2's plan (manual admin UI) can be written and executed on top of this foundation.
