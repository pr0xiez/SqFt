# Members & Role Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `/settings/members` admin UI, the Admin/Lead/Crew permission gates across every existing surface, a `hasMinRole` utility, and a `minRole` parameter on `apiRoute` that replaces `adminRoute`.

**Architecture:** Permissions are a numeric rank (`crew=0, lead=1, admin=2`). The `apiRoute` wrapper gains an optional `minRole`. Server-component pages do a three-line redirect gate. The `AppNav` and `/settings` index filter their links by role. Schedule and crew views pass a `canEdit` prop down to hide affordances for Crew. Login redirect goes through `homePathFor(role)` so Crew lands on `/schedule`.

**Tech Stack:** Next.js 16 App Router, Prisma, NextAuth v5 (Credentials), Zod, react-query, Vitest, Playwright, bcryptjs.

**Spec:** [docs/superpowers/specs/2026-05-24-members-and-roles-design.md](../specs/2026-05-24-members-and-roles-design.md)

---

## Task 1: Permission utility — `hasMinRole` and `homePathFor`

**Files:**
- Create: `lib/auth/permissions.ts`
- Test: `__tests__/lib/auth/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/auth/permissions.test.ts
import { describe, expect, it } from "vitest";
import { hasMinRole, homePathFor, ROLE_RANK } from "@/lib/auth/permissions";

describe("ROLE_RANK", () => {
  it("orders crew < lead < admin", () => {
    expect(ROLE_RANK.crew).toBe(0);
    expect(ROLE_RANK.lead).toBe(1);
    expect(ROLE_RANK.admin).toBe(2);
  });
});

describe("hasMinRole", () => {
  it.each([
    ["admin", "admin", true],
    ["admin", "lead",  true],
    ["admin", "crew",  true],
    ["lead",  "admin", false],
    ["lead",  "lead",  true],
    ["lead",  "crew",  true],
    ["crew",  "admin", false],
    ["crew",  "lead",  false],
    ["crew",  "crew",  true],
  ] as const)("(%s, %s) → %s", (role, min, expected) => {
    expect(hasMinRole(role, min)).toBe(expected);
  });

  it("returns false for an unknown role", () => {
    expect(hasMinRole("owner", "crew")).toBe(false);
    expect(hasMinRole("",      "admin")).toBe(false);
  });
});

describe("homePathFor", () => {
  it("sends crew to /schedule", () => {
    expect(homePathFor("crew")).toBe("/schedule");
  });
  it("sends lead and admin to /", () => {
    expect(homePathFor("lead")).toBe("/");
    expect(homePathFor("admin")).toBe("/");
  });
  it("sends unknown roles to /", () => {
    expect(homePathFor("owner")).toBe("/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/auth/permissions.test.ts`
Expected: FAIL with module-not-found for `@/lib/auth/permissions`.

- [ ] **Step 3: Implement the module**

```ts
// lib/auth/permissions.ts
export const ROLE_RANK = { crew: 0, lead: 1, admin: 2 } as const;
export type Role = keyof typeof ROLE_RANK;

export function hasMinRole(role: string, min: Role): boolean {
  const r = ROLE_RANK[role as Role];
  return r !== undefined && r >= ROLE_RANK[min];
}

export function homePathFor(role: string): string {
  return role === "crew" ? "/schedule" : "/";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/auth/permissions.test.ts`
