# Workspace Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/settings/workspace` page from the spec at [docs/superpowers/specs/2026-05-23-workspace-settings-design.md](docs/superpowers/specs/2026-05-23-workspace-settings-design.md): admin-only form for Identity + Brand + Estimating Defaults, with a sticky save bar, scoped brand-color live preview, and org defaults that flow into new quotes.

**Architecture:** One Postgres migration adds 9 fields to `Organization`, 2 fields to `Quote`, and renames role values on `User`. One client component (`WorkspaceSettingsView`) holds the full form in a single state object with diff-based dirty tracking, dispatches a `PATCH /api/org` via react-query, and feeds child sections that include a scoped-CSS-var live preview. New `adminRoute` wrapper in `lib/api/route.ts` gates the PATCH on `user.role === "admin"`. `createQuote` reads the new org defaults at creation time (copy-not-reference).

**Tech Stack:** Next.js App Router (this version has breaking changes from training data — read `node_modules/next/dist/docs/` before guessing), Prisma 7, TypeScript, Zod 4, react-query 5, Vitest, Biome 2.

---

## File Structure

**Modify**
- `prisma/schema.prisma` — Organization, Quote, User
- `prisma/seed.ts` — role values
- `lib/api/route.ts` — add `adminRoute` wrapper
- `lib/repositories/quoteRepo.ts` — read org defaults in `createQuote`; rename `role: "owner"` literals
- `app/api/org/route.ts` — extend GET, add PATCH
- `app/api/q/[token]/accept/route.ts` — rename `role: "owner"` literal
- `app/api/q/[token]/decline/route.ts` — rename `role: "owner"` literal
- `app/(app)/settings/page.tsx` — add Workspace link
- `lib/hooks/useOrg.ts` — extend `Org` type with new fields

**Create — migration**
- `prisma/migrations/20260523000000_workspace_settings/migration.sql`

**Create — page**
- `app/(app)/settings/workspace/page.tsx`

**Create — components (all under `components/settings/workspace/`)**
- `types.ts` — `WorkspaceSettingsForm` shape + `Initial` server payload type
- `WorkspaceSettingsView.tsx` — client root, state, dirty, save mutation
- `Masthead.tsx` — title block
- `Toc.tsx` — sticky TOC with scroll-spy
- `SaveBar.tsx` — sticky save bar
- `IdentitySection.tsx`
- `BrandSection.tsx`
- `BrandPreview.tsx`
- `DefaultsSection.tsx`

**Create — hook**
- `lib/hooks/useUpdateWorkspaceSettings.ts`

**Create — tests**
- `__tests__/lib/api/adminRoute.test.ts`
- `__tests__/api/org.test.ts`

**Extend tests**
- `__tests__/repositories/quoteRepo.test.ts` — assert org defaults flow into new quotes

---

## Task 1: Schema migration — Organization, Quote, User role values

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260523000000_workspace_settings/migration.sql`

This task lays the data foundation. It includes the role rename data migration in the same SQL file so the columns and the values land together.

- [ ] **Step 1: Edit `prisma/schema.prisma` — add Organization fields**

Find the `Organization` model and add these fields immediately after `nextQuoteNumber`:

```prisma
  timezone           String   @default("America/New_York")
  locale             String   @default("en-US")
  brandColor         String   @default("#c0341a")
  tagline            String?
  showLicenseOnQuotes Boolean @default(true)
  defaultDepositPct  Float    @default(0.30)
  defaultValidityDays Int     @default(21)
  defaultUnitLabel   String   @default("ft²")
  defaultTerms       String   @default("")
```

- [ ] **Step 2: Edit `prisma/schema.prisma` — add Quote fields**

In the `Quote` model, add these two fields immediately after `depositPct`:

```prisma
  terms         String       @default("")
  validityDays  Int          @default(21)
```

- [ ] **Step 3: Edit `prisma/schema.prisma` — update User.role default + comment**

Change the `role` line on `User` from:

```prisma
  role      String       @default("member") // owner | admin | member
```

to:

```prisma
  role      String       @default("crew") // admin | lead | crew
```

- [ ] **Step 4: Create the migration directory and SQL file**

Create `prisma/migrations/20260523000000_workspace_settings/migration.sql` with this content:

```sql
-- AlterTable: Organization — workspace-settings fields
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York';
ALTER TABLE "Organization" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "Organization" ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#c0341a';
ALTER TABLE "Organization" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Organization" ADD COLUMN "showLicenseOnQuotes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "defaultDepositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.30;
ALTER TABLE "Organization" ADD COLUMN "defaultValidityDays" INTEGER NOT NULL DEFAULT 21;
ALTER TABLE "Organization" ADD COLUMN "defaultUnitLabel" TEXT NOT NULL DEFAULT 'ft²';
ALTER TABLE "Organization" ADD COLUMN "defaultTerms" TEXT NOT NULL DEFAULT '';

-- AlterTable: Quote — per-quote captured defaults
ALTER TABLE "Quote" ADD COLUMN "terms" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN "validityDays" INTEGER NOT NULL DEFAULT 21;

-- AlterTable: User.role default change
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'crew';

-- DataMigration: role value rename
UPDATE "User" SET "role" = 'admin' WHERE "role" = 'owner';
UPDATE "User" SET "role" = 'crew' WHERE "role" = 'member';
```

- [ ] **Step 5: Apply the migration to the dev DB**

Run: `npm run migrate:dev`
Expected: `Following migration have been applied: 20260523000000_workspace_settings`

- [ ] **Step 6: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client (...) to ./app/generated/prisma`

- [ ] **Step 7: Type-check passes**

