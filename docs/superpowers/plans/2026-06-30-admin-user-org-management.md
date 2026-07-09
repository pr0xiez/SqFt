# Super-admin User & Org Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a SqFt super-admin add and manage users in any organization from the `/admin` area, add a minimal `/admin` dashboard, and expose a super-admin-only "Admin" link in the app nav.

**Architecture:** New super-admin API routes under `/api/admin/orgs/[orgId]/users` reuse the already-org-parameterized `userRepo` functions (passing the *target* org from the URL, not the caller's session org). New `/admin` dashboard + `/admin/orgs/[orgId]` detail pages are server components that seed react-query hooks. Super-admin status is surfaced onto the NextAuth session so the client nav can gate an "Admin" link.

**Tech Stack:** Next.js (App Router, this repo's fork — see `AGENTS.md`), Prisma/Postgres, NextAuth (JWT), react-query, Zod, bcryptjs, Biome, Vitest (+ @testing-library/react, jsdom), Playwright.

## Global Constraints

- **Lint must pass before every commit:** `npm run lint:ci` (`biome ci .`); auto-fix with `npm run lint:fix`. (Biome style: double quotes, semicolons, organized imports.)
- **No schema change** — do not touch `prisma/schema.prisma`, migrations, or `prisma/seed.ts`. "Add a user to an org" is a plain `User` row insert with that `orgId`.
- **Target org comes from the URL param**, never the caller's session org. In admin route handlers use `params.orgId` (cast: `const { orgId } = params as { orgId: string }`); do **not** use the handler's `orgId` argument (that is the operator's own org).
- **Reuse `userRepo` functions unchanged** for all member reads/writes; they already filter on `{ id, orgId }` and already throw `LastAdminError` to protect an org's last admin.
- **Error codes (existing, do not invent new ones):** `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_FAILED` 400, `EMAIL_TAKEN` 409, `LAST_ADMIN` **400** (class `LastAdminError`).
- **Repo integration tests** gate on the real DB: `describe.skipIf(!process.env.VITEST_DB_AVAILABLE)`.
- **Component tests** need jsdom: first line `// @vitest-environment jsdom`; mock hooks (not `fetch`), mirroring `__tests__/components/quickCreate/QuickCreatePanels.test.tsx`.
- **E2E** runs `--workers=1` locally; note that this worktree may have incomplete `node_modules` (E2E/DB suites can't run here — they run in CI).
- **Spec:** `docs/superpowers/specs/2026-06-30-admin-user-org-management-design.md`.

---

## File Structure

**New files**
- `lib/repositories/orgRepo.ts` — `getOrgById(id)` (org summary for the detail page + route existence checks).
- `lib/passwords.ts` — shared `suggestPassword()` (deduped from `CreateOrgForm`).
- `app/api/admin/orgs/[orgId]/users/route.ts` — `GET` (list members) + `POST` (create user).
- `app/api/admin/orgs/[orgId]/users/[userId]/route.ts` — `PATCH` (role / name / title / archived).
- `lib/hooks/useAdminOrgMembers.ts` — list/create/update react-query hooks + input types.
- `app/(admin)/admin/page.tsx` — minimal dashboard (counts + link).
- `app/(admin)/admin/orgs/[orgId]/page.tsx` — org detail page (server component).
- `components/admin/orgs/detail/AdminOrgDetailView.tsx` — org header + members section.
- `components/admin/orgs/detail/AdminMemberRow.tsx` — role select + archive/restore row.
- `components/admin/orgs/detail/AddAdminUserForm.tsx` — add-user form + credential reveal.

**Modified files**
- `lib/repositories/index.ts` — export `orgRepo`.
- `lib/auth.ts` — session type augmentation + set `session.user.isSuperAdmin`.
- `lib/nav/items.ts` — add `"admin"` to `IconId`, export `ADMIN_ITEM`.
- `components/ui/nav-icons.tsx` — add the `admin` glyph.
- `components/ui/NavMenu.tsx` — `isSuperAdmin` prop; render `ADMIN_ITEM`.
- `components/ui/SideNav.tsx` — pass `isSuperAdmin`; add to collapsed `IconRail`.
- `components/ui/NavDrawer.tsx` — `isSuperAdmin` prop passthrough.
- `components/ui/AppNav.tsx` — compute `isSuperAdmin`, pass to `NavDrawer`.
- `components/admin/orgs/CreateOrgForm.tsx` — use shared `suggestPassword`.
- `AGENTS.md`, `CONTEXT.md` — docs.
- `docs/superpowers/specs/2026-06-30-admin-user-org-management-design.md` — fix `LAST_ADMIN` status in the error table (400, not 409).

**New test files**
- `__tests__/repositories/orgRepo.test.ts`
- `__tests__/api/admin-org-users.test.ts`
- `__tests__/lib/passwords.test.ts`
- `tests/e2e/admin-org-users.spec.ts`

**Extended test files**
- `__tests__/lib/nav/items.test.ts`
- `__tests__/components/ui/NavMenu.test.tsx`

---

## Task 1: `orgRepo.getOrgById`

**Files:**
- Create: `lib/repositories/orgRepo.ts`
- Modify: `lib/repositories/index.ts`
- Test: `__tests__/repositories/orgRepo.test.ts`

**Interfaces:**
- Produces: `getOrgById(id: string): Promise<OrgSummary | null>` where
  `OrgSummary = { id: string; name: string; slug: string; subscriptionStatus: string; createdAt: Date }`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/orgRepo.test.ts` (integration; mirrors `userRepo.test.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrgById } from "@/lib/repositories/orgRepo";

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("orgRepo.getOrgById", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Org Repo Co", slug: `orgrepo-${Date.now()}` },
    });
    orgId = org.id;
  });
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it("returns the org summary for a real id", async () => {
    const org = await getOrgById(orgId);
    expect(org).not.toBeNull();
    expect(org?.name).toBe("Org Repo Co");
    expect(org?.slug).toContain("orgrepo-");
    expect(typeof org?.subscriptionStatus).toBe("string");
    expect(org?.createdAt).toBeInstanceOf(Date);
  });

  it("returns null for a missing id", async () => {
    expect(await getOrgById("does-not-exist")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/repositories/orgRepo.test.ts`
Expected: FAIL — `getOrgById` is not exported / module missing. (If no DB is available the suite is *skipped*, which is acceptable — it will run in CI; proceed by implementing.)

- [ ] **Step 3: Create the repo**

Create `lib/repositories/orgRepo.ts`:

```ts
import { prisma } from "@/lib/prisma";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  createdAt: Date;
};

/** Fetch a single org by id for the super-admin detail page / route checks. */
export function getOrgById(id: string): Promise<OrgSummary | null> {
  return prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      createdAt: true,
    },
  });
}
```

- [ ] **Step 4: Export from the barrel**

Modify `lib/repositories/index.ts` — add in alphabetical position (after `./locationRepo`):

```ts
export * from "./orgRepo";
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run __tests__/repositories/orgRepo.test.ts`
Expected: PASS (or SKIPPED without a DB).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Lint + commit**

```bash
npm run lint:ci
git add lib/repositories/orgRepo.ts lib/repositories/index.ts __tests__/repositories/orgRepo.test.ts
git commit -m "feat(admin): orgRepo.getOrgById for org detail"
```

---

## Task 2: Admin org-users collection route (GET + POST)

**Files:**
- Create: `app/api/admin/orgs/[orgId]/users/route.ts`
- Test: `__tests__/api/admin-org-users.test.ts`

**Interfaces:**
- Consumes: `getOrgById` (Task 1); `listUsers`, `createUser`, `findByEmail` from `@/lib/repositories`.
- Produces: `GET`/`POST` route handlers. `GET` → `UserRow[]`. `POST` body `{ name, email, role, password }` → `UserRow` (201).

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/admin-org-users.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/repositories", () => ({
  getOrgById: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  findByEmail: vi.fn(),
  updateRole: vi.fn(),
  updateProfile: vi.fn(),
  setArchived: vi.fn(),
  findUserRow: vi.fn(),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed-pw") } }));
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/admin/orgs/[orgId]/users/route";
import { auth } from "@/lib/auth";
import * as repos from "@/lib/repositories";
import { makeRequest, params } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const p = params({ orgId: "org1" });

function asSuperAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue({
    user: { id: "u1", orgId: "operator-org", role: "admin", email: "boss@sqft.dev" },
    // biome-ignore lint/suspicious/noExplicitAny: test stub
  } as any);
}
function asNormalAdmin() {
  process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
  mockAuth.mockResolvedValue({
    user: { id: "u1", orgId: "operator-org", role: "admin", email: "regular@sqft.dev" },
    // biome-ignore lint/suspicious/noExplicitAny: test stub
  } as any);
}

const ORIGINAL = process.env.SUPER_ADMIN_EMAILS;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SUPER_ADMIN_EMAILS;
  else process.env.SUPER_ADMIN_EMAILS = ORIGINAL;
});

describe("GET /api/admin/orgs/[orgId]/users", () => {
  it("401 when no session", async () => {
    process.env.SUPER_ADMIN_EMAILS = "boss@sqft.dev";
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(401);
  });

  it("403 when not super-admin", async () => {
    asNormalAdmin();
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(403);
  });

  it("404 when the org does not exist", async () => {
    asSuperAdmin();
    vi.mocked(repos.getOrgById).mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(404);
    expect(repos.listUsers).not.toHaveBeenCalled();
  });

  it("lists the target org's members (incl. archived)", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.listUsers).mockResolvedValueOnce([{ id: "m1" }] as any);
    const res = await GET(makeRequest("GET"), p);
    expect(res.status).toBe(200);
    expect(repos.listUsers).toHaveBeenCalledWith("org1", { includeArchived: true });
  });
});

describe("POST /api/admin/orgs/[orgId]/users", () => {
  const body = { name: "New Hire", email: "New@Org.test", role: "crew", password: "supersecret1" };

  it("403 when not super-admin", async () => {
    asNormalAdmin();
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(403);
    expect(repos.createUser).not.toHaveBeenCalled();
  });

  it("404 when the org does not exist", async () => {
    asSuperAdmin();
    vi.mocked(repos.getOrgById).mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(404);
    expect(repos.createUser).not.toHaveBeenCalled();
  });

  it("400 on invalid body", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    const res = await POST(
      makeRequest("POST", "http://localhost/", { name: "", email: "x", role: "boss", password: "short" }),
      p
    );
    expect(res.status).toBe(400);
    expect(repos.createUser).not.toHaveBeenCalled();
  });

  it("409 EMAIL_TAKEN when the email exists", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.findByEmail).mockResolvedValueOnce({ id: "existing" } as any);
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EMAIL_TAKEN");
  });

  it("201 creates the user in the TARGET org with a hashed, lowercased email", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.getOrgById).mockResolvedValueOnce({ id: "org1" } as any);
    vi.mocked(repos.findByEmail).mockResolvedValueOnce(null);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.createUser).mockResolvedValueOnce({ id: "m2", email: "new@org.test" } as any);
    const res = await POST(makeRequest("POST", "http://localhost/", body), p);
    expect(res.status).toBe(201);
    expect(repos.createUser).toHaveBeenCalledWith("org1", {
      name: "New Hire",
      email: "new@org.test",
      role: "crew",
      password: "hashed-pw",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/api/admin-org-users.test.ts`
