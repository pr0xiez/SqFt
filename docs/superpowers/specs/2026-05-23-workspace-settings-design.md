# Workspace Settings — Spec A

Date: 2026-05-23
Scope: page shell + Identity + Brand & Quote Style + Estimating Defaults.

Sections shown in `design/SqFt - Settings.html` but **out of scope** for this
spec: Notifications (#04), Members (#05), Integrations (#06). They get their
own specs later. Their TOC entries and section markup are not rendered.

## Goal

Admins configure workspace-level fields that change how new quotes are built
and how the customer-facing public quote page (`/q/[token]`) presents the
business. One page, one form, one save.

## Decisions

- **URL.** New page at `/settings/workspace`. The existing `/settings` index
  stays; a new entry is added to its `SETTINGS_LINKS` list pointing at
  `/settings/workspace`, ordered above the existing line-item-templates link.
- **Access.** Admin-only. Non-admins who hit `/settings/workspace` are
  redirected to `/settings`. The PATCH endpoint rejects non-admins with
  `UNAUTHORIZED`.
- **Role redesign — values only, no enforcement.** Land the full
  taxonomy `admin | lead | crew` now so role data isn't migrated twice.
  - `owner` → `admin` (collapse; the existing `admin` value stays).
  - `member` → `crew`.
  - `lead` is a new valid value; no user has it yet (no UI assigns it
    until Spec C).
  - Schema default for `User.role` changes from `"member"` to `"crew"`
    (safest default for future invitees).
  - **Enforcement still scoped to admin-only on this page.** No
    Lead/Crew permission checks anywhere else in this spec — Spec C
    builds the Members UI and the permission gates on jobs, schedule,
    and quote editing.
- **Defaults flow.** Org-level defaults are copied onto the Quote at
  creation time (no live reference, no backfill of existing quotes). Same
  copy-not-reference pattern that `LineItemTemplate` already uses.
- **Brand on quotes.** Brand color, tagline, license-footer toggle are read
  live from `Organization` by `/q/[token]` at render time. Not snapshotted.
  Acceptable because brand fields are presentation-only and don't affect
  numbers.
- **Brand color scope on the settings page itself.** Applied via inline
  `style={{ "--brand": current.brandColor }}` only to the `<BrandPreview>`
  container. The contractor's app chrome (nav, tabs, other accent surfaces)
  is unaffected by swatch clicks. This also limits the blast radius if the
  picked color reads badly in dark mode — only the preview/quote page have
  to handle that contrast problem.
- **Save UX.** Single all-or-nothing form, sticky save bar appears when any
  field is dirty. Save = one PATCH with the changed fields. Revert resets
  to the initially-loaded values (in-memory; no reload). `beforeunload`
  prompt while dirty.
- **Monogram is omitted.** No schema field, no UI field, no preview seal.
  Earlier draft had this; dropped as not worth the trouble.

## Schema changes

### `Organization` — new fields

All have defaults so existing rows need no backfill beyond the data
migration the rename requires.

| Field                 | Type      | Default                | Notes                                            |
|-----------------------|-----------|------------------------|--------------------------------------------------|
| `timezone`            | `String`  | `"America/New_York"`   | IANA TZ                                          |
| `locale`              | `String`  | `"en-US"`              | UI choice limited to `en-US | en-CA | es-MX`    |
| `brandColor`          | `String`  | `"#c0341a"`            | hex `#RRGGBB`, validated, stored lowercase       |
| `tagline`             | `String?` | `null`                 | optional, max 120 chars                          |
| `showLicenseOnQuotes` | `Boolean` | `true`                 | toggle in Brand section                          |
| `defaultDepositPct`   | `Float`   | `0.30`                 | 0.0–1.0                                          |
| `defaultValidityDays` | `Int`     | `21`                   | 1–365                                            |
| `defaultUnitLabel`    | `String`  | `"ft²"`                | one of `ft² | yd² | m²`                          |
| `defaultTerms`        | `String`  | `""`                   | multi-line, max 2000 chars                       |

### `Quote` — new fields

So defaults are captured per-quote at creation, not read live:

| Field          | Type     | Default | Notes                                          |
|----------------|----------|---------|------------------------------------------------|
| `terms`        | `String` | `""`    | copied from `Organization.defaultTerms`        |
| `validityDays` | `Int`    | `21`    | copied from `Organization.defaultValidityDays` |

The existing `Quote.depositPct` column keeps its `@default(0.50)` as a
schema-level safety net, but quote-creation code now overrides it with
`org.defaultDepositPct`.

### Role redesign (data migration + code updates)

```sql
UPDATE "User" SET role = 'admin' WHERE role = 'owner';
UPDATE "User" SET role = 'crew'  WHERE role = 'member';
```

Schema change on `User.role`:

```prisma
role String @default("crew") // admin | lead | crew
```

(Default was `"member"`. New default `"crew"` is the least-privileged
role, safest for future invite flows in Spec C. No public signup exists
today, and the seed creates admins explicitly, so the default isn't
exercised yet — but set it correctly now.)

Code updates in the same PR (4 production-code references found, all
`role: "owner"` → `role: "admin"`):

- `app/api/q/[token]/accept/route.ts:100` — `where: { orgId, role: "owner" }`
- `app/api/q/[token]/decline/route.ts:60` — same
- `lib/repositories/quoteRepo.ts:79` — type literal in a Prisma include shape
- `lib/repositories/quoteRepo.ts:571` — runtime query

All four do "find the lowest-id user with role=owner, take 1, get their
email" for outbound notifications. After rename they become "lowest-id
admin", which in practice is still the org creator — semantically the
same. Behavior change worth noting: an org with multiple admins still
notifies only one (the lowest-id), same as today.

Plus `prisma/seed.ts` lines 145, 168 (`role: "owner"` → `role: "admin"`).
The seed does not currently create users with `role: "member"`, so no
new seed lines are needed for `crew`. If a seed update later adds a
non-admin user, it should use `"crew"` or `"lead"`.

## URL & page composition

```
app/(app)/settings/
  page.tsx                 ← unchanged shape; add "Workspace" entry above line-item-templates
  workspace/
    page.tsx               ← NEW
  line-item-templates/
    page.tsx               ← unchanged
```

`app/(app)/settings/page.tsx` — append to `SETTINGS_LINKS`:

```ts
{
  href: "/settings/workspace",
  title: "Workspace",
  description:
    "Company identity, brand, and the defaults that new quotes inherit.",
}
```

Order it first so it sits above line-item-templates.

`app/(app)/settings/workspace/page.tsx` (server component):

1. `const session = await requireSession();`
2. `if (session.user.role !== "admin") redirect("/settings");`
3. Load `Organization` via Prisma with the full editable field set
   (everything in the Organization table above plus `id`, `name`, and
   `licenseNumber` for the preview).
4. Render `<WorkspaceSettingsView initial={...} />`.

`export const metadata = { title: "Workspace · Settings · SqFt" };`

## Component breakdown

All new files live under `components/settings/workspace/`:

```
WorkspaceSettingsView.tsx     client root. form state + dirty + save mutation
IdentitySection.tsx           name, timezone, locale
BrandSection.tsx              swatch picker, hex input, tagline, license toggle
BrandPreview.tsx              live preview, scoped --brand
DefaultsSection.tsx           deposit dial, validity input, unit seg, terms textarea
SaveBar.tsx                   sticky save bar
Toc.tsx                       sticky TOC with scroll-spy
Masthead.tsx                  title block with company name reflected in the dek
```

### `WorkspaceSettingsView`

- Owns a single typed `WorkspaceSettingsForm` state object that mirrors the
  PATCH payload.
- `initial` prop = the server-loaded org. Stored in a ref + reset target.
- `dirty = !shallowEqual(initial, current)` (cheap JSON.stringify works
  fine for this flat shape).
- Section components receive their slice of state and a single
  `onChange(patch: Partial<WorkspaceSettingsForm>)` callback. No section
  owns its own state — keeps live preview wiring trivial.
- Save: react-query `useMutation` calling `PATCH /api/org`. On success,
  the mutation returns the updated org; we reset `initial` to the
  response so `dirty` clears and any server-coerced values (e.g.
  normalized hex) propagate.
- Revert: `setCurrent(initial)`. No reload.
- `beforeunload` listener attached when `dirty === true`, removed when
  `false`. No Next-router interception in this spec (it'd be nice but is
  not on the design's critical path).

### `BrandPreview`

- Mirrors the design's preview block (ribbon, ledger row, line items,
  totals, footer).
- Numbers in the preview are hardcoded sample data — the design already
  does this and notes "Sample numbers — your saved settings apply to new
  quotes."
- Inline `style={{ "--brand": current.brandColor } as React.CSSProperties}`
  on the root preview container so it's the only thing tinted.
- License footer line is conditionally rendered on `showLicenseOnQuotes`.

### Reused

- `AppNav` already has `ThemeToggle`. The design's nav theme toggle is
  already covered — nothing to build there.
- The page uses the same CSS variable system the app already has
  (`--surface`, `--ink`, `--line`, etc. in `app/globals.css`).

## API

`app/api/org/route.ts` (existing file):

- `GET` — extend its `select` to include every editable field plus
  `licenseNumber` (preview uses it). Still no auth gate beyond
  `apiRoute`'s existing org-resolution.
- `PATCH` (new) — wrapped in a new `adminRoute(...)`. Zod input schema
  with every field optional (PATCH semantics, only updates what's sent).
  Returns the same shape as GET.

### Validation rules

| Field                 | Rule                                                                |
|-----------------------|---------------------------------------------------------------------|
| `name`                | non-empty, max 100                                                  |
| `timezone`            | regex `^[A-Za-z]+/[A-Za-z_]+(/[A-Za-z_]+)?$`                         |
| `locale`              | enum `en-US | en-CA | es-MX`                                        |
| `brandColor`          | regex `^#[0-9a-fA-F]{6}$`, normalized to lowercase before save      |
| `tagline`             | optional, max 120; empty string stored as `null`                    |
| `showLicenseOnQuotes` | boolean                                                             |
| `defaultDepositPct`   | number, 0 ≤ x ≤ 1                                                    |
| `defaultValidityDays` | integer, 1 ≤ x ≤ 365                                                 |
| `defaultUnitLabel`    | enum `ft² | yd² | m²`                                                |
| `defaultTerms`        | string, max 2000                                                    |

Errors come out of the existing envelope:

- `UNAUTHORIZED` (401) — no session, no org, or role ≠ admin
- `VALIDATION_FAILED` (400) — Zod failure with `details`

### `adminRoute` wrapper

Add to `lib/api/route.ts`, mirroring the `apiRoute` / `publicRoute`
shape:

```ts
export function adminRoute<TInput, TParams>(
  optionsOrHandler: RouteOptions<TInput> | Handler,
  maybeHandler?: Handler,
): NextRouteHandler
```

Internally it does what `apiRoute` does plus a role check:

```ts
const session = await requireSession();
if (session.user.role !== "admin") throw new UnauthorizedError();
const orgId = session.user.orgId;
```

Reusable for future admin-only endpoints (Spec C will use it).

## Quote-creation wiring

Production quote creation goes through two paths in
`lib/repositories/quoteRepo.ts`:

- `lib/repositories/quoteRepo.ts:194` — `tx.quote.create` for new quotes
  from an estimate.
- `lib/repositories/quoteRepo.ts:349` — `tx.quote.create` for the revise
  flow (clones an existing quote). Revise must preserve the predecessor's
  values, NOT pull fresh defaults — its existing copy-from-source
  behavior is correct; it should pass through `depositPct`, `terms`,
  `validityDays` from the source quote unchanged.

For the first path (genuine new quote), read the caller's Organization
and set on the new Quote row:

- `depositPct ← org.defaultDepositPct`
- `terms ← org.defaultTerms`
- `validityDays ← org.defaultValidityDays`

Default `LineItem` creation: the two `lib/repositories/quoteRepo.ts`
`lineItem.createMany` calls (lines 261 and 366) inherit `unitLabel` from
their source today. For the new-from-estimate path, when no source
unit exists, use `org.defaultUnitLabel`. Revise path keeps source units
unchanged.

`Organization` is already loaded by these paths for tenant checks — add
the new fields to the existing select, no new query.

Seed (`prisma/seed.ts`) creates quotes directly with hardcoded values;
the seed should keep working as-is. Update its hardcoded `depositPct`
values to match the new default (`0.30`) if any happen to read more
naturally; otherwise leave the seed quotes alone.

## `/q/[token]` consumption

Out of scope for the page work, but the customer-facing public quote page
will need (in a follow-up or as part of implementation, depending on what
the existing page already does):

- Read `Organization.brandColor`, `tagline`, `showLicenseOnQuotes`.
- Apply `brandColor` via a scoped CSS variable on the quote's outer
  container.
- **Contrast responsibility lives here.** Whichever component renders the
  brand color is responsible for ensuring legibility against its
  background. If we later want a dark mode for `/q/[token]`, that page
  picks the foreground based on the chosen `brandColor`'s luminance. Not
  this spec's problem to solve, but called out so it doesn't get lost.

## Testing

Vitest unit:

- Zod schema rejects invalid hex, invalid timezone, out-of-range deposit
  (negative, > 1), out-of-range validity (0, 366), unknown locale,
  unknown unit, oversized strings.
- Zod schema normalizes hex to lowercase.

Vitest integration (uses the existing test-DB harness):

- `PATCH /api/org` 401 when no session.
- `PATCH /api/org` 401 when role = member.
- `PATCH /api/org` 200 and DB updated when role = admin.
- `PATCH /api/org` partial payload only updates included fields (the
  ones omitted retain their previous values).
- `VALIDATION_FAILED` envelope shape on bad input.
- Quote creation (existing tests + 1 new): a new Quote row has its
  `depositPct`, `terms`, `validityDays` set from the org's defaults; a
  new default LineItem (if any) has its `unitLabel` set from the org.

Playwright (optional smoke, low priority):

- Load `/settings/workspace` as an admin seed user, change brand color
  swatch, click Save, reload, verify the swatch is still selected and
  the hex input reflects it.

## What this spec does NOT do

- Notifications, Members, Integrations sections.
- Any UI for changing roles. (Admin-only gating uses the role value
  already on the user row, set by seed.)
- Lead/Crew **enforcement**. The values land in the data and schema,
  but no code branches on `role === "lead"` or `role === "crew"` in
  this spec — Spec C builds the permission gates across jobs, schedule,
  and quote editing.
- Pre-existing-quote backfill of new defaults.
- A brand-aware redesign of `/q/[token]`. Brand fields are saved; how
  the public quote page consumes them can be a follow-up if the current
  page doesn't already.
- Theme toggle in the page (lives in `AppNav` already).
- Custom router-aware unsaved-changes modal (only `beforeunload`).

## Open follow-up specs (informational)

- Spec B — Notifications preferences.
- Spec C — Members & role redesign (introduces Admin / Lead / Crew,
  invite flow, permission enforcement across the app).
- Spec D — Integrations (QuickBooks Online, Stripe, Google Calendar);
  each likely warrants its own sub-spec.