Run: `npx tsc --noEmit`
Expected: 0 errors. (TypeScript will now see the new columns; we haven't used them yet so nothing should break.)

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260523000000_workspace_settings
git commit -m "feat(schema): add workspace settings fields, rename role values"
```

---

## Task 2: Update production code references to role: "owner"

**Files:**
- Modify: `app/api/q/[token]/accept/route.ts:100`
- Modify: `app/api/q/[token]/decline/route.ts:60`
- Modify: `lib/repositories/quoteRepo.ts:79`
- Modify: `lib/repositories/quoteRepo.ts:571`

The rename must happen in code at the same time as the data migration. Four call-sites do "find lowest-id user with role=owner, send email." After this task they become "find lowest-id admin."

- [ ] **Step 1: Read the four current call-sites**

Read each line in context to confirm the pattern. All four look like:
`where: { orgId, role: "owner" }` or the type literal `where: { role: "owner" }`.

- [ ] **Step 2: Edit `app/api/q/[token]/accept/route.ts`**

Change `role: "owner"` to `role: "admin"`.

- [ ] **Step 3: Edit `app/api/q/[token]/decline/route.ts`**

Change `role: "owner"` to `role: "admin"`.

- [ ] **Step 4: Edit `lib/repositories/quoteRepo.ts` (both occurrences)**

Change both `role: "owner"` literals (the type at ~line 79 and the runtime query at ~line 571) to `role: "admin"`.

- [ ] **Step 5: Run the affected test files**

Run: `npx vitest run __tests__/api/q.\[token\].accept.test.ts __tests__/api/q.\[token\].decline.test.ts __tests__/repositories/quoteRepo.test.ts`
Expected: All existing tests still pass. If any test hard-codes the string `"owner"` in a Prisma mock, update it to `"admin"` in the same step and re-run.

- [ ] **Step 6: Commit**

```bash
git add app/api/q lib/repositories/quoteRepo.ts __tests__
git commit -m "refactor: rename role=owner to role=admin in production code"
```

---

## Task 3: Update seed to use new role values

**Files:**
- Modify: `prisma/seed.ts` (lines ~145 and ~168)

- [ ] **Step 1: Read `prisma/seed.ts` lines 130–175**

Confirm the two `role: "owner"` occurrences sit inside `prisma.user.upsert` calls for the demo and other-floors users.

- [ ] **Step 2: Edit `prisma/seed.ts`**

Change both `role: "owner"` to `role: "admin"`. Leave everything else untouched. Do NOT add or change any other seed data — the new Quote fields have schema defaults and existing seed quotes work as-is.

- [ ] **Step 3: Re-run the seed against the dev DB**

Run: `npm run seed:dev`
Expected: Script completes without error, both demo users have `role: "admin"`.

Sanity check: `npx prisma studio` (or a quick `SELECT role, COUNT(*) FROM "User" GROUP BY role;`) shows no rows with `role = 'owner'` or `role = 'member'`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): use role=admin for demo users"
```

---

## Task 4: Add `adminRoute` wrapper in `lib/api/route.ts`

**Files:**
- Modify: `lib/api/route.ts`
- Create: `__tests__/lib/api/adminRoute.test.ts`

`adminRoute` mirrors `apiRoute` (resolves org, parses input, wraps in the standard envelope) but additionally rejects non-admins with `UnauthorizedError`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/api/adminRoute.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { adminRoute } from "@/lib/api/route";

const mockAuth = vi.mocked(auth);

function makeRequest(method = "GET", url = "http://localhost/api/x") {
  const req = new Request(url, { method });
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}
const noParams = { params: Promise.resolve({}) };

describe("adminRoute", () => {
  it("returns 401 UNAUTHORIZED when there is no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const handler = adminRoute(async () => ({ ok: true }));
    const res = await handler(makeRequest(), noParams);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("returns 401 UNAUTHORIZED when role is not admin", async () => {
    mockAuth.mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      user: { orgId: "org1", role: "crew" },
    } as any);
    const handler = adminRoute(async () => ({ ok: true }));
    const res = await handler(makeRequest(), noParams);
    expect(res.status).toBe(401);
  });

  it("invokes the handler with orgId when role is admin", async () => {
    mockAuth.mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      user: { orgId: "org1", role: "admin" },
    } as any);
    const inner = vi.fn(async () => ({ ok: true }));
    const handler = adminRoute(inner);
    const res = await handler(makeRequest(), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(inner).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org1" })
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run __tests__/lib/api/adminRoute.test.ts`
Expected: Test fails with `adminRoute is not exported` or similar.

- [ ] **Step 3: Implement `adminRoute` in `lib/api/route.ts`**

Add this export at the end of `lib/api/route.ts`. It reuses the same `wrapHandler`/`parseInput`/`toResponse` internals already in the file:

```typescript
// ── adminRoute ────────────────────────────────────────────────────────────────

export function adminRoute<TInput = undefined, TParams = Record<string, string>>(
  handler: (args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function adminRoute<TInput = undefined, TParams = Record<string, string>>(
  options: RouteOptions<TInput>,
  handler: (args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function adminRoute<TInput, TParams>(
  optionsOrHandler:
    | RouteOptions<TInput>
    | ((args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>),
  maybeHandler?: (
    args: OrgHandlerArgs<TInput, TParams>
  ) => Promise<HandlerResult>
): NextRouteHandler {
  const { options, handler } = normalizeArgs(optionsOrHandler, maybeHandler);

  return wrapHandler(async (req, ctx, logCtx) => {
    const session = await requireSession();
    if (session.user.role !== "admin") {
      throw new UnauthorizedError();
    }
    const orgId = session.user.orgId;
    logCtx.orgId = orgId;
    const input = await parseInput<TInput>(req, options.input);
    const params = ((await ctx.params) ?? {}) as TParams;
    const value = await handler({ req, orgId, input, params });
    return toResponse(value, options.status);
  });
}
```

Also add imports at the top of the file:

```typescript
import { UnauthorizedError } from "@/lib/api/errors";
import { requireSession } from "@/lib/tenant";
```

(If `UnauthorizedError` is already imported, don't duplicate.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run __tests__/lib/api/adminRoute.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Run lint**

Run: `npx biome ci lib/api/route.ts __tests__/lib/api/adminRoute.test.ts`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/api/route.ts __tests__/lib/api/adminRoute.test.ts
git commit -m "feat(api): add adminRoute wrapper for admin-only endpoints"
```

---

## Task 5: Extend `GET /api/org` to return the full editable field set

**Files:**
- Modify: `app/api/org/route.ts`

The existing GET returns 6 fields; we need to include the 9 new Organization fields too (for the page to hydrate the form).

- [ ] **Step 1: Read the current `app/api/org/route.ts`**

Confirm the `select` clause currently lists `id, name, phone, address, licenseNumber, logo`.

- [ ] **Step 2: Edit `app/api/org/route.ts` — expand the GET select**

Replace the select block in the GET handler with:

```typescript
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      licenseNumber: true,
      logo: true,
      timezone: true,
      locale: true,
      brandColor: true,
      tagline: true,
      showLicenseOnQuotes: true,
      defaultDepositPct: true,
      defaultValidityDays: true,
      defaultUnitLabel: true,
      defaultTerms: true,
    },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Run existing org tests if any**

Run: `npx vitest run __tests__/api/org` (file may not exist yet — that's fine; if it exists we're confirming we didn't break it).
Expected: No failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/org/route.ts
git commit -m "feat(api): return workspace settings fields from GET /api/org"
```

---

## Task 6: Add `PATCH /api/org` with Zod schema and admin gate

**Files:**
- Modify: `app/api/org/route.ts`
- Create: `__tests__/api/org.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/org.test.ts`:

```typescript
/**
 * Tier-B route tests: PATCH /api/org gates on admin, validates input,
 * and returns the updated org. Auth/role plumbing is covered by
 * adminRoute's own tests; this file focuses on the route's contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "@/app/api/org/route";

const mockAuth = vi.mocked(auth);
const mockUpdate = vi.mocked(prisma.organization.update);
const mockFindUnique = vi.mocked(prisma.organization.findUnique);

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request("http://localhost/api/org", init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/org"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}
const noParams = { params: Promise.resolve({}) };

function asAdmin() {
  mockAuth.mockResolvedValue({
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    user: { orgId: "org1", role: "admin" },
  } as any);
}
function asCrew() {
  mockAuth.mockResolvedValue({
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    user: { orgId: "org1", role: "crew" },
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/org", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest("PATCH", { name: "x" }), noParams);
    expect(res.status).toBe(401);
  });

  it("returns 401 when role is not admin", async () => {
    asCrew();
    const res = await PATCH(makeRequest("PATCH", { name: "x" }), noParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_FAILED on bad hex color", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { brandColor: "not-a-hex" }),
      noParams
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 when defaultDepositPct is out of range", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultDepositPct: 1.5 }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when defaultValidityDays is 0", async () => {
    asAdmin();
    const res = await PATCH(
      makeRequest("PATCH", { defaultValidityDays: 0 }),
      noParams
    );
    expect(res.status).toBe(400);
  });

  it("updates only the fields included in the body and returns the org", async () => {
    asAdmin();
    const updated = {
      id: "org1",
      name: "Pinecrest Flooring",
      phone: null,
      address: null,
      licenseNumber: null,
      logo: null,
      timezone: "America/New_York",
      locale: "en-US",
      brandColor: "#3d6b4a",
      tagline: null,
      showLicenseOnQuotes: true,
      defaultDepositPct: 0.4,
      defaultValidityDays: 21,
      defaultUnitLabel: "ft²",
      defaultTerms: "",
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce(updated as any);

    const res = await PATCH(
      makeRequest("PATCH", {
        brandColor: "#3D6B4A",
        defaultDepositPct: 0.4,
      }),
      noParams
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: { brandColor: "#3d6b4a", defaultDepositPct: 0.4 },
      })
    );
  });

  it("normalizes hex to lowercase", async () => {
    asAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce({ brandColor: "#abcdef" } as any);
    await PATCH(
      makeRequest("PATCH", { brandColor: "#ABCDEF" }),
      noParams
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { brandColor: "#abcdef" } })
    );
  });

  it("stores empty tagline as null", async () => {
    asAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockUpdate.mockResolvedValueOnce({ tagline: null } as any);
    await PATCH(makeRequest("PATCH", { tagline: "" }), noParams);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tagline: null } })
    );
  });
});

describe("GET /api/org", () => {
  it("returns the org with the new fields included", async () => {
    asAdmin();
    const org = {
      id: "org1",
      name: "Pinecrest",
      brandColor: "#c0341a",
      defaultDepositPct: 0.3,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    mockFindUnique.mockResolvedValueOnce(org as any);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(org);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          brandColor: true,
          defaultDepositPct: true,
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run __tests__/api/org.test.ts`
Expected: Fails on `PATCH` not being exported.

- [ ] **Step 3: Implement PATCH in `app/api/org/route.ts`**

Replace the file with:

```typescript
import { z } from "zod";
import { NotFoundError } from "@/lib/api/errors";
import { adminRoute, apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";

const ORG_SELECT = {
  id: true,
  name: true,
  phone: true,
  address: true,
  licenseNumber: true,
  logo: true,
  timezone: true,
  locale: true,
  brandColor: true,
  tagline: true,
  showLicenseOnQuotes: true,
  defaultDepositPct: true,
  defaultValidityDays: true,
  defaultUnitLabel: true,
  defaultTerms: true,
} as const;

export const GET = apiRoute(async ({ orgId }) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: ORG_SELECT,
  });
  if (!org) throw new NotFoundError();
  return org;
});

const TIMEZONE_RE = /^[A-Za-z]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().regex(TIMEZONE_RE).optional(),
    locale: z.enum(["en-US", "en-CA", "es-MX"]).optional(),
    brandColor: z
      .string()
      .regex(HEX_RE)
      .transform((v) => v.toLowerCase())
      .optional(),
    tagline: z
      .string()
      .max(120)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
    showLicenseOnQuotes: z.boolean().optional(),
    defaultDepositPct: z.number().min(0).max(1).optional(),
    defaultValidityDays: z.number().int().min(1).max(365).optional(),
    defaultUnitLabel: z.enum(["ft²", "yd²", "m²"]).optional(),
    defaultTerms: z.string().max(2000).optional(),
  })
  .strict();

export const PATCH = adminRoute(
  { input: PatchBody },
  async ({ orgId, input }) => {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    );
    const org = await prisma.organization.update({
      where: { id: orgId },
      data,
      select: ORG_SELECT,
    });
    return org;
  }
);
```

Notes for the implementer:
- The `.transform` on `tagline` returns `null` for empty string and `undefined` for absent, so the filter below it correctly omits absent fields and writes nulls when the form clears the field.
- `.strict()` rejects unknown keys with VALIDATION_FAILED, surfacing client/server contract drift.
- `data` is built by filtering out `undefined` so a partial PATCH only writes the keys the client sent.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run __tests__/api/org.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run lint**

Run: `npx biome ci app/api/org __tests__/api/org.test.ts`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/org/route.ts __tests__/api/org.test.ts
git commit -m "feat(api): add PATCH /api/org for workspace settings"
```

---

## Task 7: Wire org defaults into `createQuote`

**Files:**
- Modify: `lib/repositories/quoteRepo.ts` (the `createQuote` path around line 184–204)
- Modify: `__tests__/repositories/quoteRepo.test.ts` (add test cases)

The new-from-estimate path reads `nextQuoteNumber` from Organization already. Extend that read to include the new defaults, then write them onto the new Quote row.

The `reviseQuote` path (line ~349) intentionally copies values from the predecessor and should NOT pull fresh org defaults — leave it as-is.

- [ ] **Step 1: Read `lib/repositories/quoteRepo.ts` lines 175–210**

Confirm the exact shape of the existing `organization.findUnique` call and the `tx.quote.create` call. The current select is `{ nextQuoteNumber: true }`.

- [ ] **Step 2: Read `__tests__/repositories/quoteRepo.test.ts` for the existing createQuote-equivalent test**

Search for the test that exercises the create path (look for `txQuoteCreate` assertions or the existing helper that calls the create function). Use it as the pattern.

- [ ] **Step 3: Write the failing test**

Add to `__tests__/repositories/quoteRepo.test.ts` (in the appropriate `describe` for the create path):

```typescript
describe("createQuote — org defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimateFindFirst.mockResolvedValue({ id: 7 });
    organizationFindUnique.mockResolvedValue({
      nextQuoteNumber: 1042,
      defaultDepositPct: 0.4,
      defaultTerms: "Custom terms text.",
      defaultValidityDays: 30,
    });
    organizationUpdate.mockResolvedValue({});
    txQuoteCreate.mockResolvedValue({ id: 999 });
    quoteFindFirst.mockResolvedValue({ id: 999 });
  });

  it("copies depositPct, terms, validityDays from the org onto the new quote", async () => {
    await createQuote("org1", { estimateId: 7 });
    expect(txQuoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          depositPct: 0.4,
          terms: "Custom terms text.",
          validityDays: 30,
        }),
      })
    );
  });
});
```

(`createQuote` must be in the destructured import block at the top of the test file. If it's not yet, add it.)

- [ ] **Step 4: Run the test, verify it fails**

Run: `npx vitest run __tests__/repositories/quoteRepo.test.ts -t "org defaults"`
Expected: Fails — current `createQuote` writes hard-coded `depositPct: 0.5` and doesn't set `terms`/`validityDays`.

- [ ] **Step 5: Update `lib/repositories/quoteRepo.ts` createQuote**

Find the block at lines ~184–204. Replace:

```typescript
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { nextQuoteNumber: true },
    });
    const quoteNumber = org?.nextQuoteNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextQuoteNumber: quoteNumber + 1 },
    });

    const created = await tx.quote.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        quoteNumber,
        status: "draft",
        convenienceFeeRate: 0.03,
        markupPct: 0,
        depositPct: 0.5,
      },
    });