Expected: PASS (12 assertions across 4 test cases).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/permissions.ts __tests__/lib/auth/permissions.test.ts
git commit -m "feat(auth): add role hierarchy utility (hasMinRole, homePathFor)"
```

---

## Task 2: Add `minRole` option to `apiRoute`

**Files:**
- Modify: `lib/api/route.ts`
- Modify: `__tests__/lib/api/route.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/lib/api/route.test.ts` (after the existing top-level mocks, in the same file). The existing mock for `lib/tenant` only mocks `getOrgId`. Replace it so `requireSession` is also mockable:

Find this block:
```ts
vi.mock("../../../lib/tenant", () => ({
  getOrgId: vi.fn(),
}));
```

Replace with:
```ts
vi.mock("../../../lib/tenant", () => ({
  getOrgId: vi.fn(),
  requireSession: vi.fn(),
}));
```

Then add the import for `requireSession` near the existing `getOrgId` import line:
```ts
const { getOrgId, requireSession } = await import("../../../lib/tenant");
const mockRequireSession = vi.mocked(requireSession);
```

Then append this `describe` block to the file:
```ts
describe("apiRoute — minRole option", () => {
  it("returns 401 when minRole is set and the session is missing", async () => {
    mockRequireSession.mockRejectedValueOnce(new UnauthorizedError());
    const handler = apiRoute({ minRole: "lead" }, async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("returns 401 when the session role is below minRole", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "crew" } } as any
    );
    const handler = apiRoute({ minRole: "lead" }, async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(401);
  });

  it("invokes the handler with orgId when role meets minRole (lead → lead)", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "lead" } } as any
    );
    const inner = vi.fn(async ({ orgId }: { orgId: string }) => ({ orgId }));
    const handler = apiRoute({ minRole: "lead" }, inner);

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: "org1" });
    expect(inner).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org1" }));
    expect(mockGetOrgId).not.toHaveBeenCalled(); // minRole branch skips getOrgId
  });

  it("admin meets minRole=admin", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "admin" } } as any
    );
    const handler = apiRoute({ minRole: "admin" }, async ({ orgId }) => ({ orgId }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(200);
  });

  it("lead does NOT meet minRole=admin", async () => {
    mockRequireSession.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub session
      { user: { id: "u1", orgId: "org1", role: "lead" } } as any
    );
    const handler = apiRoute({ minRole: "admin" }, async () => ({ ok: true }));

    const res = await handler(makeRequest("GET"), ctx);

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run __tests__/lib/api/route.test.ts`
Expected: 5 new tests FAIL — `apiRoute` ignores `minRole` and either returns 200 (missing gate) or crashes (handler reached without session).

- [ ] **Step 3: Implement `minRole` on `apiRoute`**

In `lib/api/route.ts`, modify the `RouteOptions` type:
```ts
type RouteOptions<TInput> = {
  /** Zod schema for the request body. When omitted, `input` is `undefined`. */
  input?: ZodType<TInput>;
  /** Success status when the handler returns a value (default 200, ignored for explicit Response). */
  status?: number;
  /** Minimum role required to access this route. Omit for any-authenticated. */
  minRole?: "lead" | "admin";
};
```

Add the import for the permissions helper at the top of the file:
```ts
import { hasMinRole } from "@/lib/auth/permissions";
```

Replace the body of `apiRoute` (the implementation function, starting at `const { options, handler } = normalizeArgs(...)`) with:
```ts
const { options, handler } = normalizeArgs(optionsOrHandler, maybeHandler);

return wrapHandler(async (req, ctx, logCtx) => {
  let orgId: string;
  if (options.minRole) {
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

(The minRole branch uses `requireSession` instead of `getOrgId` to avoid two auth() calls.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/api/route.test.ts`
Expected: PASS (existing tests still pass; 5 new minRole tests pass).

- [ ] **Step 5: Commit**

```bash
git add lib/api/route.ts __tests__/lib/api/route.test.ts
git commit -m "feat(api): add minRole option to apiRoute"
```

---

## Task 3: Delete `adminRoute`; migrate `/api/org` PATCH

**Files:**
- Modify: `lib/api/route.ts`
- Modify: `app/api/org/route.ts`
- Delete: `__tests__/lib/api/adminRoute.test.ts`
- Modify: `CONTEXT.md` (if it documents `adminRoute`)

- [ ] **Step 1: Migrate `/api/org` PATCH**

In `app/api/org/route.ts`:

Replace the import line:
```ts
import { adminRoute, apiRoute } from "@/lib/api/route";
```
With:
```ts
import { apiRoute } from "@/lib/api/route";
```

Replace the PATCH export:
```ts
export const PATCH = adminRoute(
  { input: PatchBody },
  async ({ orgId, input }) => {
    // ...
  }
);
```
With:
```ts
export const PATCH = apiRoute(
  { minRole: "admin", input: PatchBody },
  async ({ orgId, input }) => {
    // ...
  }
);
```

(Body of the handler is unchanged.)

- [ ] **Step 2: Run the existing org tests to verify the migration**

Run: `npx vitest run __tests__/api/org.test.ts`
Expected: PASS — behaviour for admin / non-admin / unauthenticated is identical.

- [ ] **Step 3: Delete `adminRoute` from `lib/api/route.ts`**

Remove the entire `// ── adminRoute ────...` section and the `adminRoute` exports (lines that begin with `export function adminRoute<...>`).

Also remove `adminRoute`'s mention in the module-level docblock at the top of the file. The replacement docblock:
```ts
/**
 * The API request seam.
 *
 * Two adapters: `apiRoute` for org-scoped endpoints (optionally gated by
 * `minRole: "lead" | "admin"`), and `publicRoute` for unauthenticated
 * (token-verified) endpoints. Both own:
 *   - input parsing via an optional Zod schema
 *   - error translation to the standard envelope (see CONTEXT.md)
 *   - request/mutation/error logging
 *
 * Handlers return a JSON-serializable value (wrapped in NextResponse.json),
 * an explicit Response (passed through), or null/undefined for 204.
 */
```

- [ ] **Step 4: Delete `__tests__/lib/api/adminRoute.test.ts`**

```bash
git rm __tests__/lib/api/adminRoute.test.ts
```

(Coverage is preserved by the `minRole: "admin"` cases added to `route.test.ts` in Task 2.)

- [ ] **Step 5: Update `CONTEXT.md` if it documents `adminRoute`**

Run: `grep -n adminRoute CONTEXT.md`

If matches: replace `adminRoute` references with `apiRoute({ minRole: "admin" })` (and update the surrounding prose to describe one wrapper with a `minRole` option). If no matches, skip.

- [ ] **Step 6: Run the full lib/api test suite**

Run: `npx vitest run __tests__/lib/api`
Expected: PASS — no remaining references to `adminRoute`.

- [ ] **Step 7: Run lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/api/route.ts app/api/org/route.ts CONTEXT.md
git rm __tests__/lib/api/adminRoute.test.ts
git commit -m "refactor(api): replace adminRoute with apiRoute({ minRole: 'admin' })"
```

---

## Task 4: New error codes — `EMAIL_TAKEN`, `CANNOT_DEMOTE_SELF`, `LAST_ADMIN`

**Files:**
- Modify: `lib/api/errors.ts`
- Test: `__tests__/lib/api/errors.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/api/errors.test.ts
import { describe, expect, it } from "vitest";
import {
  CannotDemoteSelfError,
  EmailTakenError,
  LastAdminError,
} from "@/lib/api/errors";

describe("members error codes", () => {
  it("EmailTakenError is 409 EMAIL_TAKEN", () => {
    const err = new EmailTakenError();
    expect(err.code).toBe("EMAIL_TAKEN");
    expect(err.status).toBe(409);
  });

  it("CannotDemoteSelfError is 400 CANNOT_DEMOTE_SELF", () => {
    const err = new CannotDemoteSelfError();
    expect(err.code).toBe("CANNOT_DEMOTE_SELF");
    expect(err.status).toBe(400);
  });

  it("LastAdminError is 400 LAST_ADMIN", () => {
    const err = new LastAdminError();
    expect(err.code).toBe("LAST_ADMIN");
    expect(err.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/api/errors.test.ts`
Expected: FAIL — error classes not exported.

- [ ] **Step 3: Add the error classes**

Append to `lib/api/errors.ts` (before the `ApiErrorEnvelope` type):
```ts
export class EmailTakenError extends ConflictError {
  constructor(message = "Email already in use") {
    super(message, "EMAIL_TAKEN");
  }
}

export class CannotDemoteSelfError extends ApiError {
  constructor(message = "You can't change your own role") {
    super({ code: "CANNOT_DEMOTE_SELF", status: 400, message });
  }
}

export class LastAdminError extends ApiError {
  constructor(
    message = "Can't remove the last admin in the organization"
  ) {
    super({ code: "LAST_ADMIN", status: 400, message });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/api/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api/errors.ts __tests__/lib/api/errors.test.ts
git commit -m "feat(api): add EMAIL_TAKEN, CANNOT_DEMOTE_SELF, LAST_ADMIN error codes"
```

---

## Task 5: `GET /api/users` — list org members

**Files:**
- Create: `app/api/users/route.ts`
- Test: `__tests__/api/users.test.ts`

The repo's integration-test pattern (see `__tests__/api/org.test.ts`) mocks `@/lib/auth` and `@/lib/prisma` directly — no test-DB harness. Mirror that pattern below.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/users.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET } from "@/app/api/users/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindMany = vi.mocked(prisma.user.findMany);

function makeRequest(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request("http://localhost/api/users", init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/users"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}
const noParams = { params: Promise.resolve({}) };

function asRole(role: "admin" | "lead" | "crew", userId = "u1", orgId = "org1") {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: userId, orgId, role } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/users", () => {
  it("401 when no session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("401 for non-admin (lead)", async () => {
    asRole("lead");
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("401 for non-admin (crew)", async () => {
    asRole("crew");
    const res = await GET(makeRequest("GET"), noParams);
    expect(res.status).toBe(401);
  });

  it("returns users in the org for admin", async () => {
    asRole("admin");
    mockFindMany.mockResolvedValueOnce([
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "u1", name: "A", email: "a@x.dev", role: "admin", createdAt: new Date() } as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "u2", name: "B", email: "b@x.dev", role: "crew",  createdAt: new Date() } as any,
    ]);

    const res = await GET(makeRequest("GET"), noParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ id: "u1", role: "admin" });
    expect(body[0].password).toBeUndefined();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: { createdAt: "asc" },
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/api/users.test.ts`
Expected: FAIL — route handler not exported (module-not-found).

- [ ] **Step 3: Implement `GET /api/users`**

```ts
// app/api/users/route.ts
import { apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  return prisma.user.findMany({
    where: { orgId },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/api/users.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add app/api/users/route.ts __tests__/api/users.test.ts
git commit -m "feat(api): add GET /api/users"
```

---

## Task 6: `POST /api/users` — create member

**Files:**
- Modify: `app/api/users/route.ts`
- Modify: `__tests__/api/users.test.ts`

- [ ] **Step 1: Add the failing tests**

Update the `GET` import in `__tests__/api/users.test.ts` to also import `POST`:
```ts
import { GET, POST } from "@/app/api/users/route";
```

Also add a mocked `findUnique` and `create` reference near the top:
```ts
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);
```

Append to `__tests__/api/users.test.ts`:
```ts
describe("POST /api/users", () => {
  function makePost(body: unknown) {
    const req = new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    Object.defineProperty(req, "nextUrl", {
      value: new URL("http://localhost/api/users"),
      writable: false,
    });
    // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
    return req as any as NextRequest;
  }

  it("401 for non-admin", async () => {
    asRole("lead");
    const res = await POST(
      makePost({ name: "Jane", email: "jane@test.dev", role: "crew", password: "abcd1234" }),
      noParams
    );
    expect(res.status).toBe(401);
  });

  it("201 creates a user; lowercases email; password is hashed and not returned", async () => {
    asRole("admin");
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "new1", name: "Jane", email: "jane@test.dev", role: "crew", createdAt: new Date() } as any
    );

    const res = await POST(
      makePost({ name: "Jane", email: "JANE@TEST.DEV", role: "crew", password: "abcd1234" }),
      noParams
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: "new1", email: "jane@test.dev", role: "crew" });
    expect(body.password).toBeUndefined();

    // Verify the create call: orgId scoped, password is bcrypt-hashed (not plaintext).
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0]?.[0] as {
      data: { email: string; password: string; orgId: string; role: string };
    };
    expect(callArg.data.email).toBe("jane@test.dev");
    expect(callArg.data.orgId).toBe("org1");
    expect(callArg.data.role).toBe("crew");
    expect(callArg.data.password).not.toBe("abcd1234");
    expect(callArg.data.password.startsWith("$2")).toBe(true); // bcrypt signature
  });

  it("409 EMAIL_TAKEN when the email already exists", async () => {
    asRole("admin");
    mockFindUnique.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "existing" } as any
    );

    const res = await POST(
      makePost({ name: "Jane", email: "dup@test.dev", role: "crew", password: "abcd1234" }),
      noParams
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMAIL_TAKEN");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400 on bad payload (invalid role, short password, bad email)", async () => {
    asRole("admin");
    const res = await POST(
      makePost({ name: "", email: "bad", role: "owner", password: "x" }),
      noParams
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run __tests__/api/users.test.ts`
Expected: FAIL — `POST` is not exported.

- [ ] **Step 3: Implement `POST /api/users`**

Append to `app/api/users/route.ts`:
```ts
import bcrypt from "bcryptjs";
import { z } from "zod";
import { EmailTakenError } from "@/lib/api/errors";

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().toLowerCase().max(254),
    role: z.enum(["admin", "lead", "crew"]),
    password: z.string().min(8).max(200),
  })
  .strict();

export const POST = apiRoute(
  { minRole: "admin", input: CreateBody, status: 201 },
  async ({ orgId, input }) => {
    const exists = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (exists) throw new EmailTakenError();

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: passwordHash,
        role: input.role,
        orgId,
      },
      select: USER_SELECT,
    });
    return user;
  }
);
```

(`USER_SELECT` from Task 5 already excludes `password`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/users.test.ts`
Expected: PASS — all POST tests green.

- [ ] **Step 5: Commit**

```bash
git add app/api/users/route.ts __tests__/api/users.test.ts
git commit -m "feat(api): add POST /api/users (admin-only member create)"
```

---

## Task 7: `PATCH /api/users/[id]` — change role with self/last-admin guards

**Files:**
- Create: `app/api/users/[id]/route.ts`
- Test: `__tests__/api/users.[id].test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/users.[id].test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { PATCH } from "@/app/api/users/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockFindFirst = vi.mocked(prisma.user.findFirst);
const mockUpdate = vi.mocked(prisma.user.update);
const mockCount = vi.mocked(prisma.user.count);

function makePatch(body: unknown) {
  const req = new Request("http://localhost/api/users/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/users/x"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

function asRole(role: "admin" | "lead" | "crew", userId = "self", orgId = "org1") {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: userId, orgId, role } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/users/[id]", () => {
  it("401 for non-admin", async () => {
    asRole("lead");
    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "target" }),
    });
    expect(res.status).toBe(401);
  });

  it("200 updates another user's role", async () => {
    asRole("admin", "self");
    mockFindFirst.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "target", role: "crew" } as any
    );
    mockUpdate.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "target", name: "B", email: "b@x.dev", role: "lead", createdAt: new Date() } as any
    );

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "target" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("lead");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target" },
        data: { role: "lead" },
      })
    );
  });

  it("400 CANNOT_DEMOTE_SELF when admin tries to demote themselves", async () => {
    asRole("admin", "self");

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "self" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CANNOT_DEMOTE_SELF");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows admin to keep self at admin (no-op self update)", async () => {
    asRole("admin", "self");
    mockFindFirst.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "self", role: "admin" } as any
    );
    mockUpdate.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "self", name: "A", email: "a@x.dev", role: "admin", createdAt: new Date() } as any
    );

    const res = await PATCH(makePatch({ role: "admin" }), {
      params: Promise.resolve({ id: "self" }),
    });

    expect(res.status).toBe(200);
  });

  it("404 when target user is not in the caller's org", async () => {
    asRole("admin", "self");
    mockFindFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("400 LAST_ADMIN when demoting the only admin (different user)", async () => {
    asRole("admin", "self");
    mockFindFirst.mockResolvedValueOnce(
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      { id: "lastAdmin", role: "admin" } as any
    );
    mockCount.mockResolvedValueOnce(1); // only one admin total in the org

    const res = await PATCH(makePatch({ role: "lead" }), {
      params: Promise.resolve({ id: "lastAdmin" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LAST_ADMIN");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("400 VALIDATION_FAILED on invalid role", async () => {
    asRole("admin");
    const res = await PATCH(makePatch({ role: "owner" }), {
      params: Promise.resolve({ id: "target" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/api/users.[id].test.ts`
Expected: FAIL — route handler not exported.

- [ ] **Step 3: Implement `PATCH /api/users/[id]`**

```ts
// app/api/users/[id]/route.ts
import { z } from "zod";
import {
  CannotDemoteSelfError,
  LastAdminError,
  NotFoundError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

const PatchBody = z
  .object({ role: z.enum(["admin", "lead", "crew"]) })
  .strict();

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export const PATCH = apiRoute(
  { minRole: "admin", input: PatchBody },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const targetId = (params as { id: string }).id;

    if (targetId === session.user.id && input.role !== "admin") {
      throw new CannotDemoteSelfError();
    }

    const target = await prisma.user.findFirst({
      where: { id: targetId, orgId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundError();

    if (target.role === "admin" && input.role !== "admin") {
      const adminCount = await prisma.user.count({
        where: { orgId, role: "admin" },
      });
      if (adminCount <= 1) throw new LastAdminError();
    }

    return prisma.user.update({
      where: { id: targetId },
      data: { role: input.role },
      select: USER_SELECT,
    });
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/users.[id].test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add app/api/users/[id]/route.ts __tests__/api/users.[id].test.ts
git commit -m "feat(api): add PATCH /api/users/[id] with self+last-admin guards"
```

---

## Task 8: Members types and server-component page

**Files:**
- Create: `components/settings/members/types.ts`
- Create: `app/(app)/settings/members/page.tsx`

- [ ] **Step 1: Write the types**

```ts
// components/settings/members/types.ts
export type MemberRole = "admin" | "lead" | "crew";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  createdAt: string;
};

export type CreateMemberInput = {
  name: string;
  email: string;
  role: MemberRole;
  password: string;
};
```

- [ ] **Step 2: Write the page**

```tsx
// app/(app)/settings/members/page.tsx
import { redirect } from "next/navigation";
import { MembersView } from "@/components/settings/members/MembersView";
import type { MemberRow } from "@/components/settings/members/types";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Members · Settings · SqFt" };

export default async function MembersPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/settings");
  }

  const users = await prisma.user.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const initial: MemberRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as MemberRow["role"],
    createdAt: u.createdAt.toISOString(),
  }));

  return <MembersView initial={initial} currentUserId={session.user.id} />;
}
```

(`MembersView` is created in Task 9 — TypeScript will complain until then. That's OK; this commit only adds the types and the page shell.)

- [ ] **Step 3: Commit (despite the temporary build error)**

```bash
git add components/settings/members/types.ts app/(app)/settings/members/page.tsx
git commit -m "feat(settings): scaffold Members page route + types"
```

Note: the build won't pass until Task 9 lands. That's intentional — this commit keeps the diff focused on routing/types.

---

## Task 9: `MembersView` and `MemberRow` components

**Files:**
- Create: `components/settings/members/MembersView.tsx`
- Create: `components/settings/members/MemberRow.tsx`
- Create: `lib/hooks/useMembers.ts`

- [ ] **Step 1: Implement the data hook**

```ts
// lib/hooks/useMembers.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import type {
  CreateMemberInput,
  MemberRole,
  MemberRow,
} from "@/components/settings/members/types";

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; role: MemberRole }) => {
      const res = await fetch(`/api/users/${args.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: args.role }),
      });
      if (!res.ok) {
        const err = await readApiError(res, "Failed to update role");
        throw err;
      }
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMemberInput) => {
      const res = await fetch(`/api/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await readApiError(res, "Failed to add member");
        throw err;
      }
      return (await res.json()) as MemberRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}
```

- [ ] **Step 2: Implement `MemberRow`**

```tsx
// components/settings/members/MemberRow.tsx
"use client";

import { useState } from "react";
import { useUpdateMemberRole } from "@/lib/hooks/useMembers";
import type { MemberRole, MemberRow as Row } from "./types";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function MemberRow({
  row,
  isSelf,
  onUpdated,
}: {
  row: Row;
  isSelf: boolean;
  onUpdated: (next: Row) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateMemberRole();

  function onRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as MemberRole;
    setError(null);
    mutation.mutate(
      { id: row.id, role: next },
      {
        onSuccess: (updated) => onUpdated(updated),
        onError: (err: unknown) => {
          const msg =
            typeof err === "object" && err && "message" in err
              ? String((err as { message: string }).message)
              : "Failed to update role";
          setError(msg);
        },
      }
    );
  }

  const initials =
    row.name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("") || row.email[0]?.toUpperCase() || "·";

  return (
    <div className="grid grid-cols-[1fr_1.5fr_140px] items-center gap-3 px-4 py-3 border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[11px] font-[var(--font-mono)] font-[600] text-[var(--ink)]">
          {initials}
        </div>
        <div className="text-[14px] font-[500]">{row.name}</div>
      </div>
      <div className="text-[12px] text-[var(--muted)]">{row.email}</div>
      <div>
        <select
          value={row.role}
          onChange={onRoleChange}
          disabled={isSelf || mutation.isPending}
          className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] px-2 py-1.5 rounded-[5px] disabled:opacity-60"
          aria-label={`Role for ${row.name}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {error && (
          <div className="text-[11px] text-[var(--accent)] mt-1">{error}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `MembersView`**

```tsx
// components/settings/members/MembersView.tsx
"use client";

import { useState } from "react";
import { AddMemberForm } from "./AddMemberForm";
import { MemberRow } from "./MemberRow";
import type { MemberRow as Row } from "./types";

export function MembersView({
  initial,
  currentUserId,
}: {
  initial: Row[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);

  function upsert(next: Row) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === next.id);
      if (idx === -1) return [...prev, next];
      const out = prev.slice();
      out[idx] = next;
      return out;
    });
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Members
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Who can see and do what.
      </p>

      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] mb-4">
        {rows.map((row) => (
          <MemberRow
            key={row.id}
            row={row}
            isSelf={row.id === currentUserId}
            onUpdated={upsert}
          />
        ))}
      </div>

      <AddMemberForm onCreated={upsert} />
    </div>
  );
}
```

- [ ] **Step 4: Commit (still pending `AddMemberForm`)**

```bash
git add components/settings/members/MembersView.tsx components/settings/members/MemberRow.tsx lib/hooks/useMembers.ts
git commit -m "feat(settings): members list + role dropdown"
```

The build still won't compile until Task 10 adds `AddMemberForm`. That's expected.

---

## Task 10: `AddMemberForm`

**Files:**
- Create: `components/settings/members/AddMemberForm.tsx`

- [ ] **Step 1: Implement the form**

```tsx
// components/settings/members/AddMemberForm.tsx
"use client";

import { useState } from "react";
import { useCreateMember } from "@/lib/hooks/useMembers";
import type { MemberRole, MemberRow } from "./types";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function AddMemberForm({
  onCreated,
}: {
  onCreated: (row: MemberRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("crew");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateMember();

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
    mutation.mutate(
      { name, email, role, password },
      {
        onSuccess: (row) => {
          onCreated(row);
          reset();
          setOpen(false);
        },
        onError: (err: unknown) => {
          const msg =
            typeof err === "object" && err && "message" in err
              ? String((err as { message: string }).message)
              : "Failed to add member";
          setError(msg);
        },
      }
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      >
        + Invite member
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
        <input
          required
          minLength={8}
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px] font-[var(--font-mono)]"
          placeholder="At least 8 characters"
        />
      </Field>
      {error && (
        <div className="text-[12px] text-[var(--accent)]">{error}</div>
      )}
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
          {mutation.isPending ? "Adding…" : "Add member"}
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
    <label className="block">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: PASS (the Members page now resolves its imports cleanly).

- [ ] **Step 3: Lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/settings/members/AddMemberForm.tsx
git commit -m "feat(settings): add-member form on the Members page"
```

---

## Task 11: `/settings` index — filter by role; redirect Crew

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Update the page**

Replace the entire file with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Settings · SqFt" };

type SettingsLink = { href: string; title: string; description: string };

function settingsLinksFor(role: string): SettingsLink[] {
  const links: SettingsLink[] = [];
  if (role === "admin") {
    links.push({
      href: "/settings/workspace",
      title: "Workspace",
      description:
        "Company identity, brand, and the defaults that new quotes inherit.",
    });
    links.push({
      href: "/settings/members",
      title: "Members",
      description: "Add teammates and set what they can see and do.",
    });
  }
  links.push({
    href: "/settings/line-item-templates",
    title: "Line item templates",
    description:
      "Predefined line items your team can drop into any quote — name, description, rate, unit.",
  });
  return links;
}

export default async function SettingsPage() {
  const session = await requireSession();
  if (session.user.role === "crew") redirect("/schedule");

  const links = settingsLinksFor(session.user.role);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-6">
        Settings
      </h1>
      <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
        {links.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block px-4 py-3 hover:bg-[var(--surface-2)]"
            >
              <div className="text-[14px] font-[600]">{s.title}</div>
              <div className="text-[12px] text-[var(--muted)] mt-0.5">
                {s.description}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(app)/settings/page.tsx
git commit -m "feat(settings): filter index by role; redirect crew"
```

---

## Task 12: API gate migration — non-schedule routes

**Files:**
- Modify (add `minRole: "lead"` to every route option object — preserve all other options like `input`, `status`):
  - `app/api/dashboard/kpis/route.ts`
  - `app/api/dashboard/revenue/route.ts`
  - `app/api/estimates/route.ts`
  - `app/api/estimates/[id]/route.ts`
  - `app/api/quotes/route.ts`
  - `app/api/quotes/[id]/route.ts`
  - `app/api/quotes/[id]/send/route.ts`
  - `app/api/quotes/[id]/revise/route.ts`
  - `app/api/quotes/[id]/approval-token/route.ts`
  - `app/api/customers/route.ts`
  - `app/api/customers/[id]/route.ts`
  - `app/api/line-item-templates/route.ts`
  - `app/api/line-item-templates/[id]/route.ts`

- [ ] **Step 1: For each file, add `minRole: "lead"`**

Pattern. If the export currently looks like:
```ts
export const GET = apiRoute(async ({ orgId }) => { … });
```
Change to:
```ts
export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) => { … });
```

If the export already has options:
```ts
export const POST = apiRoute({ input: SomeSchema, status: 201 }, async (...) => { … });
```
Add the field:
```ts
export const POST = apiRoute(
  { minRole: "lead", input: SomeSchema, status: 201 },
  async (...) => { … }
);
```

Do this for every exported handler (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`) in each file in the list above.

- [ ] **Step 2: Smoke test — `POST /api/estimates` rejects crew**

Create `__tests__/api/estimates.role.test.ts` using the existing mocked-auth pattern (mirrors `__tests__/api/org.test.ts`):
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    estimate: { create: vi.fn() },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { POST } from "@/app/api/estimates/route";
import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function asRole(role: "admin" | "lead" | "crew") {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role } } as any
  );
}

function makePost() {
  const req = new Request("http://localhost/api/estimates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerId: 1 }),
  });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/estimates"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("POST /api/estimates — role gate", () => {
  it("401 for crew", async () => {
    asRole("crew");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    // Don't care about full handler behaviour here; we just need to verify
    // that the gate doesn't 401. Whatever the route does next can succeed
    // or fail — both indicate the gate was crossed.
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).not.toBe(401);
  });
});
```

(Tests focus on the gate. The full route behaviour is covered by the route's existing tests.)

- [ ] **Step 3: Run the integration test suite**

Run: `npx vitest run __tests__/api`
Expected: PASS. If existing tests fail because they use a non-lead session, update those test setups to use a lead or admin session (the gate is the new correct behaviour; tests using `role: "crew"` for these routes need to change).

- [ ] **Step 4: Run lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard app/api/estimates app/api/quotes app/api/customers app/api/line-item-templates __tests__/api/estimates.role.test.ts
git commit -m "feat(api): gate dashboard/estimates/quotes/customers/templates to lead+"
```

---

## Task 13: API gate migration — schedule and crew routes

**Files:**
- Modify:
  - `app/api/events/route.ts` (POST gets `minRole: "lead"`; GET unchanged)
  - `app/api/events/[id]/route.ts` (PATCH and DELETE get `minRole: "lead"`; GET if present unchanged)
  - `app/api/crew-members/route.ts` (POST gets `minRole: "lead"`; GET unchanged)
  - `app/api/crew-members/[id]/route.ts` (PATCH and DELETE get `minRole: "lead"`)

- [ ] **Step 1: Add `minRole: "lead"` to the listed mutations**

Same pattern as Task 12 — only the listed methods get the option.

- [ ] **Step 2: Add smoke tests**

Create `__tests__/api/events.role.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    crewMember: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/tenant", async () => {
  const { UnauthorizedError } = await import("@/lib/api/errors");
  return {
    getOrgId: vi.fn(async () => {
      const { auth } = await import("@/lib/auth");
      const session = await auth();
      if (!session?.user?.orgId) throw new UnauthorizedError();
      return session.user.orgId;
    }),
    requireSession: vi.fn(async () => {
      const { auth } = await import("@/lib/auth");
      const session = await auth();
      if (!session?.user) throw new UnauthorizedError();
      return session;
    }),
  };
});

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/events/route";
import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function asRole(role: "admin" | "lead" | "crew") {
  mockAuth.mockResolvedValue(
    // biome-ignore lint/suspicious/noExplicitAny: test stub session
    { user: { id: "u1", orgId: "org1", role } } as any
  );
}

function makeReq(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request("http://localhost/api/events", init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/events"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("events — role gate", () => {
  it("crew can GET", async () => {
    asRole("crew");
    const res = await GET(makeReq("GET"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("crew cannot POST", async () => {
    asRole("crew");
    const res = await POST(
      makeReq("POST", {
        type: "visit",
        title: "x",
        date: "2026-06-01",
        startTime: "09:00",
        endTime: "10:00",
      }),
      { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(401);
  });

  it("lead can POST (gate cleared)", async () => {
    asRole("lead");
    const res = await POST(
      makeReq("POST", {
        type: "visit",
        title: "x",
        date: "2026-06-01",
        startTime: "09:00",
        endTime: "10:00",
      }),
      { params: Promise.resolve({}) }
    );
    expect(res.status).not.toBe(401);
  });
});
```

- [ ] **Step 3: Run integration tests + lint**

Run: `npx vitest run __tests__/api && npx biome ci .`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/events app/api/crew-members __tests__/api/events.role.test.ts
git commit -m "feat(api): gate schedule/crew mutations to lead+; reads stay open"
```

---

## Task 14: Page-level redirect gates

**Files:**
- Modify (add the three-line gate at the top of each page server component):
  - `app/(app)/page.tsx` (dashboard — `lead`)
  - `app/(app)/customers/page.tsx` (`lead`)
  - `app/(app)/customers/[id]/page.tsx` (`lead`)
  - `app/(app)/estimates/page.tsx` (`lead`)
  - `app/(app)/estimates/[id]/page.tsx` (`lead`)
  - `app/(app)/quotes/page.tsx` (`lead`)
  - `app/(app)/quotes/[id]/page.tsx` (`lead`)
  - `app/(app)/quotes/[id]/signed/page.tsx` (`lead`)
  - `app/(app)/settings/line-item-templates/page.tsx` (`lead`)

- [ ] **Step 1: For each file above, add the gate**

For pages that are already server-async, add at the top of the component body:
```ts
const session = await requireSession();
if (!hasMinRole(session.user.role, "lead")) {
  redirect(homePathFor(session.user.role));
}
```

Add the imports at the top of the file (if not already present):
```ts
import { redirect } from "next/navigation";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";
```

If the page is currently a sync function (`export default function`), convert it to `export default async function` and `await requireSession()`. If the page already calls `requireSession`/`getOrgId`, use the existing session reference — don't duplicate the call.

`/schedule/page.tsx` and `/crew/page.tsx` are NOT modified (Crew is allowed there). `/settings/workspace/page.tsx` already gates to admin — leave its existing check alone.

- [ ] **Step 2: Run build to catch any sync-to-async slip-ups**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)
git commit -m "feat(app): page-level redirect gates for lead+ surfaces"
```

---

## Task 15: `CalendarGrid` `canEdit` prop

**Files:**
- Modify: `components/schedule/CalendarGrid.tsx`
- Modify: `app/(app)/schedule/page.tsx`

- [ ] **Step 1: Look at how `CalendarGrid` currently mounts `EventFormPanel`**

Read the relevant sections of `components/schedule/CalendarGrid.tsx` (the file is ~626 lines). Identify:
- The click handler that opens the create panel.
- The render branch for `EventFormPanel`.
- Per-event edit/delete affordances.

- [ ] **Step 2: Add a `canEdit` prop to `ScheduleView` (the export `CalendarGrid.tsx` exposes)**

Add `canEdit: boolean` as a required prop. When `false`:
- Suppress the click-to-create handler on empty cells (don't attach it, or short-circuit at the top of the handler).
- Don't render edit/delete affordances on event cards.
- Don't mount `EventFormPanel`.

Keep read-only event detail (hover tooltips, basic event card display) intact.

- [ ] **Step 3: Pass `canEdit` from the schedule page**

```tsx
// app/(app)/schedule/page.tsx
import { ScheduleView } from "@/components/schedule/CalendarGrid";
import { hasMinRole } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Schedule - SqFt" };

export default async function SchedulePage() {
  const session = await requireSession();
  const canEdit = hasMinRole(session.user.role, "lead");
  return <ScheduleView canEdit={canEdit} />;
}
```

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual smoke (optional)**

Run dev server: `npm run dev`
Log in as the seeded `demo@sqft.dev` (admin), visit `/schedule` — affordances visible.
(Crew login will be available after Task 19.)

- [ ] **Step 6: Commit**

```bash
git add components/schedule/CalendarGrid.tsx app/\(app\)/schedule/page.tsx
git commit -m "feat(schedule): canEdit prop hides affordances for crew"
```

---

## Task 16: `CrewRosterView` `canEdit` prop

**Files:**
- Modify: `components/crew/CrewRosterView.tsx`
- Modify: `app/(app)/crew/page.tsx`

- [ ] **Step 1: Add `canEdit` prop**

In `components/crew/CrewRosterView.tsx`, add `canEdit: boolean` as a required prop. When `false`:
- Don't render the add-member input/button.
- Don't render inline-edit affordances (clicking a name should not open editing).
- Don't render archive/restore buttons.
- The list itself stays — Crew can read.

- [ ] **Step 2: Pass `canEdit` from the crew page**

```tsx
// app/(app)/crew/page.tsx
import { CrewRosterView } from "@/components/crew/CrewRosterView";
import { hasMinRole } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Crew · SqFt" };

export default async function CrewPage() {
  const session = await requireSession();
  const canEdit = hasMinRole(session.user.role, "lead");
  return <CrewRosterView canEdit={canEdit} />;
}
```

- [ ] **Step 3: Build + lint**

Run: `npx tsc --noEmit && npx biome ci .`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/crew/CrewRosterView.tsx app/\(app\)/crew/page.tsx
git commit -m "feat(crew): canEdit prop hides roster affordances for crew"
```

---

## Task 17: `AppNav` — filter tabs by role

**Files:**
- Modify: `components/ui/AppNav.tsx`

- [ ] **Step 1: Filter `NAV_TABS` by role**

In `components/ui/AppNav.tsx`, near the top of the component body (after `const { data: session } = useSession();`), add:
```ts
const role = session?.user?.role ?? "crew";
const tabs = navTabsFor(role);
```

Add at the bottom of the file (alongside other helpers):
```ts
function navTabsFor(role: string) {
  if (role === "crew") {
    return NAV_TABS.filter((t) => t.href === "/schedule");
  }
  return NAV_TABS;
}
```

Replace both `NAV_TABS.map(...)` calls in the JSX (desktop + mobile) with `tabs.map(...)`.

- [ ] **Step 2: Mobile bottom-nav grid columns**

The mobile nav currently uses `grid-cols-6`. For Crew it would render a single tab in a 6-column grid (left-aligned with empty space). Change the grid template to be dynamic:
```ts
className={cn(
  "grid gap-0.5 max-w-[640px] mx-auto",
  tabs.length === 6 && "grid-cols-6",
  tabs.length < 6 && "justify-center",
  tabs.length === 1 && "grid-cols-1"
)}
```

(Crew sees one tab centered; admin/lead see six.)

- [ ] **Step 3: Lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ui/AppNav.tsx
git commit -m "feat(nav): hide tabs from crew (schedule only)"
```

---

## Task 18: Login redirect via `homePathFor`

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Replace the hardcoded `/` redirect**

In `app/(auth)/login/page.tsx`, replace this block:
```ts
const result = await signIn("credentials", {
  email,
  password,
  redirect: false,
});
setLoading(false);

if (result?.error) {
  setError("Incorrect email or password.");
} else {
  router.push("/");
  router.refresh();
}
```

With:
```ts
const result = await signIn("credentials", {
  email,
  password,
  redirect: false,
});

if (result?.error) {
  setLoading(false);
  setError("Incorrect email or password.");
  return;
}

// Resolve the role via the session endpoint, then route home.
const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
const sessionData = (await sessionRes.json()) as {
  user?: { role?: string };
} | null;
const role = sessionData?.user?.role ?? "lead";
setLoading(false);
router.push(role === "crew" ? "/schedule" : "/");
router.refresh();
```

(NextAuth exposes `/api/auth/session` for the current session. We refetch once post-sign-in to read the role and pick the home page. `homePathFor` isn't imported here because that's a server helper; the redirect logic is small enough to inline.)

- [ ] **Step 2: Lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 3: Manual smoke (optional, after seed update in Task 19)**

Sign in as `crew@sqft.dev` (after Task 19) and verify landing on `/schedule`.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/login/page.tsx
git commit -m "feat(auth): login redirects crew to /schedule, others to /"
```

---

## Task 19: Seed Lead and Crew demo users

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Find the admin seed block(s)**

Run: `grep -n 'role: "admin"' prisma/seed.ts`
Note the location(s) where the demo admin (`demo@sqft.dev`) and the second-org admin (`demo2@sqft.dev`) are created.

- [ ] **Step 2: After each admin creation, add Lead and Crew users for the same org**

For the primary demo org (the one with `demo@sqft.dev`):
```ts
const leadHash = await bcrypt.hash("demo1234", 10);
await prisma.user.upsert({
  where: { email: "lead@sqft.dev" },
  update: {},
  create: {
    name: "Marcus Chen",
    email: "lead@sqft.dev",
    password: leadHash,
    role: "lead",
    orgId: org.id, // use the variable name that holds the org in this scope
  },
});

const crewHash = await bcrypt.hash("demo1234", 10);
await prisma.user.upsert({
  where: { email: "crew@sqft.dev" },
  update: {},
  create: {
    name: "Diego Marín",
    email: "crew@sqft.dev",
    password: crewHash,
    role: "crew",
    orgId: org.id,
  },
});
```

Adapt the `orgId` variable name to whatever the seed script uses. Use `upsert` so re-seeding is idempotent. Do NOT add equivalents for the second org (`demo2`) — one set is enough for manual testing.

- [ ] **Step 3: Run the seed against a dev DB**

Run: `npx prisma db push --force-reset && npx prisma db seed`
Expected: No errors. Verify users with `npx prisma studio` or:
```
psql "$DATABASE_URL" -c 'SELECT email, role FROM "User";'
```

- [ ] **Step 4: Lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): add lead@sqft.dev and crew@sqft.dev demo users"
```

---

## Task 20: Playwright user fixtures (isolated per-test users)

**Files:**
- Create: `tests/e2e/fixtures/users.ts`

- [ ] **Step 1: Implement the fixture**

```ts
// tests/e2e/fixtures/users.ts
/**
 * Per-test user fixtures. Each call creates a fresh user with a unique
 * email so parallel tests don't collide. The caller is responsible for
 * deleting the user (or batch-deleting after the suite via the cleanup
 * helper).
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type Role = "admin" | "lead" | "crew";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
  orgId: string;
};

const PLAYWRIGHT_PASSWORD = "test-pw-1234";

/**
 * Create a user in the demo org with the given role. The email is
 * "{role}-{uuid}@playwright.test", which never collides with seed data.
 */
export async function createTestUser(role: Role): Promise<TestUser> {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "pinecrest" }, // adapt if the demo org slug differs
  });
  const email = `${role}-${randomUUID()}@playwright.test`;
  const password = PLAYWRIGHT_PASSWORD;
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name: `Test ${role}`,
      email,
      password: hash,
      role,
      orgId: org.id,
    },
  });
  return { id: user.id, email, password, role, orgId: org.id };
}

export async function deleteTestUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => {});
}

/**
 * Login helper that drives the login form, awaits navigation, and
 * returns when the page is settled on the post-login route. Works for
 * any role — caller verifies the landing URL.
 */
export async function loginAsTestUser(
  page: import("@playwright/test").Page,
  user: TestUser
): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await Promise.all([
    page.waitForURL(user.role === "crew" ? "/schedule" : "/"),
    page.click('button[type="submit"]'),
  ]);
}
```

- [ ] **Step 2: Verify the demo org slug**

Run: `grep -n 'slug:' prisma/seed.ts | head -5`
If the demo org slug is not `"pinecrest"`, update the `findFirstOrThrow` `where` clause to match.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/users.ts
git commit -m "test(e2e): add per-test user fixtures (createTestUser)"
```

---

## Task 21: Playwright — Crew login scenarios

**Files:**
- Create: `tests/e2e/role-crew.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/role-crew.spec.ts
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUser("crew");
});

test.afterAll(async () => {
  await deleteTestUser(user.id);
});

test("crew login lands on /schedule", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(page).toHaveURL("/schedule");
  await ctx.close();
});

test("crew nav shows only Schedule", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  const desktopNav = page.locator('nav[aria-label="Main navigation"]').first();
  await expect(desktopNav.getByRole("link", { name: "Schedule" })).toBeVisible();
  await expect(desktopNav.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Customers" })).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Estimates" })).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Quotes" })).toHaveCount(0);
  await expect(desktopNav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await ctx.close();
});

test.describe("crew page redirects", () => {
  const restricted = [
    "/",
    "/customers",
    "/estimates",
    "/quotes",
    "/settings",
    "/settings/workspace",
    "/settings/members",
    "/settings/line-item-templates",
  ];

  for (const path of restricted) {
    test(`GET ${path} redirects to /schedule`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginAsTestUser(page, user);
      await page.goto(path);
      await expect(page).toHaveURL("/schedule");
      await ctx.close();
    });
  }
});

test("crew schedule has no create affordance", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  // The "New event" / "+" button used by lead+ must not be present.
  await expect(
    page.getByRole("button", { name: /new event|add event|create event/i })
  ).toHaveCount(0);
  await ctx.close();
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/role-crew.spec.ts`
Expected: PASS (assuming the dev server is running per Playwright config; check `playwright.config.ts` for the `webServer` block).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/role-crew.spec.ts
git commit -m "test(e2e): crew login nav + redirect scenarios"
```

---

## Task 22: Playwright — Lead login scenarios

**Files:**
- Create: `tests/e2e/role-lead.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/role-lead.spec.ts
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUser("lead");
});

test.afterAll(async () => {
  await deleteTestUser(user.id);
});

test("lead login lands on /", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await expect(page).toHaveURL("/");
  await ctx.close();
});

test("lead /settings shows only line-item-templates", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /line item templates/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Workspace$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Members$/ })).toHaveCount(0);
  await ctx.close();
});

