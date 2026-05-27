# Organization Onboarding — Phase 2: Manual Onboarding (Super-Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a super-admin-only `/admin/orgs` page that lists every organization and lets the operator stand up a new manual org without touching SQL. Builds on Phase 1's `createOrganization` service.

**Architecture:** A new `lib/auth/superAdmin.ts` exposes `isSuperAdmin(email)` against a comma-separated `SUPER_ADMIN_EMAILS` env var. The existing `apiRoute` wrapper grows a new `superAdmin: true` option that requires session + super-admin email, returning 403 otherwise. A new `/api/admin/orgs` route (GET list, POST create) calls `createOrganization({ billing: { kind: "manual" }})`. A new `(admin)` route group hosts the server-side gate and the orgs page; non-super-admins see an inline 403 (no redirect). Client UI mirrors the existing members-page split: a server page hydrates initial data, a client `AdminOrgsView` owns the table + create form via TanStack Query, and `useAdminOrgs` wraps fetch.

**Tech Stack:** Next.js 16 (App Router), Prisma 7, NextAuth (JWT sessions), Zod, TanStack Query v5, Vitest, biome (`biome ci .` must pass). Phase 1 code reused: `lib/onboarding/createOrganization.ts`, `lib/api/errors.ts`, `lib/api/route.ts`, `lib/auth/permissions.ts`.

**Spec:** [docs/superpowers/specs/2026-05-25-organization-onboarding-design.md](../specs/2026-05-25-organization-onboarding-design.md) — "Phase 2 — Manual Onboarding (Super-Admin)" section.

## Files

**Create:**
- `lib/auth/superAdmin.ts` — `isSuperAdmin(email)` helper reading `SUPER_ADMIN_EMAILS`
- `__tests__/lib/auth/superAdmin.test.ts`
- `app/api/admin/orgs/route.ts` — GET (list) + POST (create) handlers
- `__tests__/api/admin-orgs.test.ts`
- `app/(admin)/layout.tsx` — server-side super-admin gate, renders inline 403 on miss
- `app/(admin)/admin/orgs/page.tsx` — server page hydrating the initial org list
- `components/admin/orgs/types.ts` — shared row + create-input types
- `components/admin/orgs/AdminOrgsView.tsx` — client component wiring table + form
- `components/admin/orgs/OrgsTable.tsx` — read-only table with status pills
- `components/admin/orgs/CreateOrgForm.tsx` — collapsible form, suggest-password button, success card
- `lib/hooks/useAdminOrgs.ts` — `useListAdminOrgs` + `useCreateAdminOrg` TanStack hooks
- `__tests__/lib/api/route.superAdmin.test.ts` — covers the new `superAdmin: true` option on `apiRoute`

**Modify:**
- `lib/api/errors.ts` — add `ForbiddenError` (status 403, code `"FORBIDDEN"`)
- `lib/api/route.ts` — add `superAdmin?: boolean` option to `RouteOptions`; new gate branch in `apiRoute`
- `.env.example` — document the `SUPER_ADMIN_EMAILS` variable

---

## Task 1: `ForbiddenError`

**Files:**
- Modify: `lib/api/errors.ts`

- [ ] **Step 1: Add the error class**

Open `lib/api/errors.ts`. After the existing `UnauthorizedError` class (line 33), insert:

```ts
export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super({ code: "FORBIDDEN", status: 403, message });
  }
}
```

There is no separate test file — this class is exercised by the `apiRoute` super-admin tests in Task 3.

- [ ] **Step 2: Lint and commit**

```bash
npm run lint:ci
git add lib/api/errors.ts
git commit -m "feat(api): add ForbiddenError (403 FORBIDDEN)"
```

---

## Task 2: `isSuperAdmin` helper