```

with:

```typescript
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: {
        nextQuoteNumber: true,
        defaultDepositPct: true,
        defaultTerms: true,
        defaultValidityDays: true,
      },
    });
    const quoteNumber = org?.nextQuoteNumber ?? 1;
    await tx.organization.update({
      where: { id: orgId },
      data: { nextQuoteNumber: quoteNumber + 1 },
    });

    const created = await tx.quote.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        quoteNumber,
        status: "draft",
        convenienceFeeRate: 0.03,
        markupPct: 0,
        depositPct: org?.defaultDepositPct ?? 0.3,
        terms: org?.defaultTerms ?? "",
        validityDays: org?.defaultValidityDays ?? 21,
      },
    });
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `npx vitest run __tests__/repositories/quoteRepo.test.ts -t "org defaults"`
Expected: Pass.

- [ ] **Step 7: Run the full quoteRepo test file**

Run: `npx vitest run __tests__/repositories/quoteRepo.test.ts`
Expected: All tests pass. Existing tests may need their `organizationFindUnique` mock to also return the new fields (or `null` for them, since `defaultDepositPct` etc. are now read). If a test breaks because its mock returns only `nextQuoteNumber`, extend it.

- [ ] **Step 8: Run lint**

Run: `npx biome ci lib/repositories/quoteRepo.ts __tests__/repositories/quoteRepo.test.ts`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add lib/repositories/quoteRepo.ts __tests__/repositories/quoteRepo.test.ts
git commit -m "feat(quotes): new quotes inherit org-level defaults"
```

---

## Task 8: Extend `useOrg` hook for new fields

**Files:**
- Modify: `lib/hooks/useOrg.ts`

The hook is used elsewhere in the app (currently returns only the 6 original fields). Adding optional new fields is non-breaking.

- [ ] **Step 1: Edit `lib/hooks/useOrg.ts`**

Replace the `Org` interface with:

```typescript
export interface Org {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  licenseNumber: string | null;
  logo: string | null;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string | null;
  showLicenseOnQuotes: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. Any callers that destructured a subset of fields still work.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useOrg.ts
git commit -m "feat(hooks): expose workspace settings fields on useOrg"
```

---

## Task 9: Add `useUpdateWorkspaceSettings` mutation hook

**Files:**
- Create: `lib/hooks/useUpdateWorkspaceSettings.ts`

- [ ] **Step 1: Create the hook**

Create `lib/hooks/useUpdateWorkspaceSettings.ts`:

```typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import type { Org } from "@/lib/hooks/useOrg";

export type WorkspaceSettingsPatch = Partial<{
  name: string;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string;
  showLicenseOnQuotes: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
}>;

async function patchOrg(patch: WorkspaceSettingsPatch): Promise<Org> {
  const res = await fetch("/api/org", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await readApiError(res, "Failed to save workspace settings");
    throw new Error(err.message);
  }
  return (await res.json()) as Org;
}

export function useUpdateWorkspaceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchOrg,
    onSuccess: (org) => {
      qc.setQueryData(["org"], org);
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useUpdateWorkspaceSettings.ts
git commit -m "feat(hooks): add useUpdateWorkspaceSettings mutation"
```

---

## Task 10: Add Workspace link to `/settings` index

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Read the current file**

Confirm `SETTINGS_LINKS` is a top-level const with one entry.

- [ ] **Step 2: Edit `app/(app)/settings/page.tsx`**

Replace `SETTINGS_LINKS` with:

```typescript
const SETTINGS_LINKS = [
  {
    href: "/settings/workspace",
    title: "Workspace",
    description:
      "Company identity, brand, and the defaults that new quotes inherit.",
  },
  {
    href: "/settings/line-item-templates",
    title: "Line item templates",
    description:
      "Predefined line items your team can drop into any quote — name, description, rate, unit.",
  },
];
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev` (background or separate terminal) and visit `http://localhost:3000/settings`. Confirm both entries render and Workspace is first.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/settings/page.tsx
git commit -m "feat(settings): link to /settings/workspace from the index"
```

---

## Task 11: Create `/settings/workspace` server page with admin gate

**Files:**
- Create: `app/(app)/settings/workspace/page.tsx`

- [ ] **Step 1: Create the page file**

Create `app/(app)/settings/workspace/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { WorkspaceSettingsView } from "@/components/settings/workspace/WorkspaceSettingsView";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Workspace · Settings · SqFt" };

export default async function WorkspaceSettingsPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.orgId },
    select: {
      id: true,
      name: true,
      licenseNumber: true,
      timezone: true,
      locale: true,
      brandColor: true,
      tagline: true,
      showLicenseOnQuotes: true,
      defaultDepositPct: true,
      defaultValidityDays: true,
      defaultUnitLabel: true,
      defaultTerms: true,
    },
  });

  return <WorkspaceSettingsView initial={org} />;
}
```

(The `WorkspaceSettingsView` component is created in Task 12 — the import will fail until then. That's expected.)

- [ ] **Step 2: Commit (without running yet — depends on Task 12)**

```bash
git add app/\(app\)/settings/workspace/page.tsx
git commit -m "feat(settings): scaffold /settings/workspace page with admin gate"
```

---

## Task 12: Scaffold `WorkspaceSettingsView` with types, state, dirty tracking

**Files:**
- Create: `components/settings/workspace/types.ts`
- Create: `components/settings/workspace/WorkspaceSettingsView.tsx`

This task lands the skeleton: state shape, dirty tracking, save mutation wiring. Child sections are stubs and get filled in by Tasks 16–19.

- [ ] **Step 1: Create the types file**

Create `components/settings/workspace/types.ts`:

```typescript
export type WorkspaceSettingsInitial = {
  id: string;
  name: string;
  licenseNumber: string | null;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string | null;
  showLicenseOnQuotes: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
};