test("lead is redirected from /settings/workspace and /settings/members", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, user);

  await page.goto("/settings/workspace");
  await expect(page).toHaveURL("/settings");

  await page.goto("/settings/members");
  await expect(page).toHaveURL("/settings");

  await ctx.close();
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/role-lead.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/role-lead.spec.ts
git commit -m "test(e2e): lead login settings-filter + redirect scenarios"
```

---

## Task 23: Playwright — Admin / Members page scenarios

**Files:**
- Create: `tests/e2e/members.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/members.spec.ts
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginAsTestUser,
  type TestUser,
} from "./fixtures/users";

let admin: TestUser;
let target: TestUser;

test.beforeAll(async () => {
  admin = await createTestUser("admin");
  target = await createTestUser("crew");
});

test.afterAll(async () => {
  await deleteTestUser(admin.id);
  await deleteTestUser(target.id);
});

test("admin sees Members card on /settings", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /^Members$/ })).toBeVisible();
  await ctx.close();
});

test("admin can change another member's role and refresh sees the change", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  // Find the row for the test target by email.
  const row = page.locator(`text=${target.email}`).locator("..").locator("..");
  const select = row.locator("select");
  await expect(select).toHaveValue("crew");

  await select.selectOption("lead");
  // Wait for the PATCH to round-trip (the select re-enables when mutation settles).
  await expect(select).not.toBeDisabled();

  await page.reload();
  const reloadedSelect = page
    .locator(`text=${target.email}`)
    .locator("..")
    .locator("..")
    .locator("select");
  await expect(reloadedSelect).toHaveValue("lead");

  await ctx.close();
});