**Files:**
- Create: `lib/auth/superAdmin.ts`
- Create: `__tests__/lib/auth/superAdmin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/auth/superAdmin.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("isSuperAdmin", () => {
  const ORIGINAL = process.env.SUPER_ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.SUPER_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = ORIGINAL;
  });

  async function load() {
    // Re-import so the module re-reads the env each test
    const mod = await import("@/lib/auth/superAdmin");
    return mod.isSuperAdmin;
  }

  it("returns false when the env var is unset", async () => {
    const isSuperAdmin = await load();
    expect(isSuperAdmin("anyone@example.com")).toBe(false);
  });

  it("returns false for empty input", async () => {
    process.env.SUPER_ADMIN_EMAILS = "alice@example.com";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });

  it("returns true for an exact match", async () => {
    process.env.SUPER_ADMIN_EMAILS = "alice@example.com";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("alice@example.com")).toBe(true);
  });

  it("is case-insensitive on both sides", async () => {
    process.env.SUPER_ADMIN_EMAILS = "Alice@Example.COM";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("ALICE@example.com")).toBe(true);
  });

  it("supports comma-separated lists with surrounding whitespace", async () => {
    process.env.SUPER_ADMIN_EMAILS =
      "  alice@example.com , bob@example.com ,carol@example.com";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("bob@example.com")).toBe(true);
    expect(isSuperAdmin("carol@example.com")).toBe(true);
    expect(isSuperAdmin("dave@example.com")).toBe(false);
  });

  it("ignores empty entries from a stray trailing comma", async () => {
    process.env.SUPER_ADMIN_EMAILS = "alice@example.com,,";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("")).toBe(false);
    expect(isSuperAdmin("alice@example.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/auth/superAdmin.test.ts`

Expected: FAIL with "Cannot find module '@/lib/auth/superAdmin'".

- [ ] **Step 3: Implement the helper**

Create `lib/auth/superAdmin.ts`:

```ts
/**
 * Super-admin allowlist gate.
 *
 * Membership is controlled by the `SUPER_ADMIN_EMAILS` environment variable
 * (comma-separated). There is no DB column and no UI management surface —
 * changing the allowlist requires editing `.env.prd.local` and redeploying.
 *
 * Re-reads the env var on every call so test setup can mutate it freely.
 */
export function isSuperAdmin(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  const target = email.toLowerCase();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed.length > 0 && trimmed === target) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/auth/superAdmin.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint:ci
git add lib/auth/superAdmin.ts __tests__/lib/auth/superAdmin.test.ts
git commit -m "feat(auth): add isSuperAdmin allowlist helper"
```

---

## Task 3: Extend `apiRoute` with `superAdmin: true`

**Files:**
- Modify: `lib/api/route.ts`
- Create: `__tests__/lib/api/route.superAdmin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/api/route.superAdmin.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { apiRoute } from "@/lib/api/route";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function makeRequest(method = "GET") {
  const req = new Request("http://localhost/api/admin/x", { method });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/admin/x"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

const noParams = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
});

describe("apiRoute({ superAdmin: true })", () => {
  it("401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const handler = apiRoute({ superAdmin: true }, async () => ({ ok: true }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("403 FORBIDDEN when session email is not in the allowlist", async () => {
    mockAuth.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { user: { id: "u1", orgId: "o1", role: "admin", email: "nobody@x.test" } } as any
    );
    const handler = apiRoute({ superAdmin: true }, async () => ({ ok: true }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("403 when the session user has no email", async () => {
    mockAuth.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { user: { id: "u1", orgId: "o1", role: "admin", email: null } } as any
    );
    const handler = apiRoute({ superAdmin: true }, async () => ({ ok: true }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
  });

  it("200 and runs the handler when email is in the allowlist (case-insensitive)", async () => {
    mockAuth.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { user: { id: "u1", orgId: "o1", role: "admin", email: "BOSS@SQFT.dev" } } as any
    );
    const handler = apiRoute({ superAdmin: true }, async ({ orgId }) => ({
      orgId,
    }));
    const res = await handler(makeRequest("GET"), noParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ orgId: "o1" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/api/route.superAdmin.test.ts`

Expected: FAIL — the `superAdmin` option doesn't exist on `RouteOptions` yet, so TypeScript or runtime will reject it. (Vitest runs through esbuild, so the test executes but the option is ignored — the third test will fail with `orgId` being undefined or a 401.)

- [ ] **Step 3: Add the option to `RouteOptions`**

Open `lib/api/route.ts`. Update the `RouteOptions` type (currently lines 41–48):

```ts
type RouteOptions<TInput> = {
  /** Zod schema for the request body. When omitted, `input` is `undefined`. */
  input?: ZodType<TInput>;
  /** Success status when the handler returns a value (default 200, ignored for explicit Response). */
  status?: number;
  /** Minimum role required to access this route. Omit for any-authenticated. */
  minRole?: "lead" | "admin";
  /**
   * When true, the route requires a session AND the session user's email must
   * be in `SUPER_ADMIN_EMAILS`. Returns 403 FORBIDDEN otherwise. Mutually
   * exclusive with `minRole` (superAdmin takes precedence if both are set).
   */
  superAdmin?: boolean;
};
```

- [ ] **Step 4: Add the super-admin branch to the `apiRoute` wrapper**