Expected: FAIL — cannot import from `@/app/api/admin/orgs/[orgId]/users/route`.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/orgs/[orgId]/users/route.ts`:

```ts
/**
 * Super-admin org member management (collection).
 *
 * GET  — list every member of the target org (incl. archived).
 * POST — create a new user in the target org.
 *
 * Gated by `apiRoute({ superAdmin: true })`. The target org is `params.orgId`
 * (from the URL), NOT the caller's session org.
 */
import bcrypt from "bcryptjs";
import { z } from "zod";
import { EmailTakenError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { createUser, findByEmail, getOrgById, listUsers } from "@/lib/repositories";

export const GET = apiRoute({ superAdmin: true }, async ({ params }) => {
  const { orgId } = params as { orgId: string };
  if (!(await getOrgById(orgId))) throw new NotFoundError("Organization not found");
  return listUsers(orgId, { includeArchived: true });
});

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().toLowerCase().max(254),
    role: z.enum(["admin", "lead", "crew"]),
    password: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { superAdmin: true, input: CreateBody, status: 201 },
  async ({ input, params }) => {
    const { orgId } = params as { orgId: string };
    if (!(await getOrgById(orgId))) throw new NotFoundError("Organization not found");
    if (await findByEmail(input.email)) throw new EmailTakenError();
    const password = await bcrypt.hash(input.password, 10);
    return createUser(orgId, {
      name: input.name,
      email: input.email,
      role: input.role,
      password,
    });
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/api/admin-org-users.test.ts`
Expected: PASS (GET + POST describe blocks).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add "app/api/admin/orgs/[orgId]/users/route.ts" __tests__/api/admin-org-users.test.ts
git commit -m "feat(admin): list + create org members via /api/admin/orgs/[orgId]/users"
```

---

## Task 3: Admin org-user item route (PATCH)

**Files:**
- Create: `app/api/admin/orgs/[orgId]/users/[userId]/route.ts`
- Test: `__tests__/api/admin-org-users.test.ts` (extend)

**Interfaces:**
- Consumes: `updateRole`, `updateProfile`, `setArchived`, `findUserRow` from `@/lib/repositories`.
- Produces: `PATCH` handler. Body `{ role?, name?, title?, archived? }` → `UserRow`. Uses `params.orgId` + `params.userId`.

- [ ] **Step 1: Write the failing test (append to the same file)**

Add to `__tests__/api/admin-org-users.test.ts` — extend the import line and append a describe block:

```ts
// update the route import line to also import PATCH:
import { PATCH } from "@/app/api/admin/orgs/[orgId]/users/[userId]/route";
import { LastAdminError } from "@/lib/api/errors";

const pu = params({ orgId: "org1", userId: "m1" });

describe("PATCH /api/admin/orgs/[orgId]/users/[userId]", () => {
  it("403 when not super-admin", async () => {
    asNormalAdmin();
    const res = await PATCH(makeRequest("PATCH", "http://localhost/", { role: "lead" }), pu);
    expect(res.status).toBe(403);
    expect(repos.updateRole).not.toHaveBeenCalled();
  });

  it("changes a role scoped to the URL org and returns the row", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.updateRole).mockResolvedValueOnce({ id: "m1", role: "lead" } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.findUserRow).mockResolvedValueOnce({ id: "m1", role: "lead" } as any);
    const res = await PATCH(makeRequest("PATCH", "http://localhost/", { role: "lead" }), pu);
    expect(res.status).toBe(200);
    expect(repos.updateRole).toHaveBeenCalledWith("m1", "org1", "lead");
  });

  it("404 when the user is not in that org", async () => {
    asSuperAdmin();
    vi.mocked(repos.updateRole).mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest("PATCH", "http://localhost/", { role: "lead" }), pu);
    expect(res.status).toBe(404);
  });

  it("archives a member", async () => {
    asSuperAdmin();
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.setArchived).mockResolvedValueOnce({ id: "m1", archived: true } as any);
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
    vi.mocked(repos.findUserRow).mockResolvedValueOnce({ id: "m1", archived: true } as any);
    const res = await PATCH(makeRequest("PATCH", "http://localhost/", { archived: true }), pu);
    expect(res.status).toBe(200);
    expect(repos.setArchived).toHaveBeenCalledWith("m1", "org1", true);
  });

  it("400 LAST_ADMIN when the repo refuses to demote the last admin", async () => {
    asSuperAdmin();
    vi.mocked(repos.updateRole).mockRejectedValueOnce(new LastAdminError());
    const res = await PATCH(makeRequest("PATCH", "http://localhost/", { role: "crew" }), pu);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("LAST_ADMIN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/api/admin-org-users.test.ts`
Expected: FAIL — cannot import `PATCH` from the item route.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/orgs/[orgId]/users/[userId]/route.ts`:

```ts
/**
 * Super-admin org member management (single user).
 *
 * PATCH — change role / name / title / archived for a user in the target org.
 * Gated by `apiRoute({ superAdmin: true })`. Scope is `params.orgId` (URL), so a
 * userId not in that org returns 404. `updateRole` / `setArchived` throw
 * LastAdminError (400 LAST_ADMIN) if the change would strip the org's last admin.
 * No "can't change yourself" guard: the operator acts on another org's users.
 */
import { z } from "zod";
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { findUserRow, setArchived, updateProfile, updateRole } from "@/lib/repositories";

const PatchBody = z
  .object({
    role: z.enum(["admin", "lead", "crew"]).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().max(100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const PATCH = apiRoute(
  { superAdmin: true, input: PatchBody },
  async ({ input, params }) => {
    const { orgId, userId } = params as { orgId: string; userId: string };

    if (input.role !== undefined) {
      if (!(await updateRole(userId, orgId, input.role))) {
        throw new NotFoundError();
      }
    }

    if (input.name !== undefined || input.title !== undefined) {
      const ok = await updateProfile(userId, orgId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      if (!ok) throw new NotFoundError();
    }

    if (input.archived !== undefined) {
      if (!(await setArchived(userId, orgId, input.archived))) {
        throw new NotFoundError();
      }
    }

    const row = await findUserRow(userId, orgId);
    if (!row) throw new NotFoundError();
    return row;
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/api/admin-org-users.test.ts`
Expected: PASS (all three describe blocks).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck
npm run lint:ci
git add "app/api/admin/orgs/[orgId]/users/[userId]/route.ts" __tests__/api/admin-org-users.test.ts
git commit -m "feat(admin): PATCH org member (role/profile/archive) via admin route"
```

---

## Task 4: Surface super-admin on the session

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Produces: `session.user.isSuperAdmin: boolean` on the NextAuth `Session` type and at runtime.

**Note:** The `session` callback is NextAuth config wiring (not an exported unit), so it has no isolated unit test — its effect is exercised by the nav component tests (Task 6, `isSuperAdmin` prop) and end-to-end (Task 9). Verification here is typecheck.

- [ ] **Step 1: Augment the Session type**

In `lib/auth.ts`, add `isSuperAdmin: boolean` to the `Session["user"]` augmentation:

```ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      orgId: string;
      role: string;
      isSuperAdmin: boolean;
    };
  }
  interface User {
    orgId: string;
    role: string;
  }
}
```

- [ ] **Step 2: Import the gate and set the flag in the session callback**

In `lib/auth.ts`, add the import (after the existing imports):

```ts
import { isSuperAdmin } from "@/lib/auth/superAdmin";
```

Then in the `session` callback, set the flag (runs server-side, so `process.env.SUPER_ADMIN_EMAILS` is available; `session.user.email` is already populated by NextAuth from the token):

```ts
    async session({ session, token }) {
      if (token) {
        if (typeof token.orgId !== "string" || typeof token.role !== "string") {
          throw new Error("Malformed JWT: orgId and role must be strings");
        }
        session.user.id = token.sub ?? "";
        session.user.orgId = token.orgId;
        session.user.role = token.role;
      }
      session.user.isSuperAdmin = isSuperAdmin(session.user.email);
      return session;
    },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Lint + commit**

```bash
npm run lint:ci
git add lib/auth.ts
git commit -m "feat(auth): expose isSuperAdmin on the session"
```

---

## Task 5: Nav data — `ADMIN_ITEM` + admin icon

**Files:**
- Modify: `lib/nav/items.ts`
- Modify: `components/ui/nav-icons.tsx`
- Test: `__tests__/lib/nav/items.test.ts` (extend)

**Interfaces:**
- Produces: `ADMIN_ITEM: NavItem` (`href: "/admin"`, `label: "Admin"`, `icon: "admin"`); `IconId` now includes `"admin"`.

- [ ] **Step 1: Write the failing test (append)**

Append to `__tests__/lib/nav/items.test.ts` (and add `ADMIN_ITEM` to the existing import from `@/lib/nav/items`):

```ts
describe("ADMIN_ITEM", () => {
  it("points at /admin with the admin icon", () => {
    expect(ADMIN_ITEM.href).toBe("/admin");
    expect(ADMIN_ITEM.label).toBe("Admin");
    expect(ADMIN_ITEM.icon).toBe("admin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/nav/items.test.ts`
Expected: FAIL — `ADMIN_ITEM` is not exported.

- [ ] **Step 3: Add the icon id and the export**

In `lib/nav/items.ts`, add `"admin"` to the `IconId` union:

```ts
export type IconId =
  | "dashboard"
  | "customers"
  | "siteMeasures"
  | "estimates"
  | "invoices"
  | "myschedule"
  | "scheduleManager"
  | "settings"
  | "admin"
  | "more";
```

And add the export next to `SETTINGS_ITEM`:

```ts
/**
 * Super-admin console entry. Gated on `session.user.isSuperAdmin` at render time
 * (NOT by role) — `minRole` is only here to satisfy the `NavItem` shape and is
 * never used to filter this item.
 */
export const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: "admin",
  minRole: "admin",
};
```

- [ ] **Step 4: Add the glyph (required — `paths` is exhaustive over `IconId`)**

In `components/ui/nav-icons.tsx`, add an `admin` entry to the `paths` record (a shield with a check):

```tsx
    admin: (
      <>
        <path d="M12 3l7 3v5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3z" />
        <path d="M9.2 12l2 2 3.6-3.8" />
      </>
    ),
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run __tests__/lib/nav/items.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors (adding `"admin"` to `IconId` forces the glyph, which now exists).

- [ ] **Step 6: Lint + commit**

```bash
npm run lint:ci
git add lib/nav/items.ts components/ui/nav-icons.tsx __tests__/lib/nav/items.test.ts
git commit -m "feat(nav): ADMIN_ITEM + admin icon"
```

---

## Task 6: Nav rendering — show "Admin" to super-admins

**Files:**
- Modify: `components/ui/NavMenu.tsx`
- Modify: `components/ui/SideNav.tsx`
- Modify: `components/ui/NavDrawer.tsx`
- Modify: `components/ui/AppNav.tsx`
- Test: `__tests__/components/ui/NavMenu.test.tsx` (extend)

**Interfaces:**
- Consumes: `ADMIN_ITEM` (Task 5); `session.user.isSuperAdmin` (Task 4).
- Produces: `NavMenu` gains `isSuperAdmin?: boolean`; `NavDrawer` gains `isSuperAdmin: boolean`.

- [ ] **Step 1: Write the failing tests (append)**

Append to `__tests__/components/ui/NavMenu.test.tsx`:

```tsx
it("hides Admin from a non-super-admin", () => {
  // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
  render(<NavMenu role="admin" pathname="/" />);
  expect(screen.queryByText("Admin")).not.toBeInTheDocument();
});

it("shows Admin to a super-admin", () => {
  // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
  render(<NavMenu role="admin" pathname="/" isSuperAdmin />);
  expect(screen.getByRole("link", { name: /Admin/ })).toHaveAttribute("href", "/admin");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/ui/NavMenu.test.tsx`
Expected: FAIL — the "shows Admin" test can't find the Admin link.

- [ ] **Step 3: Update `NavMenu`**

In `components/ui/NavMenu.tsx`: import `ADMIN_ITEM`, add the prop, and render it in the footer. Replace the import block and the footer:

```tsx
import {
  ADMIN_ITEM,
  canSeeSettings,
  isItemActive,
  type NavItem,
  navGroupsFor,
  SETTINGS_ITEM,
} from "@/lib/nav/items";

export function NavMenu({
  role,
  pathname,
  onNavigate,
  isSuperAdmin = false,
}: {
  role: string;
  pathname: string;
  onNavigate?: () => void;
  isSuperAdmin?: boolean;
}) {
```

Replace the footer block (the `{canSeeSettings(role) && (...)}` section) with:

```tsx
      {(canSeeSettings(role) || isSuperAdmin) && (
        <div className="mt-2 pt-2 border-t border-[var(--line)]">
          {canSeeSettings(role) && <Row item={SETTINGS_ITEM} />}
          {isSuperAdmin && <Row item={ADMIN_ITEM} />}
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/ui/NavMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Thread `isSuperAdmin` through `SideNav`**

In `components/ui/SideNav.tsx`: import `ADMIN_ITEM`, read the flag, pass it to `NavMenu`, and extend `IconRail`.

Add `ADMIN_ITEM` to the items import:

```tsx
import {
  ADMIN_ITEM,
  canSeeSettings,
  isItemActive,
  navGroupsFor,
  SETTINGS_ITEM,
} from "@/lib/nav/items";
```

Compute the flag in the component body (near `const role = ...`):

```tsx
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
```

Pass it to both nav renders:

```tsx
        {collapsed ? (
          <IconRail role={role} pathname={pathname} isSuperAdmin={isSuperAdmin} />
        ) : (
          <NavMenu role={role} pathname={pathname} isSuperAdmin={isSuperAdmin} />
        )}
```

Update the `IconRail` signature + item list:

```tsx
function IconRail({
  role,
  pathname,
  isSuperAdmin,
}: {
  role: string;
  pathname: string;
  isSuperAdmin: boolean;
}) {
  const items = navGroupsFor(role).flatMap((g) => g.items);
  if (canSeeSettings(role)) items.push(SETTINGS_ITEM);
  if (isSuperAdmin) items.push(ADMIN_ITEM);
```

- [ ] **Step 6: Thread `isSuperAdmin` through `NavDrawer` + `AppNav`**

In `components/ui/NavDrawer.tsx`, add the prop and forward it to `NavMenu`:

```tsx
export function NavDrawer({
  open,
  onClose,
  role,
  pathname,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  pathname: string;
  isSuperAdmin: boolean;
}) {
```

Update the `NavMenu` usage near the bottom:

```tsx
          <NavMenu
            role={role}
            pathname={pathname}
            onNavigate={onClose}
            isSuperAdmin={isSuperAdmin}
          />
```

In `components/ui/AppNav.tsx`, compute the flag and pass it to `NavDrawer`:

```tsx
  const role = session?.user?.role ?? "crew";
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const isCrew = role === "crew";
```

```tsx
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        pathname={pathname}
        isSuperAdmin={isSuperAdmin}
      />
```

- [ ] **Step 7: Full typecheck + nav tests + lint**

Run: `npm run typecheck`
Expected: no errors.
Run: `npx vitest run __tests__/components/ui`
Expected: PASS (NavMenu, NavDrawer, SideNav suites).
Run: `npm run lint:ci`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/ui/NavMenu.tsx components/ui/SideNav.tsx components/ui/NavDrawer.tsx components/ui/AppNav.tsx __tests__/components/ui/NavMenu.test.tsx
git commit -m "feat(nav): show Admin link to super-admins"
```

---

## Task 7: Admin members hook + detail components

**Files:**
- Create: `lib/passwords.ts`
- Modify: `components/admin/orgs/CreateOrgForm.tsx`
- Create: `lib/hooks/useAdminOrgMembers.ts`
- Create: `components/admin/orgs/detail/AddAdminUserForm.tsx`
- Create: `components/admin/orgs/detail/AdminMemberRow.tsx`
- Create: `components/admin/orgs/detail/AdminOrgDetailView.tsx`
- Test: `__tests__/lib/passwords.test.ts`, `__tests__/components/admin/AddAdminUserForm.test.tsx`

**Interfaces:**
- Consumes: admin user routes (Tasks 2–3); `MemberRole`, `MemberRow` from `@/components/settings/members/types`.
- Produces:
  - `suggestPassword(): string`.
  - `useListAdminOrgMembers(orgId, initial)`, `useCreateAdminOrgMember(orgId)`, `useUpdateAdminOrgMember(orgId)`; types `CreateAdminUserInput = { name; email; role; password }`, `UpdateAdminUserInput = { userId; role?; title?; archived? }`.
  - `AdminOrgDetailView({ org, initialMembers })`, `AdminMemberRow({ orgId, row, onUpdated })`, `AddAdminUserForm({ orgId, onCreated })`.

- [ ] **Step 1: Write the failing test for `suggestPassword`**

Create `__tests__/lib/passwords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestPassword } from "@/lib/passwords";

describe("suggestPassword", () => {
  it("returns a 16-char string from the safe alphabet", () => {
    const pw = suggestPassword();
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/^[a-zA-Z0-9]+$/);
    // no ambiguous chars (l, I, O, 0, 1)
    expect(pw).not.toMatch(/[lIO01]/);
  });

  it("is different across calls", () => {
    expect(suggestPassword()).not.toBe(suggestPassword());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/lib/passwords.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `lib/passwords.ts`**

Move the generator out of `CreateOrgForm` verbatim:

```ts
/** Generate a random 16-char temporary password from an unambiguous alphabet. */
export function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const cryptoObj =
    typeof crypto !== "undefined" && "getRandomValues" in crypto ? crypto : null;
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
```

- [ ] **Step 4: Refactor `CreateOrgForm` to use it**

In `components/admin/orgs/CreateOrgForm.tsx`: delete the local `suggestPassword` function and add `import { suggestPassword } from "@/lib/passwords";` (with the other imports). The call site `onClick={() => setAdminPassword(suggestPassword())}` is unchanged.

- [ ] **Step 5: Run passwords test + typecheck**

Run: `npx vitest run __tests__/lib/passwords.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Create the hooks**

Create `lib/hooks/useAdminOrgMembers.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberRole, MemberRow } from "@/components/settings/members/types";
import { readApiError } from "@/lib/api/errors";

export type CreateAdminUserInput = {
  name: string;
  email: string;
  role: MemberRole;
  password: string;
};

export type UpdateAdminUserInput = {
  userId: string;
  role?: MemberRole;
  title?: string | null;
  archived?: boolean;
};

const key = (orgId: string) => ["admin", "orgs", orgId, "users"] as const;

export function useListAdminOrgMembers(orgId: string, initial: MemberRow[]) {
  return useQuery({
    queryKey: key(orgId),
    initialData: initial,
    queryFn: async (): Promise<MemberRow[]> => {
      const res = await fetch(`/api/admin/orgs/${orgId}/users`);
      if (!res.ok) throw await readApiError(res, "Failed to load members");
      return (await res.json()) as MemberRow[];
    },
  });
}

export function useCreateAdminOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAdminUserInput): Promise<MemberRow> => {
      const res = await fetch(`/api/admin/orgs/${orgId}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await readApiError(res, "Failed to add user");
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}

export function useUpdateAdminOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...patch
    }: UpdateAdminUserInput): Promise<MemberRow> => {
      const res = await fetch(`/api/admin/orgs/${orgId}/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw await readApiError(res, "Failed to update user");
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}
```

- [ ] **Step 7: Write the failing component test for `AddAdminUserForm`**

Create `__tests__/components/admin/AddAdminUserForm.test.tsx` (mock the hook, mirroring `QuickCreatePanels.test.tsx`):

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRow } from "@/components/settings/members/types";

const mutate = vi.fn();
vi.mock("@/lib/hooks/useAdminOrgMembers", () => ({
  useCreateAdminOrgMember: () => ({ mutate, isPending: false }),
}));

import { AddAdminUserForm } from "@/components/admin/orgs/detail/AddAdminUserForm";

const ROW: MemberRow = {
  id: "m9",
  name: "New Hire",
  email: "new@org.test",
  role: "crew",
  title: null,
  archived: false,
  createdAt: "2026-06-30T00:00:00.000Z",
};

beforeEach(() => mutate.mockReset());

describe("AddAdminUserForm", () => {
  it("submits the typed values and reveals the temp password on success", () => {
    mutate.mockImplementation(
      (_input, opts: { onSuccess: (r: MemberRow) => void }) => opts.onSuccess(ROW)
    );
    const onCreated = vi.fn();
    render(<AddAdminUserForm orgId="org1" onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /add user/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "New Hire" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@org.test" } });
    fireEvent.change(screen.getByLabelText(/temporary password/i), {
      target: { value: "temp-pass-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add user$/i }));

    expect(mutate).toHaveBeenCalledWith(
      { name: "New Hire", email: "new@org.test", role: "crew", password: "temp-pass-123" },
      expect.anything()
    );
    expect(onCreated).toHaveBeenCalledWith(ROW);
    // Credential reveal shows the email + the temp password.
    expect(screen.getByText("new@org.test")).toBeInTheDocument();
    expect(screen.getByText("temp-pass-123")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run __tests__/components/admin/AddAdminUserForm.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 9: Create `AddAdminUserForm`**

Create `components/admin/orgs/detail/AddAdminUserForm.tsx`. Structure below; **copy the `Field` and `Credentials` helper components and the exact input/button `className` strings verbatim from `components/admin/orgs/CreateOrgForm.tsx`** (same look), and the role `<select>` markup from `components/settings/members/AddMemberForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { MemberRole, MemberRow } from "@/components/settings/members/types";
import {
  type CreateAdminUserInput,
  useCreateAdminOrgMember,
} from "@/lib/hooks/useAdminOrgMembers";
import { suggestPassword } from "@/lib/passwords";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function AddAdminUserForm({
  orgId,
  onCreated,
}: {
  orgId: string;
  onCreated: (row: MemberRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("crew");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const mutation = useCreateAdminOrgMember(orgId);

  function reset() {
    setName("");
    setEmail("");
    setRole("crew");
    setPassword("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: CreateAdminUserInput = { name, email, role, password };
    mutation.mutate(input, {
      onSuccess: (row) => {
        setCreated({ email: row.email, password });
        onCreated(row);
        reset();
      },
      onError: (err: unknown) => {
        const msg =
          typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to add user";
        setError(msg);
      },
    });
  }

  if (created) {
    return (
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3">
        <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)]">
          User created · hand these off out-of-band
        </div>
        <Credentials label="Email" value={created.email} />
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
            Add another
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
        + Add user
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3"
    >
      <Field label="Name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Email">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Temporary password">
        <div className="flex gap-2">
          <input
            required
            minLength={8}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px] font-[var(--font-mono)]"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setPassword(suggestPassword())}
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
          {mutation.isPending ? "Adding…" : "Add user"}
        </button>
      </div>
    </form>
  );
}

// Copy `Field` and `Credentials` verbatim from components/admin/orgs/CreateOrgForm.tsx
// (identical markup — do not diverge). Include them below this line.
```

> **Note:** `Field` and `Credentials` are private to `CreateOrgForm.tsx` (not exported). Copy both function definitions verbatim into this file (below the component). Keeping them local matches how `CreateOrgForm` and `AddMemberForm` each define their own `Field`.

- [ ] **Step 10: Run the component test**

Run: `npx vitest run __tests__/components/admin/AddAdminUserForm.test.tsx`
Expected: PASS.

- [ ] **Step 11: Create `AdminMemberRow`**

Create `components/admin/orgs/detail/AdminMemberRow.tsx` — **mirror `components/settings/members/MemberRow.tsx` verbatim** with three changes: (1) use `useUpdateAdminOrgMember(orgId)` instead of `useUpdateMember`; (2) the mutation input uses `userId` (not `id`), e.g. `patch({ userId: row.id, role: … })`; (3) drop the `isSelf` prop and its disabling — the operator is never the target, so the role select is only disabled by `row.archived || mutation.isPending`, and Archive/Restore is always shown. Props:

```tsx
export function AdminMemberRow({
  orgId,
  row,
  onUpdated,
}: {
  orgId: string;
  row: MemberRow;
  onUpdated: (next: MemberRow) => void;
}) {
```

The mutate wrapper:

```tsx
  const mutation = useUpdateAdminOrgMember(orgId);

  function patch(input: Parameters<typeof mutation.mutate>[0]) {
    setError(null);
    mutation.mutate(input, {
      onSuccess: (updated) => onUpdated(updated),
      onError: (err: unknown) => {
        const msg =
          typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to update member";
        setError(msg);
      },
    });
  }
```

Call sites become `patch({ userId: row.id, role: e.target.value as MemberRole })`, `patch({ userId: row.id, title: next || null })`, and `patch({ userId: row.id, archived: !row.archived })`. Use the same grid/markup/`className`s as `MemberRow` but with a `grid-cols-[1fr_1.5fr_140px_90px]` layout unchanged (the Archive button column is always rendered now).

- [ ] **Step 12: Create `AdminOrgDetailView`**

Create `components/admin/orgs/detail/AdminOrgDetailView.tsx` — mirror `components/settings/members/MembersView.tsx`, add an org header + back link, and render `AdminMemberRow` (passing `orgId`) and `AddAdminUserForm`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import type { MemberRow } from "@/components/settings/members/types";
import { AddAdminUserForm } from "./AddAdminUserForm";
import { AdminMemberRow } from "./AdminMemberRow";

export type AdminOrgSummary = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  createdAt: string;
};

export function AdminOrgDetailView({
  org,
  initialMembers,
}: {
  org: AdminOrgSummary;
  initialMembers: MemberRow[];
}) {
  const [rows, setRows] = useState<MemberRow[]>(initialMembers);

  function upsert(next: MemberRow) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === next.id);
      if (idx === -1) return [...prev, next];
      const out = prev.slice();
      out[idx] = next;
      return out;
    });
  }

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <Link
        href="/admin/orgs"
        className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase text-[var(--muted)] hover:text-[var(--ink)]"
      >
        ← Organizations
      </Link>
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mt-2 mb-1">
        {org.name}
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        {org.slug} · {org.subscriptionStatus} · since{" "}
        {new Date(org.createdAt).toLocaleDateString()}
      </p>

      <h2 className="text-[12px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-2">
        Members
      </h2>
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] mb-4">
        {active.map((row) => (
          <AdminMemberRow key={row.id} orgId={org.id} row={row} onUpdated={upsert} />
        ))}
      </div>

      <AddAdminUserForm orgId={org.id} onCreated={upsert} />

      {archived.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[12px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-2">
            Archived ({archived.length})
          </h2>
          <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] opacity-80">
            {archived.map((row) => (
              <AdminMemberRow key={row.id} orgId={org.id} row={row} onUpdated={upsert} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Typecheck, lint, run admin + hook-adjacent tests**

Run: `npm run typecheck`
Expected: no errors.
Run: `npx vitest run __tests__/components/admin __tests__/lib/passwords.test.ts`
Expected: PASS.
Run: `npm run lint:ci`
Expected: clean.

- [ ] **Step 14: Commit**

```bash
git add lib/passwords.ts components/admin/orgs/CreateOrgForm.tsx lib/hooks/useAdminOrgMembers.ts components/admin/orgs/detail __tests__/lib/passwords.test.ts __tests__/components/admin
git commit -m "feat(admin): org member management UI (hook + detail view)"
```

---

## Task 8: Admin pages — dashboard + org detail

**Files:**
- Create: `app/(admin)/admin/page.tsx`
- Create: `app/(admin)/admin/orgs/[orgId]/page.tsx`

**Interfaces:**
- Consumes: `getOrgById`, `listUsers` (`@/lib/repositories`); `AdminOrgDetailView` (Task 7); `isSuperAdmin` (`@/lib/auth/superAdmin`).

**Note:** These are async server components with Prisma access; per the codebase convention (the existing `/admin/orgs` page has no unit test), they're verified by typecheck + lint here and by E2E in Task 9.

- [ ] **Step 1: Create the dashboard page**

Create `app/(admin)/admin/page.tsx`:

```tsx
import Link from "next/link";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Admin · SqFt" };

export default async function AdminDashboardPage() {
  // Defense-in-depth: the (admin) layout renders ForbiddenPanel for
  // non-super-admins, but Next runs the page body in parallel with the layout,
  // so skip the queries when the caller isn't allowed.
  const session = await requireSession();
  if (!isSuperAdmin(session.user.email)) return null;

  const [orgCount, userCount] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="max-w-[960px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">Admin</h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Operator console for the SqFt platform.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="Organizations" value={orgCount} />
        <Stat label="Users" value={userCount} />
      </div>

      <Link
        href="/admin/orgs"
        className="block border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 hover:bg-[var(--surface-2)]"
      >
        <div className="text-[15px] font-[600]">Organizations →</div>
        <div className="text-[13px] text-[var(--muted)]">
          View every tenant, create manual orgs, and manage members.
        </div>
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] mb-1">
        {label}
      </div>
      <div className="text-[28px] font-[700] tracking-[-0.02em]">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create the org detail page**

Create `app/(admin)/admin/orgs/[orgId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AdminOrgDetailView } from "@/components/admin/orgs/detail/AdminOrgDetailView";
import type { MemberRow } from "@/components/settings/members/types";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { getOrgById, listUsers } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Organization · Admin · SqFt" };

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await requireSession();
  if (!isSuperAdmin(session.user.email)) return null;

  const { orgId } = await params;
  const org = await getOrgById(orgId);
  if (!org) notFound();

  const users = await listUsers(orgId, { includeArchived: true });
  const initialMembers: MemberRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as MemberRow["role"],
    title: u.title,
    archived: u.archived,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <AdminOrgDetailView
      org={{
        id: org.id,
        name: org.name,
        slug: org.slug,
        subscriptionStatus: org.subscriptionStatus,
        createdAt: org.createdAt.toISOString(),
      }}
      initialMembers={initialMembers}
    />
  );
}
```

- [ ] **Step 3: Make the org rows link to the detail page**

Open `components/admin/orgs/OrgsTable.tsx`. Wrap each row's org name (or add a trailing "Manage" link) in a `Link` to `/admin/orgs/${row.id}` so the detail page is reachable from the list. Use the existing row markup; add:

```tsx
import Link from "next/link";
```

and render the org name as:

```tsx
<Link href={`/admin/orgs/${row.id}`} className="text-[var(--ink)] hover:text-[var(--accent)] underline-offset-2 hover:underline">
  {row.name}
</Link>
```

(Keep the rest of the row unchanged. If the table has no obvious name cell to wrap, add a right-aligned `Manage →` link cell.)

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm run lint:ci`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/admin/page.tsx" "app/(admin)/admin/orgs/[orgId]/page.tsx" components/admin/orgs/OrgsTable.tsx
git commit -m "feat(admin): dashboard + org detail pages"
```

---

## Task 9: E2E — add-user flow + nav visibility

**Files:**
- Create: `tests/e2e/admin-org-users.spec.ts`

**Note:** This worktree may not run E2E (incomplete `node_modules`); the spec runs in CI. If a local run is possible, use `--workers=1`.

- [ ] **Step 1: Write the E2E spec**

Create `tests/e2e/admin-org-users.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  createOrg,
  loginViaForm,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from "./fixtures/org";

test.describe("admin org member management", () => {
  test("super-admin adds a user to an org and manages the row", async ({ browser }) => {
    // A fresh org (created via the super-admin API) to mutate in isolation.
    const org = await createOrg(browser, "member-mgmt");

    const ctx = await browser.newContext();
    const page = await loginViaForm(ctx, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto(`/admin/orgs/${org.orgId}`);
    await expect(page.getByRole("heading", { name: org.orgName })).toBeVisible();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEmail = `crew+${suffix}@playwright.test`;

    await page.getByRole("button", { name: /add user/i }).click();
    const form = page.locator("form");
    await form.getByLabel(/name/i).fill(`Crew ${suffix}`);
    await form.getByLabel(/email/i).fill(newEmail);
    await form.getByLabel(/temporary password/i).fill(`pw-${suffix}-A1`);
    await form.getByRole("button", { name: /^add user$/i }).click();

    // Credential reveal shows the new email; then it appears in the member list.
    await expect(page.getByText(newEmail)).toBeVisible();
    await page.getByRole("button", { name: /done/i }).click();
    await expect(page.getByText(newEmail)).toBeVisible();

    await ctx.close();
  });

  test("Admin nav link is visible only to super-admins", async ({ browser }) => {
    // Super-admin sees it.
    const superCtx = await browser.newContext();
    const superPage = await loginViaForm(superCtx, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(superPage.getByRole("link", { name: /^Admin$/ })).toBeVisible();
    await superCtx.close();

    // A normal org admin does not.
    const org = await createOrg(browser, "no-admin-link");
    const ctx = await browser.newContext();
    const page = await loginViaForm(ctx, org.adminEmail, org.adminPassword);
    await expect(page.getByRole("link", { name: /^Admin$/ })).toHaveCount(0);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Run (CI, or locally if deps allow)**

Run: `npm run test:e2e -- --workers=1 admin-org-users`
Expected: PASS. If the worktree can't run E2E, note it and rely on CI.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-org-users.spec.ts
git commit -m "test(e2e): admin add-user flow + Admin nav visibility"
```

---

## Task 10: Docs + spec fix + final verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-06-30-admin-user-org-management-design.md`

- [ ] **Step 1: Update `AGENTS.md`**

In the `app/(app)/` / admin bullet, replace the "admin is `app/(admin)/admin`" phrasing with a description of the super-admin console: the `/admin` dashboard, `/admin/orgs` list, and `/admin/orgs/[orgId]` detail page with **full member management** (add user, change role, archive/restore) via `/api/admin/orgs/[orgId]/users[/[userId]]`, gated by `apiRoute({ superAdmin: true })`. In the Navigation bullet, note the super-admin-only `ADMIN_ITEM` (rendered by `NavMenu`/`SideNav`/`NavDrawer` when `session.user.isSuperAdmin`). Add a one-line gotcha: **super-admin routes take the target org from the URL param, not the caller's session org.**

- [ ] **Step 2: Update `CONTEXT.md`**

In the **People** section, change the line that calls `/settings/members` "the single people-management surface": clarify that `/settings/members` manages the caller's **own** org, while a **super-admin** manages **any** org's members from `/admin/orgs/[orgId]` (same `userRepo` functions, org from the URL). No new error codes.

- [ ] **Step 3: Fix the spec's error table**

In `docs/superpowers/specs/2026-06-30-admin-user-org-management-design.md`, change the "Would leave org with no active admin" row from `409 LastAdminError` to **`400 LAST_ADMIN` (`LastAdminError`)**.

- [ ] **Step 4: Full verification suite**

Run: `npm run lint:ci`
Expected: clean.
Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: all unit/component suites PASS (repo + real-DB suites SKIP without a DB — that's expected in this worktree; they run in CI).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CONTEXT.md docs/superpowers/specs/2026-06-30-admin-user-org-management-design.md
git commit -m "docs: admin user/org management (AGENTS, CONTEXT, spec fix)"
```

---

## Self-Review

**Spec coverage:**
- Add users to any org → Tasks 2 (POST) + 7 (form) + 8 (page) + 9 (E2E). ✓
- Full management (role/archive) → Task 3 (PATCH) + 7 (`AdminMemberRow`). ✓
- Minimal `/admin` dashboard (counts + link) → Task 8. ✓
- Super-admin-only Admin nav link → Tasks 4 (session flag) + 5 (item/icon) + 6 (rendering). ✓
- Credential reveal on add → Task 7 (`AddAdminUserForm` + its test). ✓
- Reuse org-parameterized `userRepo`; no schema change → Tasks 2/3 (no new member repo fns; only `getOrgById` added). ✓
- No new error codes; `LAST_ADMIN` preserved via repo → Tasks 3 + 10 (spec fix). ✓
- Docs synced → Task 10. ✓

**Placeholder scan:** No "TBD/TODO"; the two "mirror an existing file verbatim" notes (`Field`/`Credentials`, `AdminMemberRow`) reference concrete in-repo files with the exact diffs to apply, not future tasks — acceptable and precise.

**Type consistency:** `getOrgById`/`OrgSummary`, `CreateAdminUserInput`/`UpdateAdminUserInput` (with `userId`), `AdminOrgSummary` (ISO `createdAt`), and the `useUpdateAdminOrgMember` `{ userId, ...patch }` shape are consistent across the hook, components, routes, and tests. `ADMIN_ITEM`/`IconId "admin"` used consistently in nav tasks. `params.orgId`/`params.userId` casts match the codebase's `/api/users/[id]` precedent.