test("admin cannot change their own role (dropdown disabled)", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  const ownRow = page.locator(`text=${admin.email}`).locator("..").locator("..");
  const ownSelect = ownRow.locator("select");
  await expect(ownSelect).toBeDisabled();

  await ctx.close();
});

test("admin can invite a new member", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsTestUser(page, admin);
  await page.goto("/settings/members");

  await page.getByRole("button", { name: /invite member/i }).click();

  const newEmail = `invited-${Date.now()}@playwright.test`;
  await page.getByLabel("Name").fill("Invited Person");
  await page.getByLabel("Email").fill(newEmail);
  await page.getByLabel("Role").selectOption("crew");
  await page.getByLabel("Temporary password").fill("invitedpw1234");
  await page.getByRole("button", { name: /add member/i }).click();

  await expect(page.locator(`text=${newEmail}`)).toBeVisible();

  // Cleanup: delete via Prisma directly so we don't depend on a delete API.
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.deleteMany({ where: { email: newEmail } });

  await ctx.close();
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/members.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/members.spec.ts
git commit -m "test(e2e): admin Members page interactions"
```

---

## Task 24: Final sweep — full test run + lint

**Files:** None (verification only).

- [ ] **Step 1: Run the full unit/integration suite**

Run: `npx vitest run`
Expected: PASS. Any failure here is a regression caused by gate changes — most likely an integration test that was previously seeding with `role: "owner"` (no longer valid) or relying on `apiRoute` without a session. Update the offending test setup to use `role: "admin"` or `role: "lead"` as appropriate.

- [ ] **Step 2: Run Playwright**

Run: `npx playwright test`
Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `npx biome ci .`
Expected: PASS.

- [ ] **Step 4: Check the schema/seed consistency**

Run: `npx prisma db push --force-reset && npx prisma db seed`
Expected: Seed completes without errors and produces both demo users for the primary org.

- [ ] **Step 5: Final commit (if there were any test fixups)**

```bash
git add -A
git commit -m "test: align fixtures with new role gates" || echo "nothing to commit"
```