Still in `lib/api/route.ts`. At the top of the file, add the import next to the existing auth/permissions import (currently line 18):

```ts
import { ApiError, ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/api/errors";
import { hasMinRole } from "@/lib/auth/permissions";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
```

Then update the gate block inside `apiRoute` (currently lines 71–82) to add a super-admin branch before the `minRole` branch:

```ts
  return wrapHandler(async (req, ctx, logCtx) => {
    let orgId: string;
    if (options.superAdmin) {
      const session = await requireSession();
      if (!isSuperAdmin(session.user.email)) {
        throw new ForbiddenError();
      }
      orgId = session.user.orgId;
    } else if (options.minRole) {
      const session = await requireSession();
      if (!hasMinRole(session.user.role, options.minRole)) {
        throw new UnauthorizedError();
      }
      orgId = session.user.orgId;
    } else {
      orgId = await getOrgId();
    }
    logCtx.orgId = orgId;
    const input = await parseInput<TInput>(req, options.input);
    const params = ((await ctx.params) ?? {}) as TParams;
    const value = await handler({ req, orgId, input, params });
    return toResponse(value, options.status);
  });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/api/route.superAdmin.test.ts`

Expected: all 4 tests pass.

- [ ] **Step 6: Run the full apiRoute-adjacent tests to confirm no regression**

Run: `npx vitest run __tests__/api`

Expected: every test in `__tests__/api` still passes. The existing `minRole` gate is untouched.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add lib/api/route.ts __tests__/lib/api/route.superAdmin.test.ts
git commit -m "feat(api): add superAdmin option to apiRoute"
```

---

## Task 4: `GET /api/admin/orgs` — list orgs

**Files:**
- Create: `app/api/admin/orgs/route.ts`
- Create: `__tests__/api/admin-orgs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/admin-orgs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/onboarding/createOrganization", () => ({
  createOrganization: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { GET } from "@/app/api/admin/orgs/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeRequest, noParams } from "../_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindMany = vi.mocked(prisma.organization.findMany);

function asSuperAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    { user: { id: "u1", orgId: "o1", role: "admin", email: "boss@sqft.dev" } } as any
  );
}

function asNormalAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    { user: { id: "u1", orgId: "o1", role: "admin", email: "regular@sqft.dev" } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/orgs", () => {
  it("401 when no session", async () => {
    process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not super-admin", async () => {
    asNormalAdmin();
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(403);
  });

  it("returns the org list with status, dates, and user count", async () => {
    asSuperAdmin();
    const stub = [
      {
        id: "o1",
        name: "Acme Floors",
        slug: "acme-floors",
        subscriptionStatus: "manual",
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        createdAt: new Date("2026-05-20T00:00:00Z"),
        _count: { users: 3 },
      },
      {
        id: "o2",
        name: "Pinecrest",
        slug: "pinecrest",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-06-08T00:00:00Z"),
        currentPeriodEndsAt: new Date("2026-07-08T00:00:00Z"),
        createdAt: new Date("2026-05-25T00:00:00Z"),
        _count: { users: 1 },
      },
    ];
    // biome-ignore lint/suspicious/noExplicitAny: prisma row shape
    mockFindMany.mockResolvedValueOnce(stub as any);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: "o1",
      name: "Acme Floors",
      slug: "acme-floors",
      subscriptionStatus: "manual",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      createdAt: "2026-05-20T00:00:00.000Z",
      userCount: 3,
    });
    expect(body[1]?.userCount).toBe(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { users: true } },
        }),
        orderBy: { createdAt: "desc" },
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/api/admin-orgs.test.ts`

Expected: FAIL with "Cannot find module '@/app/api/admin/orgs/route'".

- [ ] **Step 3: Implement the GET handler**

Create `app/api/admin/orgs/route.ts`:

```ts
/**
 * Super-admin org management.
 *
 * GET   — list every organization with status + user count.
 * POST  — create a new manual organization through `createOrganization`.
 *
 * Both gated by `apiRoute({ superAdmin: true })`. Non-super-admins get a 403
 * with code `FORBIDDEN`.
 */
import { z } from "zod";
import { apiRoute } from "@/lib/api/route";
import { createOrganization } from "@/lib/onboarding/createOrganization";
import { prisma } from "@/lib/prisma";

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEndsAt: true,
  createdAt: true,
  _count: { select: { users: true } },
} as const;

export const GET = apiRoute({ superAdmin: true }, async () => {
  const rows = await prisma.organization.findMany({
    select: ORG_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus,
    trialEndsAt: r.trialEndsAt,
    currentPeriodEndsAt: r.currentPeriodEndsAt,
    createdAt: r.createdAt,
    userCount: r._count.users,
  }));
});