export type WorkspaceSettingsForm = {
  name: string;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string;
  showLicenseOnQuotes: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
};

export function toForm(i: WorkspaceSettingsInitial): WorkspaceSettingsForm {
  return {
    name: i.name,
    timezone: i.timezone,
    locale: i.locale,
    brandColor: i.brandColor,
    tagline: i.tagline ?? "",
    showLicenseOnQuotes: i.showLicenseOnQuotes,
    defaultDepositPct: i.defaultDepositPct,
    defaultValidityDays: i.defaultValidityDays,
    defaultUnitLabel: i.defaultUnitLabel,
    defaultTerms: i.defaultTerms,
  };
}
```

- [ ] **Step 2: Create `WorkspaceSettingsView`**

Create `components/settings/workspace/WorkspaceSettingsView.tsx`:

```typescript
"use client";

import { useCallback, useMemo, useState } from "react";
import { useUpdateWorkspaceSettings } from "@/lib/hooks/useUpdateWorkspaceSettings";
import { BrandSection } from "./BrandSection";
import { DefaultsSection } from "./DefaultsSection";
import { IdentitySection } from "./IdentitySection";
import { Masthead } from "./Masthead";
import { SaveBar } from "./SaveBar";
import { Toc } from "./Toc";
import {
  toForm,
  type WorkspaceSettingsForm,
  type WorkspaceSettingsInitial,
} from "./types";