const CreateOrgBody = z
  .object({
    orgName: z.string().trim().min(1).max(120),
    adminName: z.string().trim().min(1).max(100),
    adminEmail: z.string().email().toLowerCase().max(254),
    adminPassword: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { superAdmin: true, input: CreateOrgBody, status: 201 },
  async ({ input }) => {
    const result = await createOrganization({
      org: { name: input.orgName },
      admin: {
        name: input.adminName,
        email: input.adminEmail,
        password: input.adminPassword,
      },
      billing: { kind: "manual" },
    });
    return {
      orgId: result.orgId,
      slug: result.slug,
      adminEmail: input.adminEmail,
    };
  }
);
```

(The POST handler is here too because creating a half-file and writing it again in the next task would be churn. The POST test is added in Task 5.)

- [ ] **Step 4: Run the GET tests to verify they pass**

Run: `npx vitest run __tests__/api/admin-orgs.test.ts`

Expected: the 3 GET tests pass.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add app/api/admin/orgs/route.ts __tests__/api/admin-orgs.test.ts
git commit -m "feat(admin): GET /api/admin/orgs lists orgs with user count"
```

---

## Task 5: `POST /api/admin/orgs` — create org

**Files:**
- Modify: `__tests__/api/admin-orgs.test.ts`

The route handler was already added in Task 4. This task adds the test coverage.

- [ ] **Step 1: Extend imports at the top of the file**

Open `__tests__/api/admin-orgs.test.ts`. Update the import section to add `POST`, `EmailTakenError`, and `createOrganization` alongside the existing imports. After the change, the imports at the top of the file should include (showing only the relevant lines):

```ts
import { GET, POST } from "@/app/api/admin/orgs/route";
import { EmailTakenError } from "@/lib/api/errors";
import { createOrganization } from "@/lib/onboarding/createOrganization";
```

(`prisma`, `auth`, and the `_helpers` imports stay exactly as they are.)

- [ ] **Step 2: Append the POST tests**

Append to the bottom of `__tests__/api/admin-orgs.test.ts` (after the GET `describe` block):

```ts
const mockCreate = vi.mocked(createOrganization);

describe("POST /api/admin/orgs", () => {
  const validBody = {
    orgName: "Pinecrest Flooring",
    adminName: "Pat Pine",
    adminEmail: "Pat@Pinecrest.test",
    adminPassword: "supersecret1",
  };

  it("401 when no session", async () => {
    process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST", "http://localhost/", validBody), noParams);
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but not super-admin", async () => {
    asNormalAdmin();
    const res = await POST(makeRequest("POST", "http://localhost/", validBody), noParams);
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400 when validation fails", async () => {
    asSuperAdmin();
    const res = await POST(
      makeRequest("POST", "http://localhost/", {
        orgName: "",
        adminName: "Pat",
        adminEmail: "not-an-email",
        adminPassword: "short",
      }),
      noParams
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("201 and returns the new org id + slug + email on success", async () => {
    asSuperAdmin();
    mockCreate.mockResolvedValueOnce({
      orgId: "org-new",
      adminUserId: "user-new",
      slug: "pinecrest-flooring",
    });
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      orgId: "org-new",
      slug: "pinecrest-flooring",
      adminEmail: "pat@pinecrest.test",
    });
    expect(mockCreate).toHaveBeenCalledWith({
      org: { name: "Pinecrest Flooring" },
      admin: {
        name: "Pat Pine",
        email: "pat@pinecrest.test",
        password: "supersecret1",
      },
      billing: { kind: "manual" },
    });
  });

  it("translates EmailTakenError to 409 EMAIL_TAKEN", async () => {
    asSuperAdmin();
    mockCreate.mockRejectedValueOnce(new EmailTakenError());
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMAIL_TAKEN");
  });

  it("translates unexpected errors to 500 INTERNAL", async () => {
    asSuperAdmin();
    mockCreate.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(
      makeRequest("POST", "http://localhost/", validBody),
      noParams
    );
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run __tests__/api/admin-orgs.test.ts`

Expected: all GET + POST tests pass on the first run — the route was already implemented in Task 4.

- [ ] **Step 4: Commit**

```bash
git add __tests__/api/admin-orgs.test.ts
git commit -m "test(admin): cover POST /api/admin/orgs (auth, validation, errors)"
```

---

## Task 6: `(admin)` route group + super-admin layout gate

**Files:**
- Create: `app/(admin)/layout.tsx`

The `(admin)` group keeps super-admin pages physically isolated from `(app)`. The layout reuses the same chrome (AppNav + Providers) so the operator can navigate seamlessly, but performs a server-side super-admin check before rendering children.

- [ ] **Step 1: Implement the layout**

Create `app/(admin)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppNav } from "@/components/ui/AppNav";
import { Providers } from "@/components/ui/Providers";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Admin · SqFt" };

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  const allowed = isSuperAdmin(session.user.email);

  return (
    <Providers>
      <div className="flex flex-col h-[100dvh] overflow-hidden">
        <AppNav />
        <main className="order-2 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1200px] mx-auto px-[14px] md:px-8 py-8 pt-4 md:pt-8">
            {allowed ? children : <ForbiddenPanel />}
          </div>
        </main>
      </div>
    </Providers>
  );
}

function ForbiddenPanel() {
  return (
    <div className="max-w-[520px] mx-auto mt-16 border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-6 text-center">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.08em] uppercase text-[var(--muted)] mb-2">
        403 · Forbidden
      </div>
      <h1 className="text-[20px] font-[700] tracking-[-0.02em] mb-1">
        Super-admin only
      </h1>
      <p className="text-[13px] text-[var(--muted)]">
        This page is reserved for SqFt operators. If you believe you should have
        access, your email needs to be added to{" "}
        <code className="font-[var(--font-mono)]">SUPER_ADMIN_EMAILS</code>.
      </p>
    </div>
  );
}
```

Notes:
- `requireSession()` already throws `UnauthorizedError` for unauthenticated visitors, which Next renders via the global error boundary. Auth-redirect for unauthenticated users still flows through NextAuth middleware (existing behavior).
- The 403 message renders inline — no `redirect()`, no flicker, no loop.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/layout.tsx
git commit -m "feat(admin): (admin) route group with super-admin layout gate"
```

---

## Task 7: Shared types + TanStack hooks for admin orgs

**Files:**
- Create: `components/admin/orgs/types.ts`
- Create: `lib/hooks/useAdminOrgs.ts`

- [ ] **Step 1: Define the types**

Create `components/admin/orgs/types.ts`:

```ts
export type SubscriptionStatus =
  | "manual"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled";

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  createdAt: string;
  userCount: number;
};

export type CreateAdminOrgInput = {
  orgName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export type CreateAdminOrgResult = {
  orgId: string;
  slug: string;
  adminEmail: string;
};
```

- [ ] **Step 2: Implement the TanStack hooks**

Create `lib/hooks/useAdminOrgs.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminOrgRow,
  CreateAdminOrgInput,
  CreateAdminOrgResult,
} from "@/components/admin/orgs/types";
import { readApiError } from "@/lib/api/errors";

const ADMIN_ORGS_KEY = ["admin", "orgs"] as const;

export function useListAdminOrgs(initial: AdminOrgRow[]) {
  return useQuery({
    queryKey: ADMIN_ORGS_KEY,
    initialData: initial,
    queryFn: async (): Promise<AdminOrgRow[]> => {
      const res = await fetch("/api/admin/orgs");
      if (!res.ok) {
        const err = await readApiError(res, "Failed to load orgs");
        throw err;
      }
      return (await res.json()) as AdminOrgRow[];
    },
  });
}

export function useCreateAdminOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateAdminOrgInput
    ): Promise<CreateAdminOrgResult> => {
      const res = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await readApiError(res, "Failed to create organization");
        throw err;
      }
      return (await res.json()) as CreateAdminOrgResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_ORGS_KEY }),
  });
}
```

- [ ] **Step 3: Lint, typecheck, commit**

```bash
npm run lint:ci
npm run typecheck
git add components/admin/orgs/types.ts lib/hooks/useAdminOrgs.ts
git commit -m "feat(admin): client types + hooks for admin orgs"
```

---

## Task 8: `OrgsTable` component

**Files:**
- Create: `components/admin/orgs/OrgsTable.tsx`

- [ ] **Step 1: Implement the table**

Create `components/admin/orgs/OrgsTable.tsx`:

```tsx
"use client";