type Props = { initial: WorkspaceSettingsInitial };

export function WorkspaceSettingsView({ initial }: Props) {
  const [snapshot, setSnapshot] = useState<WorkspaceSettingsForm>(() =>
    toForm(initial)
  );
  const [form, setForm] = useState<WorkspaceSettingsForm>(snapshot);
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(snapshot),
    [form, snapshot]
  );

  const update = useUpdateWorkspaceSettings();

  const onChange = useCallback((patch: Partial<WorkspaceSettingsForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const onRevert = useCallback(() => setForm(snapshot), [snapshot]);

  const onSave = useCallback(async () => {
    const diff: Partial<WorkspaceSettingsForm> = {};
    (Object.keys(form) as (keyof WorkspaceSettingsForm)[]).forEach((k) => {
      if (form[k] !== snapshot[k]) {
        // biome-ignore lint/suspicious/noExplicitAny: heterogeneous key copy
        (diff as any)[k] = form[k];
      }
    });
    if (Object.keys(diff).length === 0) return;
    const saved = await update.mutateAsync(diff);
    const nextSnap = toForm({
      ...initial,
      ...saved,
      tagline: saved.tagline,
    });
    setSnapshot(nextSnap);
    setForm(nextSnap);
  }, [form, snapshot, update, initial]);

  return (
    <>
      <Masthead companyName={form.name} licenseNumber={initial.licenseNumber} />
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-14 max-w-[1180px] mx-auto px-12 pt-10 pb-[200px]">
        <Toc />
        <main className="min-w-0">
          <IdentitySection form={form} onChange={onChange} />
          <BrandSection
            form={form}
            licenseNumber={initial.licenseNumber}
            onChange={onChange}
          />
          <DefaultsSection form={form} onChange={onChange} />
        </main>
      </div>
      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        onSave={onSave}
        onRevert={onRevert}
      />
    </>
  );
}
```

- [ ] **Step 3: Create empty stub children so the type-check passes**

These get replaced with real implementations in Tasks 13–19. For now, create minimal stubs so the file compiles. Create each as a one-line file under `components/settings/workspace/`:

`Masthead.tsx`:
```typescript
export function Masthead(_: {
  companyName: string;
  licenseNumber: string | null;
}) {
  return null;
}
```

`Toc.tsx`:
```typescript
export function Toc() {
  return null;
}
```

`SaveBar.tsx`:
```typescript
export function SaveBar(_: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
}) {
  return null;
}
```

`IdentitySection.tsx`:
```typescript
import type { WorkspaceSettingsForm } from "./types";
export function IdentitySection(_: {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
}) {
  return null;
}
```

`BrandSection.tsx`:
```typescript
import type { WorkspaceSettingsForm } from "./types";
export function BrandSection(_: {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
}) {
  return null;
}
```

`DefaultsSection.tsx`:
```typescript
import type { WorkspaceSettingsForm } from "./types";
export function DefaultsSection(_: {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
}) {
  return null;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Smoke test in browser**

Run `npm run dev` if not already running. Log in as the demo admin (`demo@sqft.dev` / `demo1234`). Visit `http://localhost:3000/settings/workspace`. Expect a blank page (no content yet, all sections are stubs). No console errors.

Also verify the admin gate: there's no non-admin demo user, so this check is for later — we'll verify in Task 22.

- [ ] **Step 6: Commit**

```bash
git add components/settings/workspace
git commit -m "feat(settings): scaffold workspace settings view with state + stubs"
```

---

## Task 13: Implement `Masthead`

**Files:**
- Modify: `components/settings/workspace/Masthead.tsx`

Matches the design's masthead block: breadcrumb + title + dek (descriptive paragraph) that reflects the company name in real time.

- [ ] **Step 1: Replace `Masthead.tsx`**

```typescript
type Props = { companyName: string; licenseNumber: string | null };

export function Masthead({ companyName, licenseNumber: _ }: Props) {
  return (
    <header className="px-12 pt-12 pb-9 border-b border-[var(--line)]">
      <div className="max-w-[1180px] mx-auto">
        <div className="flex items-baseline gap-2.5 font-mono text-[10px] tracking-[.18em] uppercase text-[var(--muted)] mb-3.5">
          <span>Settings</span>
          <span className="text-[var(--line-2)]">/</span>
          <span className="text-[var(--ink-2)]">Workspace</span>
        </div>
        <div className="flex items-end justify-between gap-8 flex-wrap">
          <h1 className="text-[64px] font-[700] tracking-[-.035em] leading-[.95]">
            Workspace
            <br />
            <span className="italic font-[400] text-[var(--muted)]">
              — settings &amp; customs.
            </span>
          </h1>
          <p className="max-w-[360px] text-[13px] leading-[1.55] text-[var(--ink-2)] pb-2">
            How <strong className="text-[var(--ink)] font-[600]">{companyName || "your business"}</strong> shows up to customers, what your defaults look like, and who can do what. Changes apply to every quote and invoice going forward.
          </p>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit` (expect 0 errors) and refresh the browser. The masthead should render at the top of the page, the company name appears live in the dek.

- [ ] **Step 3: Commit**

```bash
git add components/settings/workspace/Masthead.tsx
git commit -m "feat(settings): workspace masthead block"
```

---

## Task 14: Implement `Toc` with scroll-spy

**Files:**
- Modify: `components/settings/workspace/Toc.tsx`

- [ ] **Step 1: Replace `Toc.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";

const ENTRIES = [
  { id: "identity", n: "01", label: "Identity" },
  { id: "brand", n: "02", label: "Brand & Quote Style" },
  { id: "defaults", n: "03", label: "Estimating Defaults" },
];

export function Toc() {
  const [active, setActive] = useState<string>("identity");

  useEffect(() => {
    const sections = ENTRIES.map((e) => document.getElementById(e.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          )[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <aside
      className="sticky top-20 self-start h-max hidden md:block"
      aria-label="Settings sections"
    >
      <div className="font-mono text-[10px] tracking-[.2em] uppercase text-[var(--muted)] pb-3 mb-3.5 border-b border-[var(--line)]">
        Contents
      </div>
      <ol className="list-none p-0 m-0">
        {ENTRIES.map((e) => {
          const isActive = active === e.id;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={[
                  "flex items-baseline gap-3 py-[7px] no-underline transition-colors",
                  isActive
                    ? "text-[var(--ink)]"
                    : "text-[var(--muted)] hover:text-[var(--ink-2)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "font-mono text-[10px] w-[22px] tabular-nums transition-colors",
                    isActive ? "text-[var(--accent)]" : "text-[var(--line-2)]",
                  ].join(" ")}
                >
                  {e.n}
                </span>
                <span
                  className={[
                    "text-[13px] tracking-[-.01em]",
                    isActive ? "font-[600]" : "",
                  ].join(" ")}
                >
                  {e.label}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
```

- [ ] **Step 2: Smoke test**

Refresh browser. The TOC is hidden because section IDs don't exist yet — that's expected. After Tasks 15–17 land the sections with their `id` attributes, the TOC will fill in. Type-check should still pass.

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/workspace/Toc.tsx
git commit -m "feat(settings): table of contents with scroll-spy"
```

---

## Task 15: Implement `SaveBar`

**Files:**
- Modify: `components/settings/workspace/SaveBar.tsx`

- [ ] **Step 1: Replace `SaveBar.tsx`**

```typescript
"use client";

import { useEffect } from "react";

type Props = {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
};

export function SaveBar({ dirty, saving, onSave, onRevert }: Props) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return (
    <div
      className={[
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]",
        "flex items-center gap-3.5 px-4 py-2.5",
        "bg-[var(--surface)] border border-[var(--line-2)] rounded-[10px]",
        "shadow-[var(--shadow-md)] transition-all duration-200",
        dirty
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
      <span className="font-mono text-[11px] tracking-[.08em] uppercase text-[var(--ink-2)]">
        Unsaved changes
      </span>
      <div className="flex gap-2 ml-2">
        <button
          type="button"
          onClick={onRevert}
          disabled={saving}
          className="font-mono text-[10px] px-2.5 py-1.5 rounded bg-transparent border-0 text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer disabled:opacity-50"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="font-mono text-[10px] px-3 py-1.5 rounded bg-[var(--ink)] text-[var(--bg)] border border-[var(--ink)] hover:bg-[var(--ink-2)] cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save workspace"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/workspace/SaveBar.tsx
git commit -m "feat(settings): sticky save bar with beforeunload prompt"
```

---

## Task 16: Implement `IdentitySection`

**Files:**
- Modify: `components/settings/workspace/IdentitySection.tsx`

Section 01 in the design — company name, timezone, locale. The `id="identity"` enables the TOC scroll-spy.

- [ ] **Step 1: Replace `IdentitySection.tsx`**

```typescript
"use client";

import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];
const LOCALES = ["en-US", "en-CA", "es-MX"];

export function IdentitySection({ form, onChange }: Props) {
  return (
    <section className="mb-16 scroll-mt-20" id="identity">
      <SectionHead n="01" title="Identity" kicker="Who you are on paper" />

      <FieldRow label="Company name">
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent text-[14px] focus:outline-none focus:border-[var(--ink-2)]"
        />
      </FieldRow>

      <FieldRow label="Timezone & locale">
        <div className="grid grid-cols-2 gap-2.5">
          <SelWrap>
            <select
              value={form.timezone}
              onChange={(e) => onChange({ timezone: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent font-mono text-[13px] tracking-[.02em] cursor-pointer pr-8 appearance-none focus:outline-none focus:border-[var(--ink-2)]"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </SelWrap>
          <SelWrap>
            <select
              value={form.locale}
              onChange={(e) => onChange({ locale: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent font-mono text-[13px] tracking-[.02em] cursor-pointer pr-8 appearance-none focus:outline-none focus:border-[var(--ink-2)]"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </SelWrap>
        </div>
      </FieldRow>
    </section>
  );
}

export function SectionHead({
  n,
  title,
  kicker,
}: {
  n: string;
  title: string;
  kicker: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3.5 pb-4 mb-6 border-b border-[var(--line)]">
      <div className="flex items-baseline gap-4">
        <div className="font-[700] text-[40px] leading-none tracking-[-.04em] text-[var(--accent)] opacity-90 tabular-nums">
          {n}
        </div>
        <div>
          <h2 className="text-[22px] font-[700] tracking-[-.02em] leading-[1.2]">
            {title}
          </h2>
          <div className="mt-0.5 text-[12px] text-[var(--muted)] italic">
            {kicker}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 py-2.5">
      <div className="pt-2">
        <div className="font-mono text-[10px] tracking-[.14em] uppercase text-[var(--muted)]">
          {label}
        </div>
        {hint && (
          <div className="mt-1.5 text-[12px] text-[var(--ink-2)] leading-[1.5] max-w-[200px]">
            {hint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SelWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-block w-full">
      {children}
      <span
        aria-hidden
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[10px] pointer-events-none"
      >
        ▾
      </span>
    </div>
  );
}
```

Note: `SectionHead`, `FieldRow`, `SelWrap` are exported so Tasks 17 and 19 can reuse them. Keeps the section markup consistent without a shared util module.

- [ ] **Step 2: Smoke**

Refresh browser. Identity section renders with the company name input and two selects. Changing the company name updates the dek in the masthead live. The save bar appears.

- [ ] **Step 3: Commit**

```bash
git add components/settings/workspace/IdentitySection.tsx
git commit -m "feat(settings): identity section (name, tz, locale)"
```

---

## Task 17: Implement `BrandSection` and `BrandPreview`

**Files:**
- Modify: `components/settings/workspace/BrandSection.tsx`
- Create: `components/settings/workspace/BrandPreview.tsx`

- [ ] **Step 1: Create `BrandPreview.tsx`**

```typescript
"use client";

import type { CSSProperties } from "react";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
};

export function BrandPreview({ form, licenseNumber }: Props) {
  const previewStyle = { "--brand": form.brandColor } as CSSProperties;
  return (
    <div className="sticky top-20" style={previewStyle}>
      <div className="flex justify-between font-mono text-[10px] tracking-[.18em] uppercase text-[var(--muted)] mb-2">
        <span>Live preview</span>
        <span>Quote · sample</span>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded overflow-hidden shadow-[var(--shadow)]">
        <div className="h-1.5" style={{ background: "var(--brand)" }} />
        <div className="p-5">
          <div className="flex items-start justify-between pb-3.5 border-b border-[var(--line)]">
            <div>
              <div className="text-[15px] font-[700] tracking-[-.015em]">
                {form.name || "Workspace"}
              </div>
              {form.tagline && (
                <div className="text-[10px] italic text-[var(--muted)] mt-0.5 max-w-[200px] leading-[1.25]">
                  {form.tagline}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-[9px] tracking-[.16em] uppercase text-[var(--muted)]">
                Quote
              </div>
              <div className="font-mono text-[12px] tabular-nums">#Q-1047</div>
            </div>
          </div>

          <div className="py-3.5 flex flex-col gap-2.5">
            <PreviewLine name="Sand & refinish — red oak" amt="$2,940.00" />
            <PreviewLine name="LVP install — Tahoe collection" amt="$3,720.00" />
            <PreviewLine name="Underlayment & trim" amt="$485.00" />
          </div>

          <div className="pt-3 border-t border-[var(--line)] flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[13px] font-[600] tracking-[-.005em]">
              <span>Total</span>
              <span
                className="font-[700] tabular-nums"
                style={{ color: "var(--brand)" }}
              >
                $7,145.00
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[12px] text-[var(--muted)]">
              <span>
                Deposit · {Math.round(form.defaultDepositPct * 100)}%
              </span>
              <span className="font-mono tabular-nums">
                ${(7145 * form.defaultDepositPct).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-[var(--line)] flex justify-between font-mono text-[9px] tracking-[.12em] uppercase text-[var(--muted)]">
            <span>Valid {form.defaultValidityDays} days</span>
            {form.showLicenseOnQuotes && licenseNumber && (
              <span>{licenseNumber}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 font-mono text-[10px] text-center text-[var(--muted)] italic">
        Sample numbers — your saved settings apply to new quotes.
      </div>
    </div>
  );
}

function PreviewLine({ name, amt }: { name: string; amt: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 text-[12px]">
      <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {name}
      </div>
      <div className="font-mono w-[78px] text-right tabular-nums">{amt}</div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `BrandSection.tsx`**

```typescript
"use client";

import { BrandPreview } from "./BrandPreview";
import { FieldRow, SectionHead } from "./IdentitySection";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  licenseNumber: string | null;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const SWATCHES = [
  { hex: "#c0341a", name: "Vermilion" },
  { hex: "#3d6b4a", name: "Sage" },
  { hex: "#b07a1a", name: "Burnt Gold" },
  { hex: "#1f4e6b", name: "Slate Blue" },
  { hex: "#5a2a4a", name: "Plum" },
  { hex: "#1a1a17", name: "Ink" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandSection({ form, licenseNumber, onChange }: Props) {
  const currentHex = form.brandColor.toLowerCase();

  return (
    <section className="mb-16 scroll-mt-20" id="brand">
      <SectionHead
        n="02"
        title="Brand & Quote Style"
        kicker="The look of every customer-facing page"
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-9 items-start">
        <div>
          <FieldRow label="Accent color">
            <div className="flex gap-2 flex-wrap mb-2.5">
              {SWATCHES.map((s) => {
                const active = s.hex.toLowerCase() === currentHex;
                return (
                  <button
                    key={s.hex}
                    type="button"
                    onClick={() => onChange({ brandColor: s.hex })}
                    className={[
                      "inline-flex items-center gap-2 px-2.5 py-1.5 rounded border bg-transparent cursor-pointer transition-colors",
                      active
                        ? "border-[var(--ink)]"
                        : "border-[var(--line)] hover:border-[var(--ink-2)]",
                    ].join(" ")}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-sm"
                      style={{
                        background: s.hex,
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)",
                      }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-2)]">
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="brand-hex"
                className="font-mono text-[10px] text-[var(--muted)] tracking-[.12em] uppercase"
              >
                Custom
              </label>
              <input
                id="brand-hex"
                value={form.brandColor}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  // Always echo to state so the input is controlled;
                  // only the normalized lowercase value matters for save.
                  onChange({
                    brandColor: HEX_RE.test(v) ? v.toLowerCase() : v,
                  });
                }}
                className="font-mono text-[12px] w-[110px] px-2.5 py-1.5 border border-[var(--line)] rounded-sm bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink-2)]"
              />
            </div>
          </FieldRow>

          <FieldRow
            label="Tagline"
            hint="Optional. Shown beneath the company name on the customer quote page."
          >
            <input
              type="text"
              value={form.tagline}
              maxLength={120}
              onChange={(e) => onChange({ tagline: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent text-[14px] focus:outline-none focus:border-[var(--ink-2)]"
            />
          </FieldRow>

          <FieldRow label="License footer">
            <label className="inline-flex items-start gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={form.showLicenseOnQuotes}
                onChange={(e) =>
                  onChange({ showLicenseOnQuotes: e.target.checked })
                }
                className="sr-only peer"
              />
              <span className="relative shrink-0 w-9 h-5 border border-[var(--line-2)] bg-[var(--surface-2)] rounded-full transition-colors peer-checked:bg-[var(--brand,var(--accent))] peer-checked:border-transparent">
                <span className="absolute top-px left-px w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="text-[13px] leading-[1.4]">
                Print license number on every quote
              </span>
            </label>
          </FieldRow>
        </div>

        <BrandPreview form={form} licenseNumber={licenseNumber} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Smoke**

Refresh browser. Brand section renders with swatches, hex input, tagline, license toggle, and preview on the right. Clicking swatches tints only the preview (not the nav, not the rest of the page). Tagline typing updates the preview live. Toggling the license toggle hides/shows the footer line in the preview.

- [ ] **Step 4: Run lint**

Run: `npx biome ci components/settings/workspace`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/settings/workspace/BrandSection.tsx components/settings/workspace/BrandPreview.tsx
git commit -m "feat(settings): brand section with scoped live preview"
```

---

## Task 18: Implement `DefaultsSection`

**Files:**
- Modify: `components/settings/workspace/DefaultsSection.tsx`

- [ ] **Step 1: Replace `DefaultsSection.tsx`**

```typescript
"use client";

import { FieldRow, SectionHead } from "./IdentitySection";
import type { WorkspaceSettingsForm } from "./types";

type Props = {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
};

const UNITS: { val: WorkspaceSettingsForm["defaultUnitLabel"]; label: string }[] =
  [
    { val: "ft²", label: "Square feet" },
    { val: "yd²", label: "Square yards" },
    { val: "m²", label: "Square meters" },
  ];

export function DefaultsSection({ form, onChange }: Props) {
  const depositPct = Math.round(form.defaultDepositPct * 100);

  return (
    <section className="mb-16 scroll-mt-20" id="defaults">
      <SectionHead
        n="03"
        title="Estimating Defaults"
        kicker="What new quotes inherit"
      />

      <div className="border border-[var(--line)] rounded bg-[var(--surface)] p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="font-mono text-[10px] tracking-[.14em] uppercase text-[var(--muted)]">
            Deposit
          </div>
          <div className="tabular-nums">
            <span className="font-[700] text-[28px] tracking-[-.03em] text-[var(--accent)]">
              {depositPct}
            </span>
            <span className="text-[14px] text-[var(--muted)] ml-0.5">%</span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={depositPct}
          onChange={(e) =>
            onChange({ defaultDepositPct: Number(e.target.value) / 100 })
          }
          className="w-full"
        />
        <div className="flex justify-between mt-1.5 font-mono text-[9px] text-[var(--muted)] tabular-nums">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      <FieldRow label="Quote validity">
        <div className="flex items-center gap-2.5 text-[13px] text-[var(--muted)]">
          <input
            type="number"
            min={1}
            max={365}
            value={form.defaultValidityDays}
            onChange={(e) =>
              onChange({
                defaultValidityDays: Math.max(
                  1,
                  Math.min(365, Number(e.target.value) || 21)
                ),
              })
            }
            className="w-[90px] px-2.5 py-2 border border-[var(--line)] rounded bg-transparent font-mono text-[14px] text-right tabular-nums focus:outline-none focus:border-[var(--ink-2)]"
          />
          <span>days from send</span>
        </div>
      </FieldRow>

      <FieldRow label="Measure unit">
        <div className="inline-flex p-0.5 border border-[var(--line)] rounded bg-[var(--surface)]">
          {UNITS.map((u) => {
            const active = form.defaultUnitLabel === u.val;
            return (
              <button
                key={u.val}
                type="button"
                onClick={() => onChange({ defaultUnitLabel: u.val })}
                className={[
                  "px-3 py-1.5 font-mono text-[11px] tracking-[.04em] border-0 cursor-pointer rounded-sm transition-colors",
                  active
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : "bg-transparent text-[var(--muted)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {u.label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow
        label="Default terms"
        hint="Pre-fills the Terms field on a fresh quote."
      >
        <textarea
          rows={4}
          maxLength={2000}
          value={form.defaultTerms}
          onChange={(e) => onChange({ defaultTerms: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--line)] rounded bg-transparent text-[13px] leading-[1.55] resize-y focus:outline-none focus:border-[var(--ink-2)]"
        />
      </FieldRow>
    </section>
  );
}
```

- [ ] **Step 2: Smoke**

Refresh browser. Defaults section renders. Dragging the deposit slider updates the percentage and the preview's deposit line. Changing validity updates the preview footer. Unit segments switch with click.

- [ ] **Step 3: Run lint**

Run: `npx biome ci components/settings/workspace`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/settings/workspace/DefaultsSection.tsx
git commit -m "feat(settings): defaults section (deposit, validity, unit, terms)"
```

---

## Task 19: End-to-end smoke + verify save path

**Files:** none (verification only)

By now, the page should be functionally complete. This task is a structured manual run-through. Do not skip — the spec calls this out as "test the UI in a browser before reporting complete."

- [ ] **Step 1: Make sure the dev server is running and you're logged in as the admin demo**

`npm run dev`, sign in as `demo@sqft.dev` / `demo1234`.

- [ ] **Step 2: Smoke the page end-to-end**

Visit `http://localhost:3000/settings/workspace`. Verify:

- Masthead title and breadcrumb render.
- Company name in the dek reflects what's in the input.
- TOC on the left highlights the section currently in view as you scroll.
- All three sections (Identity, Brand, Defaults) render with their fields populated from the loaded org.
- Live preview on the right (Brand section) reads the current company name, tagline, deposit %, validity days, license toggle.
- Brand swatch clicks change the preview tint but NOT the app nav's accent.

- [ ] **Step 3: Smoke dirty + save + revert**

- Change the company name. Save bar slides up.
- Click Revert. Form resets, save bar slides down.
- Change two fields (e.g., company name and brand color).
- Click Save workspace. Bar shows "Saving…", then disappears on success.
- Hard-reload the page. Both values persist.

- [ ] **Step 4: Smoke beforeunload**

- Change a field. Try to close the tab / hit back. Browser shows native unsaved-changes prompt. Cancel, save, close again — no prompt.

- [ ] **Step 5: Smoke admin gate**

Open a private window. Sign in as `demo2@sqft.dev` (Other Floors, also admin) — visiting `/settings/workspace` should work. We don't currently have a non-admin seed user; verifying redirect requires creating one ad hoc with `npx prisma studio` (set role to `crew`) or running:

```bash
npx prisma db execute --stdin <<'SQL'
UPDATE "User" SET role = 'crew' WHERE email = 'demo2@sqft.dev';
SQL
```

Then visiting `/settings/workspace` as `demo2@sqft.dev` should redirect to `/settings`. Reset:

```bash
npx prisma db execute --stdin <<'SQL'
UPDATE "User" SET role = 'admin' WHERE email = 'demo2@sqft.dev';
SQL
```

- [ ] **Step 6: Smoke API gate**

With `demo2@sqft.dev` flipped to `crew`, attempt `PATCH /api/org` via curl or DevTools. Expect 401 with the `UNAUTHORIZED` envelope.

- [ ] **Step 7: If anything failed, fix it and re-run**

If any step failed, identify the cause, fix the affected component/route, and re-smoke. No commit needed for this task unless a fix was applied.

---

## Task 20: Lint + full test sweep

**Files:** none (verification only)

The repo rule from `AGENTS.md`: `biome ci .` must pass with no errors before any PR.

- [ ] **Step 1: Lint the whole repo**

Run: `npx biome ci .`
Expected: No errors. If errors appear in files this plan touched, fix in this task. If errors appear in files this plan did NOT touch, leave them — they're not introduced here.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: All tests pass. New tests from Tasks 4, 6, 7 included. No previously-passing test now fails.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: If any step failed, fix and re-run**

Don't move on with a red bar. If a downstream test broke because of a Prisma client regeneration or a role-string update, fix it in the appropriate task's file scope and re-run.

- [ ] **Step 5: Final commit if any fix-up was needed**

```bash
git add -A
git commit -m "chore: lint + test fixups for workspace settings"
```

(Skip this step if there was nothing to fix.)

---

## Self-Review

**Spec coverage check.** Going through each section of the spec:

- Decisions: URL (`/settings/workspace`) → Task 11. Admin access → Tasks 4, 11. Role redesign (values only) → Tasks 1–3. Defaults copy at creation → Task 7. Brand live read by `/q/[token]` → spec called out as downstream (not in scope here). Brand color scoped on settings page → Task 17 (inline CSS var on `BrandPreview`). Save UX (single PATCH, sticky bar, beforeunload) → Tasks 12, 15. Monogram omitted → no field added.
- Schema changes: Organization fields → Task 1. Quote fields → Task 1. Role rename → Tasks 1, 2, 3.
- URL & page composition: `/settings` index entry → Task 10. Workspace page → Task 11. Admin redirect → Task 11.
- Component breakdown: All listed components have tasks (12, 13, 14, 15, 16, 17, 18).
- API: GET extension → Task 5. PATCH with admin gate + Zod → Task 6. `adminRoute` wrapper → Task 4.
- Quote-creation wiring: Task 7.
- Testing: Vitest unit for Zod / route → Task 6 (8 cases including hex normalize, tagline-empty-to-null, bad hex, bad deposit, bad validity). Vitest integration for adminRoute → Task 4 (3 cases). Quote creation seam → Task 7. Playwright optional → not included (spec said low priority).

No spec requirement is missing a task.

**Placeholder scan.** Searched for "TBD", "TODO", "implement later", "add appropriate error handling", "similar to Task". Found one acceptable forward-reference: Task 11 commits before Task 12 implements the imported component — Task 11's commit is intentional to keep the page-shell change atomic, and Task 12 is the very next task.

**Type consistency.** Names cross-referenced:
- `WorkspaceSettingsForm` (types.ts) → used in `WorkspaceSettingsView`, all sections, hook.
- `WorkspaceSettingsInitial` (types.ts) → page → view → `toForm`.
- `WorkspaceSettingsPatch` (hook) → matches the optional-fields subset.
- `Org` (extended in Task 8) → used by hook's return type.
- `adminRoute` (Task 4) → used in `app/api/org/route.ts` PATCH (Task 6).
- `ORG_SELECT` (Task 6) → used in both GET and PATCH selects, single source of truth.
- `SectionHead`, `FieldRow`, `SelWrap` (Task 16) → imported by `BrandSection` (Task 17) and `DefaultsSection` (Task 18).
- `BrandPreview` (Task 17) → imported by `BrandSection`.

Consistent.