import type { AdminOrgRow, SubscriptionStatus } from "./types";

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  manual: "bg-[var(--surface-2)] text-[var(--muted)]",
  trialing: "bg-[#fff4d6] text-[#8a6a00]",
  active: "bg-[#dff6e3] text-[#15703a]",
  past_due: "bg-[#fde0e0] text-[#a02020]",
  unpaid: "bg-[#fde0e0] text-[#a02020]",
  canceled: "bg-[var(--surface-2)] text-[var(--muted)] line-through",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OrgsTable({ rows }: { rows: AdminOrgRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-6 text-center text-[13px] text-[var(--muted)]">
        No organizations yet.
      </div>
    );
  }
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] overflow-hidden">
      <div className="grid grid-cols-[1.5fr_120px_160px_140px_80px] gap-3 px-4 py-2 text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] border-b border-[var(--line)]">
        <div>Org</div>
        <div>Status</div>
        <div>Renews / Trial ends</div>
        <div>Created</div>
        <div className="text-right">Users</div>
      </div>
      {rows.map((row) => {
        const renewal = row.currentPeriodEndsAt ?? row.trialEndsAt;
        return (
          <div
            key={row.id}
            className="grid grid-cols-[1.5fr_120px_160px_140px_80px] gap-3 px-4 py-3 text-[13px] items-center border-b border-[var(--line)] last:border-b-0"
          >
            <div>
              <div className="font-[500]">{row.name}</div>
              <div className="text-[11px] text-[var(--muted)] font-[var(--font-mono)]">
                {row.slug}
              </div>
            </div>
            <div>
              <span
                className={`inline-block text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase px-2 py-[2px] rounded-[4px] ${STATUS_STYLES[row.subscriptionStatus]}`}
              >
                {row.subscriptionStatus}
              </span>
            </div>
            <div className="text-[var(--muted)]">{formatDate(renewal)}</div>
            <div className="text-[var(--muted)]">{formatDate(row.createdAt)}</div>
            <div className="text-right font-[var(--font-mono)]">{row.userCount}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint and commit**

```bash
npm run lint:ci
git add components/admin/orgs/OrgsTable.tsx
git commit -m "feat(admin): OrgsTable with status pills and user count"
```

---

## Task 9: `CreateOrgForm` component (with suggest-password + success card)

**Files:**
- Create: `components/admin/orgs/CreateOrgForm.tsx`

- [ ] **Step 1: Implement the form**

Create `components/admin/orgs/CreateOrgForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useCreateAdminOrg } from "@/lib/hooks/useAdminOrgs";
import type { CreateAdminOrgResult } from "./types";

function suggestPassword(): string {
  const alphabet =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const cryptoObj =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto
      : null;
  if (cryptoObj) {
    const buf = new Uint32Array(16);
    cryptoObj.getRandomValues(buf);
    for (const n of buf) out.push(alphabet[n % alphabet.length] ?? "x");
  } else {
    for (let i = 0; i < 16; i++) {
      out.push(alphabet[Math.floor(Math.random() * alphabet.length)] ?? "x");
    }
  }
  return out.join("");
}

export function CreateOrgForm({
  onCreated,
}: {
  onCreated: (result: CreateAdminOrgResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<
    | (CreateAdminOrgResult & { password: string })
    | null
  >(null);
  const mutation = useCreateAdminOrg();

  function reset() {
    setOrgName("");
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate(
      { orgName, adminName, adminEmail, adminPassword },
      {
        onSuccess: (result) => {
          setCreated({ ...result, password: adminPassword });
          onCreated(result);
          reset();
        },
        onError: (err: unknown) => {
          const msg =
            typeof err === "object" && err && "message" in err
              ? String((err as { message: string }).message)
              : "Failed to create organization";
          setError(msg);
        },
      }
    );
  }

  if (created) {
    return (
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3">
        <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)]">
          Org created · hand these off out-of-band
        </div>
        <Credentials label="Org" value={created.slug} />
        <Credentials label="Admin email" value={created.adminEmail} />
        <Credentials label="Temporary password" value={created.password} mono />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setOpen(false);
            }}
            className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)]"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setOpen(true);
            }}
            className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 rounded-[6px] bg-[var(--ink)] text-[var(--bg)]"
          >
            Create another
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      >
        + New organization
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3"
    >
      <Field label="Organization name">
        <input
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Admin name">
        <input
          required
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Admin email">
        <input
          required
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Temporary password">
        <div className="flex gap-2">
          <input
            required
            minLength={8}
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="flex-1 text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px] font-[var(--font-mono)]"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setAdminPassword(suggestPassword())}
            className="text-[11px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[5px] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
          >
            Suggest
          </button>
        </div>
      </Field>
      {error && <div className="text-[12px] text-[var(--accent)]">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 rounded-[6px] bg-[var(--ink)] text-[var(--bg)] disabled:opacity-50"
        >
          {mutation.isPending ? "Creating…" : "Create org"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children contains the control
    <label className="block">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function Credentials({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)]">
        {label}
      </div>
      <div
        className={`text-[13px] ${mono ? "font-[var(--font-mono)]" : ""} break-all`}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="text-[10px] font-[var(--font-mono)] tracking-[.04em] uppercase px-2 py-1 border border-[var(--line)] rounded-[4px] bg-[var(--surface)]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Lint, typecheck, commit**

```bash
npm run lint:ci
npm run typecheck
git add components/admin/orgs/CreateOrgForm.tsx
git commit -m "feat(admin): CreateOrgForm with suggest password + success credentials card"
```

---

## Task 10: `AdminOrgsView` + server page

**Files:**
- Create: `components/admin/orgs/AdminOrgsView.tsx`
- Create: `app/(admin)/admin/orgs/page.tsx`

- [ ] **Step 1: Implement the view (client component)**

Create `components/admin/orgs/AdminOrgsView.tsx`:

```tsx
"use client";

import { CreateOrgForm } from "./CreateOrgForm";
import { OrgsTable } from "./OrgsTable";
import type { AdminOrgRow } from "./types";
import { useListAdminOrgs } from "@/lib/hooks/useAdminOrgs";

export function AdminOrgsView({ initial }: { initial: AdminOrgRow[] }) {
  const query = useListAdminOrgs(initial);
  const rows = query.data ?? initial;

  return (
    <div className="max-w-[960px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Organizations
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Every tenant on the platform. Create manual orgs for pilots and demos.
      </p>

      <div className="mb-6">
        <OrgsTable rows={rows} />
      </div>

      <CreateOrgForm
        onCreated={() => {
          // Hook invalidates the query; the table refreshes automatically.
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Implement the server page**

Create `app/(admin)/admin/orgs/page.tsx`:

```tsx
import { AdminOrgsView } from "@/components/admin/orgs/AdminOrgsView";
import type { AdminOrgRow, SubscriptionStatus } from "@/components/admin/orgs/types";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Organizations · Admin · SqFt" };

export default async function AdminOrgsPage() {
  // The (admin) layout has already gated this page on isSuperAdmin. We can
  // safely hydrate the initial data here.
  const rows = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEndsAt: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const initial: AdminOrgRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus as SubscriptionStatus,
    trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: r.currentPeriodEndsAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    userCount: r._count.users,
  }));

  return <AdminOrgsView initial={initial} />;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint:ci`

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/orgs/AdminOrgsView.tsx app/(admin)/admin/orgs/page.tsx
git commit -m "feat(admin): /admin/orgs page + AdminOrgsView wiring"
```

---

## Task 11: Document `SUPER_ADMIN_EMAILS` in `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append the new variable**

Open `.env.example`. Append to the end of the file (preserve a trailing blank line):

```bash
# Comma-separated list of emails allowed to access /admin/orgs.
# Membership is enforced by lib/auth/superAdmin.ts; changing this requires
# a redeploy. Leave unset in environments that should expose no admin UI.
SUPER_ADMIN_EMAILS=""
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document SUPER_ADMIN_EMAILS"
```

---

## Task 12: Manual smoke check

**Files:** none — verification only. This is the user-facing contract for Phase 2; do NOT skip it.

- [ ] **Step 1: Add yourself to the allowlist locally**

Open `.env`. Append:

```bash
SUPER_ADMIN_EMAILS="demo@sqft.dev"
```

The seed-created `demo@sqft.dev` user already has role `admin`; the env entry adds the cross-org super-admin capability.

- [ ] **Step 2: Run the dev server**

Run: `npm run dev` (background terminal).

- [ ] **Step 3: Verify the gate denies non-super-admins**

1. In a browser, sign in as `lead@sqft.dev` / `demo1234`.
2. Visit `http://localhost:3000/admin/orgs`.
3. Expected: the inline "403 · Forbidden · Super-admin only" panel renders. The page is the same admin shell — no redirect loop, no flash of the table.
4. Sign out.

- [ ] **Step 4: Verify the happy path for super-admin**

1. Sign in as `demo@sqft.dev` / `demo1234`.
2. Visit `http://localhost:3000/admin/orgs`.
3. Expected: the orgs table shows `Johnson Flooring Co.` and `Other Floors Co.` with status `manual`. User counts: Johnson has 3 (admin + lead + crew), Other has 1.
4. Click **+ New organization**.
5. Fill in: org name = `Pinecrest Pilot`, admin name = `Pat Pilot`, admin email = `pat@pinecrest.test`, click **Suggest** to fill a strong password.
6. Click **Create org**.
7. Expected: form replaced by a credentials card showing the slug, email, and password with copy buttons.
8. Click **Done**. The new row appears in the table.

- [ ] **Step 5: Verify the new admin can log in and sees zero cross-org data**

1. Open a private/incognito window.
2. Sign in as `pat@pinecrest.test` with the temporary password from Step 4.
3. Expected: dashboard loads. Customers list is empty. Estimates list is empty. Line-item templates show the 6 seeded defaults (LVP — Mohawk RevWood, etc.).
4. Sign out.

- [ ] **Step 6: Stop the dev server, commit any `.env` cleanup**

If you only added the `SUPER_ADMIN_EMAILS` line to a local `.env` (not committed), no commit is needed. `.env` is gitignored.

Stop the dev server.

---

## Task 13: Full test sweep

**Files:** none — verification only.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`

Expected: every test passes. Specifically watch for:
- `__tests__/lib/auth/superAdmin.test.ts` — 6 passes
- `__tests__/lib/api/route.superAdmin.test.ts` — 4 passes
- `__tests__/api/admin-orgs.test.ts` — GET (3) + POST (6) passes
- Existing tests untouched

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`

Expected: every spec passes. The admin UI spec is intentionally deferred to Phase 3 (it depends on the `E2E_TEST_MODE` fixture API), so no new e2e coverage is added here — but the existing suite must remain green.

If a spec fails: do NOT dismiss as a flake. The `apiRoute` change touched the shared request wrapper; read the failing spec for stack hints. Fix forward.

- [ ] **Step 3: Lint**

Run: `npm run lint:ci`

Expected: zero errors.

- [ ] **Step 4: Final commit (if any fixes were needed)**

If Steps 1–3 surfaced issues, fix them and commit in a focused commit:

```bash
git add <files>
git commit -m "fix(admin): <what you fixed>"
```

If everything was green, no commit needed here.

---

## Spec Coverage Check

| Spec section | Plan task |
| --- | --- |
| `lib/auth/superAdmin.ts` + `apiRoute({ superAdmin: true })` option | Tasks 2, 3 |
| `app/api/admin/orgs/route.ts` (GET + POST) | Tasks 4, 5 |
| `app/(admin)/layout.tsx` server-side super-admin check, 403 on miss | Task 6 |
| `app/(admin)/admin/orgs/page.tsx` server component | Task 10 |
| Existing-orgs table: name, status pill, created date, user count | Task 8 |
| Create form: org name, admin name, admin email, temp password + "suggest" | Task 9 |
| Success state shows credentials once with copy button, no email sent | Task 9 |
| Vitest: super-admin allow, non-super-admin deny, validation errors, happy path | Tasks 3, 4, 5 |
| Playwright spec | Deferred to Phase 3 (intentional, per spec) |
| `ForbiddenError` (403 FORBIDDEN) | Task 1 |
| `SUPER_ADMIN_EMAILS` documented | Task 11 |
| Manual smoke: super-admin sign-in, create org, login as new admin, tenant isolation | Task 12 |

Out of scope (Phase 3+): `E2E_TEST_MODE` env-gated test routes, Playwright fixtures rewrite, Stripe integration, paywall guard activation, `/settings/billing`, `/signup`.

---

## Acceptance Criteria

When this plan is fully executed:

1. `lib/auth/superAdmin.ts` exists with `isSuperAdmin(email)` driven by `SUPER_ADMIN_EMAILS`.
2. `apiRoute({ superAdmin: true })` works: 401 unauthenticated, 403 (`FORBIDDEN`) for non-super-admins, runs the handler with `orgId` populated for super-admins.
3. `GET /api/admin/orgs` returns every org with `id, name, slug, subscriptionStatus, trialEndsAt, currentPeriodEndsAt, createdAt, userCount`, newest first.
4. `POST /api/admin/orgs` calls `createOrganization({ billing: { kind: "manual" }})` and returns `{ orgId, slug, adminEmail }` with status 201.
5. `/admin/orgs` page renders an orgs table + a collapsible create form. Non-super-admins get an inline 403 panel — no redirect, no flicker.
6. Adding an email to `SUPER_ADMIN_EMAILS`, signing in, and creating an org through the form yields a working login for the new admin with zero cross-org data visible.
7. `npm test` and `npm run test:e2e` both pass.
8. `biome ci .` produces zero errors.

Phase 2 is then complete. Phase 3's plan (E2E test orgs + fixture rewrite + admin-orgs Playwright spec) can be written and executed on top of this foundation.
