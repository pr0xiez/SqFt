# New Customer & Address Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the new-customer name into First/Last boxes, widen its drawer, replace the single address field with structured inputs backed by Geoapify autocomplete, and add an "Open in Google Maps" button per location.

**Architecture:** Name split is UI-only (two boxes compose into the existing `Customer.name`). `Location` gains structured columns (`street`, `unit`, `city`, `state`, `postalCode`, `lat`, `lon`) while keeping `address` as a derived one-line string written on every create via a pure `formatAddress` helper — so all existing `.address` readers and snapshots keep working untouched. Autocomplete runs through a server proxy route (`/api/address/autocomplete`) so the Geoapify key stays server-side and the provider is swappable behind a small adapter.

**Tech Stack:** Next.js (custom build, see `node_modules/next/dist/docs/`), Prisma + Postgres (Neon), Zod, React Query, Vitest (lib/repo unit tests), Playwright (e2e), Biome (lint).

---

## Migration safety note (read first)

`prisma migrate deploy` runs against a **populated** Neon DB on every deploy. Adding `NOT NULL` columns with no default fails on existing rows (Postgres 23502) — see `docs/superpowers/specs`/prior incidents. Per the design we do **not** backfill, but we also must not break the deploy or cascade-delete site measures. Therefore the new required structured columns are added as **`NOT NULL DEFAULT ''`**. Existing location rows keep their old derived `address` and get empty structured parts; every new/updated location always writes real values (enforced by Zod at the API boundary). `lat`/`lon` are nullable. This keeps the migration non-destructive and deploy-safe while still requiring structured input in the app. Never squash migrations; add this one on top.

## File Structure

**Create:**
- `lib/locations/formatAddress.ts` — pure helper: structured parts → one-line `address`.
- `__tests__/lib/locations/formatAddress.test.ts` — unit tests for the helper.
- `lib/address/geoapify.ts` — pure mapper: Geoapify JSON → normalized suggestion list (+ fetch wrapper).
- `__tests__/lib/address/geoapify.test.ts` — unit tests for the mapper.
- `app/api/address/autocomplete/route.ts` — server proxy route.
- `prisma/migrations/20260605120000_location_structured_address/migration.sql` — schema migration.

**Modify:**
- `prisma/schema.prisma` — `Location` model: add columns.
- `lib/locations/schema.ts` — structured Zod input.
- `lib/repositories/locationRepo.ts` — accept structured parts, derive `address`.
- `lib/hooks/useLocations.ts` — expand `Location` + `CreateLocationInput` types.
- `components/customers/LocationsCard.tsx` — structured form, autocomplete dropdown, Maps button.
- `components/customers/CustomerDetail.tsx` — `handleAddLocation` passes structured payload.
- `components/customers/NewCustomerPanel.tsx` — First/Last boxes, wider drawer.
- `prisma/seed.ts` — structured location seed data.
- `tests/e2e/fixtures/seed.ts` — structured fixture defaults.
- `__tests__/repositories/locationRepo.test.ts` — structured create calls.
- `tests/e2e/locations.spec.ts` and `tests/e2e/customer-detail.spec.ts` — structured assertions.
- `.env.example` — document `GEOAPIFY_API_KEY`.

---

## Task 1: `formatAddress` helper

**Files:**
- Create: `lib/locations/formatAddress.ts`
- Test: `__tests__/lib/locations/formatAddress.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/locations/formatAddress.test.ts
import { describe, expect, it } from "vitest";
import { formatAddress } from "@/lib/locations/formatAddress";

describe("formatAddress", () => {
  it("joins all parts in US single-line order", () => {
    expect(
      formatAddress({
        street: "1247 Elm St",
        unit: "Apt 2",
        city: "Columbus",
        state: "OH",
        postalCode: "43215",
      })
    ).toBe("1247 Elm St, Apt 2, Columbus, OH 43215");
  });

  it("omits empty/whitespace parts and trims", () => {
    expect(
      formatAddress({
        street: " 89 Oak Ave ",
        unit: "",
        city: "Worthington",
        state: "OH",
        postalCode: "",
      })
    ).toBe("89 Oak Ave, Worthington, OH");
  });

  it("returns empty string when everything is blank", () => {
    expect(
      formatAddress({ street: "", unit: "", city: "", state: "", postalCode: "" })
    ).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/locations/formatAddress.test.ts`
Expected: FAIL — cannot find module `@/lib/locations/formatAddress`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/locations/formatAddress.ts
export interface AddressParts {
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  postalCode: string;
}

/**
 * Compose a one-line US address from structured parts. This is the value
 * stored in the derived `Location.address` column that all list views and
 * estimate/invoice snapshots read. Empty parts are skipped; `state` and
 * `postalCode` join with a space (e.g. "OH 43215"), everything else with ", ".
 */
export function formatAddress(parts: AddressParts): string {
  const street = parts.street.trim();
  const unit = (parts.unit ?? "").trim();
  const city = parts.city.trim();
  const state = parts.state.trim();
  const postalCode = parts.postalCode.trim();

  const stateZip = [state, postalCode].filter(Boolean).join(" ");
  return [street, unit, city, stateZip].filter(Boolean).join(", ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/locations/formatAddress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/locations/formatAddress.ts __tests__/lib/locations/formatAddress.test.ts
git commit -m "feat(locations): add formatAddress helper for derived address column"
```

---

## Task 2: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma:93-108` (Location model)
- Create: `prisma/migrations/20260605120000_location_structured_address/migration.sql`

- [ ] **Step 1: Edit the `Location` model**

Replace the field block in `prisma/schema.prisma` (currently `address`, `label`, `notes`, `createdAt`) so the model reads:

```prisma
model Location {
  id         Int          @id @default(autoincrement())
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  customerId Int
  customer   Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  // Derived one-line address, composed from the structured parts below via
  // lib/locations/formatAddress on every create. Kept so existing list views
  // and estimate/invoice snapshots that read `address` need no changes.
  address    String
  street     String       @default("")
  unit       String?
  city       String       @default("")
  state      String       @default("")
  postalCode String       @default("")
  lat        Float?
  lon        Float?
  label      String?
  notes      String?
  createdAt  DateTime     @default(now())

  siteMeasures SiteMeasure[]

  @@index([orgId])
  @@index([customerId])
}
```

- [ ] **Step 2: Create the migration SQL by hand**

Create `prisma/migrations/20260605120000_location_structured_address/migration.sql`:

```sql
-- Structured address columns on Location. Required parts get DEFAULT '' so the
-- migration is non-destructive on the populated Neon DB (no 23502 on existing
-- rows). New/updated rows always write real values (enforced by Zod). lat/lon
-- are nullable. The derived `address` column is unchanged.
ALTER TABLE "Location" ADD COLUMN "street" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "unit" TEXT;
ALTER TABLE "Location" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "postalCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Location" ADD COLUMN "lon" DOUBLE PRECISION;
```

- [ ] **Step 3: Apply the migration locally and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration `20260605120000_location_structured_address` applied; client regenerated with the new fields. (Use `migrate deploy`, not `migrate dev`, to avoid the dev-baseline divergence reset.)

- [ ] **Step 4: Typecheck the schema change**

Run: `npx tsc --noEmit`
Expected: no new errors from the Prisma client types (existing call sites still compile because new required columns have DB defaults; repo updates land in Task 4).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260605120000_location_structured_address
git commit -m "feat(locations): add structured address columns (deploy-safe defaults)"
```

---

## Task 3: Location Zod input schema

**Files:**
- Modify: `lib/locations/schema.ts`
- Test: extend an inline test (create `__tests__/lib/locations/schema.test.ts`)

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/locations/schema.test.ts
import { describe, expect, it } from "vitest";
import { locationCreateSchema } from "@/lib/locations/schema";

describe("locationCreateSchema", () => {
  const base = {
    customerId: 1,
    street: "1247 Elm St",
    city: "Columbus",
    state: "OH",
    postalCode: "43215",
  };

  it("accepts structured input without an address field", () => {
    const parsed = locationCreateSchema.parse({ ...base, unit: "Apt 2", lat: 39.96, lon: -83.0 });
    expect(parsed.street).toBe("1247 Elm St");
    expect(parsed.lat).toBe(39.96);
  });

  it("requires street, city, state, postalCode", () => {
    expect(locationCreateSchema.safeParse({ customerId: 1 }).success).toBe(false);
  });

  it("allows omitting unit, label, notes, lat, lon", () => {
    expect(locationCreateSchema.safeParse(base).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/locations/schema.test.ts`
Expected: FAIL — schema still requires `address`, has no `street`.

- [ ] **Step 3: Rewrite `lib/locations/schema.ts`**

```typescript
import { z } from "zod";

export const locationCreateSchema = z.object({
  customerId: z.number().int().positive(),
  street: z.string().min(1).max(200),
  unit: z.string().max(100).optional(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(60),
  postalCode: z.string().min(1).max(20),
  lat: z.number().optional(),
  lon: z.number().optional(),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const locationListQuery = z.object({
  customerId: z.coerce.number().int().positive(),
});

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
```

Note: `address` is intentionally removed from input — the repo derives it (Task 4).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/locations/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/locations/schema.ts __tests__/lib/locations/schema.test.ts
git commit -m "feat(locations): structured zod input schema"
```

---

## Task 4: `locationRepo.createLocation` derives `address`

**Files:**
- Modify: `lib/repositories/locationRepo.ts`
- Test: `__tests__/repositories/locationRepo.test.ts`

- [ ] **Step 1: Update the repo test (gated on real DB)**

Replace the two `createLocation` calls and the address assertion in `__tests__/repositories/locationRepo.test.ts` so they pass structured parts and assert the derived `address`:

```typescript
  it("creates multiple locations for one customer and derives address", async () => {
    await createLocation({
      orgId,
      customerId,
      street: "12 Oak St",
      city: "Columbus",
      state: "OH",
      postalCode: "43201",
      label: "Rental",
    });
    await createLocation({
      orgId,
      customerId,
      street: "9 Elm Ave",
      city: "Dublin",
      state: "OH",
      postalCode: "43017",
    });
    const locs = await listLocationsForCustomer(orgId, customerId);
    expect(locs.map((l) => l.address).sort()).toEqual([
      "12 Oak St, Columbus, OH 43201",
      "9 Elm Ave, Dublin, OH 43017",
    ]);
  });
```

And in the ownership test, replace `address: "999 Hijack Rd"` with structured parts:

```typescript
      const res = await createLocation({
        orgId: otherOrg.id,
        customerId,
        street: "999 Hijack Rd",
        city: "Columbus",
        state: "OH",
        postalCode: "43215",
      });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `$env:VITEST_DB_AVAILABLE="1"; npx vitest run __tests__/repositories/locationRepo.test.ts`
Expected: FAIL — `createLocation` does not accept `street`/`city`/… yet (type error or missing derived address). (If no local DB, the suite is `skipIf`-skipped; rely on Step 4 typecheck instead and verify via e2e in Task 10.)

- [ ] **Step 3: Rewrite `lib/repositories/locationRepo.ts`**

```typescript
import { formatAddress } from "@/lib/locations/formatAddress";
import { prisma } from "@/lib/prisma";

export interface CreateLocationInput {
  orgId: string;
  customerId: number;
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat?: number | null;
  lon?: number | null;
  label?: string | null;
  notes?: string | null;
}

// Returns null when the customer doesn't belong to the caller's org, so the
// route can surface a 404 — a location must never link to another org's
// customer (mirrors createEstimate's siteMeasure ownership check).
export async function createLocation(input: CreateLocationInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, orgId: input.orgId },
    select: { id: true },
  });
  if (!customer) return null;

  const { orgId, customerId, label, notes, ...parts } = input;
  const address = formatAddress(parts);

  return prisma.location.create({
    data: {
      orgId,
      customerId,
      address,
      street: parts.street,
      unit: parts.unit ?? null,
      city: parts.city,
      state: parts.state,
      postalCode: parts.postalCode,
      lat: parts.lat ?? null,
      lon: parts.lon ?? null,
      label: label ?? null,
      notes: notes ?? null,
    },
  });
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

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (route `createLocation({ orgId, ...input })` in `app/api/locations/route.ts` still compiles — `input` now carries the structured fields from the updated Zod schema).

- [ ] **Step 5: Run the repo test if a DB is available**

Run: `$env:VITEST_DB_AVAILABLE="1"; npx vitest run __tests__/repositories/locationRepo.test.ts`
Expected: PASS (or skipped if no DB).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/locationRepo.ts __tests__/repositories/locationRepo.test.ts
git commit -m "feat(locations): derive address from structured parts on create"
```

---

## Task 5: Geoapify adapter + autocomplete proxy route

**Files:**
- Create: `lib/address/geoapify.ts`
- Create: `app/api/address/autocomplete/route.ts`
- Test: `__tests__/lib/address/geoapify.test.ts`

- [ ] **Step 1: Write the failing mapper test**

```typescript
// __tests__/lib/address/geoapify.test.ts
import { describe, expect, it } from "vitest";
import { mapGeoapifyResults } from "@/lib/address/geoapify";

const sample = {
  results: [
    {
      housenumber: "1247",
      street: "Elm Street",
      city: "Columbus",
      state: "Ohio",
      state_code: "OH",
      postcode: "43215",
      lat: 39.961,
      lon: -82.998,
      formatted: "1247 Elm Street, Columbus, OH 43215, United States",
    },
    {
      // no housenumber -> street only
      street: "Oak Avenue",
      city: "Dublin",
      state_code: "OH",
      postcode: "43017",
      lat: 40.099,
      lon: -83.114,
      formatted: "Oak Avenue, Dublin, OH 43017, United States",
    },
  ],
};

describe("mapGeoapifyResults", () => {
  it("normalizes results to structured suggestions", () => {
    const out = mapGeoapifyResults(sample);
    expect(out[0]).toEqual({
      formatted: "1247 Elm Street, Columbus, OH 43215, United States",
      street: "1247 Elm Street",
      unit: "",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
      lat: 39.961,
      lon: -82.998,
    });
  });

  it("falls back to full state name when no state_code, and street with no housenumber", () => {
    const out = mapGeoapifyResults(sample);
    expect(out[1].street).toBe("Oak Avenue");
    expect(out[1].state).toBe("OH");
  });

  it("returns [] for malformed payloads", () => {
    expect(mapGeoapifyResults({})).toEqual([]);
    expect(mapGeoapifyResults(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/address/geoapify.test.ts`
Expected: FAIL — cannot find module `@/lib/address/geoapify`.

- [ ] **Step 3: Implement the adapter**

```typescript
// lib/address/geoapify.ts

export interface AddressSuggestion {
  formatted: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
}

interface GeoapifyResult {
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  lat?: number;
  lon?: number;
  formatted?: string;
}

/** Map Geoapify's `format=json` results into our normalized suggestion shape. */
export function mapGeoapifyResults(json: unknown): AddressSuggestion[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.map((raw): AddressSuggestion => {
    const r = raw as GeoapifyResult;
    const street = [r.housenumber, r.street].filter(Boolean).join(" ").trim();
    return {
      formatted: r.formatted ?? "",
      street,
      unit: "",
      city: r.city ?? "",
      state: r.state_code ?? r.state ?? "",
      postalCode: r.postcode ?? "",
      lat: typeof r.lat === "number" ? r.lat : null,
      lon: typeof r.lon === "number" ? r.lon : null,
    };
  });
}

/**
 * Fetch autocomplete suggestions from Geoapify. Returns [] when no API key is
 * configured or the upstream call fails — callers treat that as "no
 * suggestions" so the manual fields keep working (graceful degradation).
 */
export async function fetchAddressSuggestions(
  query: string
): Promise<AddressSuggestion[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey || query.trim().length < 3) return [];

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("filter", "countrycode:us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("apiKey", apiKey);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    return mapGeoapifyResults(await res.json());
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run mapper test to verify it passes**

Run: `npx vitest run __tests__/lib/address/geoapify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the proxy route**

Mirror the auth pattern of `app/api/locations/route.ts` (uses `apiRoute` with `minRole: "lead"`):

```typescript
// app/api/address/autocomplete/route.ts
import { apiRoute } from "@/lib/api/route";
import { fetchAddressSuggestions } from "@/lib/address/geoapify";

// Server proxy so GEOAPIFY_API_KEY stays server-side and the provider stays
// swappable. Returns [] (never errors) when the key is unset or upstream fails.
export const GET = apiRoute({ minRole: "lead" }, async ({ req }) => {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  return fetchAddressSuggestions(query);
});
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If `apiRoute`'s handler signature differs, match it to the destructuring used in `app/api/locations/route.ts` — `async ({ req, orgId }) => …`.)

- [ ] **Step 7: Commit**

```bash
git add lib/address/geoapify.ts app/api/address/autocomplete/route.ts __tests__/lib/address/geoapify.test.ts
git commit -m "feat(address): geoapify autocomplete adapter + proxy route"
```

---

## Task 6: Client hook types

**Files:**
- Modify: `lib/hooks/useLocations.ts`
- Modify: `lib/hooks/useCustomers.ts` (`CustomerLocationSummary`)

- [ ] **Step 1: Expand `Location` + `CreateLocationInput` in `useLocations.ts`**

Replace the `Location` and `CreateLocationInput` interfaces (lines 5-20) with:

```typescript
export interface Location {
  id: number;
  orgId: string;
  customerId: number;
  address: string;
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat?: number | null;
  lon?: number | null;
  label?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CreateLocationInput {
  customerId: number;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
  lat?: number;
  lon?: number;
  label?: string;
  notes?: string;
}
```

- [ ] **Step 2: Add structured fields to `CustomerLocationSummary` in `useCustomers.ts`**

In `lib/hooks/useCustomers.ts`, extend the `CustomerLocationSummary` interface (lines 49-56) so the detail view can read parts if needed; `address` stays the primary display field:

```typescript
export interface CustomerLocationSummary {
  id: number;
  address: string;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  label: string | null;
  notes: string | null;
  createdAt: string;
  siteMeasures: CustomerSiteMeasureSummary[];
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `CustomerDetail.tsx` / `LocationsCard.tsx` (handled in Tasks 7) — those are expected and fixed next. No errors elsewhere.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useLocations.ts lib/hooks/useCustomers.ts
git commit -m "feat(locations): structured fields in client location types"
```

---

## Task 7: Structured address form + autocomplete + Maps button

**Files:**
- Modify: `components/customers/LocationsCard.tsx`
- Modify: `components/customers/CustomerDetail.tsx`

- [ ] **Step 1: Define the form payload type and rewrite `LocationsCard`**

Replace `components/customers/LocationsCard.tsx` entirely:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AddressSuggestion } from "@/lib/address/geoapify";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";

export interface NewLocationInput {
  street: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  label: string;
  lat?: number;
  lon?: number;
}

interface Props {
  locations: CustomerLocationSummary[];
  adding: boolean;
  onAddingChange: (value: boolean) => void;
  onAddLocation: (input: NewLocationInput) => Promise<void>;
  onStartSiteMeasure: (locationId: number) => void;
  isAdding: boolean; // createLocation.isPending
  isStarting: boolean; // createSiteMeasure.isPending
}

const EMPTY: NewLocationInput = {
  street: "",
  unit: "",
  city: "",
  state: "",
  postalCode: "",
  label: "",
};

const fieldLabel =
  "font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]";
const fieldInput =
  "w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150";

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function LocationsCard({
  locations,
  adding,
  onAddingChange,
  onAddLocation,
  onStartSiteMeasure,
  isAdding,
  isStarting,
}: Props) {
  const [form, setForm] = useState<NewLocationInput>(EMPTY);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    setForm(EMPTY);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  // Debounced autocomplete keyed off the street field. The proxy returns [] on
  // any failure, so a missing key / network error just yields no dropdown.
  function onStreetChange(value: string) {
    setForm((f) => ({ ...f, street: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address/autocomplete?q=${encodeURIComponent(value)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as AddressSuggestion[];
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        // graceful: keep manual entry
      }
    }, 250);
  }

  function pickSuggestion(s: AddressSuggestion) {
    setForm((f) => ({
      ...f,
      street: s.street,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      lat: s.lat ?? undefined,
      lon: s.lon ?? undefined,
    }));
    setShowSuggestions(false);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function handleSave() {
    try {
      await onAddLocation({
        ...form,
        street: form.street.trim(),
        unit: form.unit.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        label: form.label.trim(),
      });
      reset();
      onAddingChange(false);
    } catch {
      // Orchestrator surfaces the toast; keep inputs for a retry.
    }
  }

  const canSave =
    form.street.trim() &&
    form.city.trim() &&
    form.state.trim() &&
    form.postalCode.trim();

  return (
    <div
      id="locations-card"
      className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5 mb-4"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[15px] font-[700] tracking-[-0.015em]">Locations</h2>
        {!adding && (
          <Button size="sm" onClick={() => onAddingChange(true)}>
            + Add location
          </Button>
        )}
      </div>

      {locations.length === 0 && !adding ? (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
          No locations yet. Add one to start a site measure.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center gap-3 border border-[var(--line)] rounded-md px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-[600] tracking-[-0.01em]">
                  {loc.address}
                  {loc.label ? (
                    <span className="ml-2 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] font-[400]">
                      {loc.label}
                    </span>
                  ) : null}
                </div>
                {loc.notes && (
                  <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] mt-0.5">
                    {loc.notes}
                  </div>
                )}
                <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                  {loc.siteMeasures.length} site measure
                  {loc.siteMeasures.length === 1 ? "" : "s"}
                </div>
              </div>
              {loc.address && (
                <a
                  href={mapsHref(loc.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm">Open in Google Maps</Button>
                </a>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => onStartSiteMeasure(loc.id)}
                disabled={isStarting}
              >
                + Site measure
              </Button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 border border-dashed border-[var(--line-2)] rounded-md p-4 flex flex-col gap-3">
          {/* Street + autocomplete */}
          <div className="relative">
            <div className={fieldLabel}>Street *</div>
            <input
              type="text"
              value={form.street}
              onChange={(e) => onStreetChange(e.target.value)}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              placeholder="Start typing an address…"
              autoComplete="off"
              className={fieldInput}
            />
            {showSuggestions && (
              <ul className="absolute z-10 mt-1 w-full bg-[var(--surface)] border border-[var(--line)] rounded-[5px] shadow-md max-h-60 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={s.formatted}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="w-full text-left text-[12.5px] px-2.5 py-2 hover:bg-[var(--surface-2)] cursor-pointer"
                    >
                      {s.formatted}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className={fieldLabel}>Unit / Apt</div>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="Apt, suite, unit"
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>City *</div>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>State *</div>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                placeholder="OH"
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>ZIP *</div>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postalCode: e.target.value }))
                }
                className={fieldInput}
              />
            </div>
            <div className="md:col-span-2">
              <div className={fieldLabel}>Label</div>
              <input
                type="text"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="e.g. Rental, Main house"
                className={fieldInput}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              onClick={() => {
                onAddingChange(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={isAdding || !canSave}
            >
              {isAdding ? "Saving…" : "Save location"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `CustomerDetail.handleAddLocation`**

In `components/customers/CustomerDetail.tsx`, replace `handleAddLocation` (lines 109-124) and import the new type:

```tsx
import { LocationsCard, type NewLocationInput } from "@/components/customers/LocationsCard";
```

```tsx
  async function handleAddLocation(input: NewLocationInput) {
    if (!input.street || !input.city || !input.state || !input.postalCode) {
      showToast("Address required");
      throw new Error("address required");
    }
    try {
      await createLocation.mutateAsync({
        customerId,
        street: input.street,
        unit: input.unit || undefined,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        lat: input.lat,
        lon: input.lon,
        label: input.label || undefined,
      });
    } catch {
      showToast("Failed to add location");
      throw new Error("create failed");
    }
  }
```

(The existing `<LocationsCard … onAddLocation={handleAddLocation} />` usage needs no prop changes.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit; npx @biomejs/biome check components/customers/LocationsCard.tsx components/customers/CustomerDetail.tsx`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/customers/LocationsCard.tsx components/customers/CustomerDetail.tsx
git commit -m "feat(locations): structured address form with autocomplete + maps button"
```

---

## Task 8: New customer First/Last boxes + wider drawer

**Files:**
- Modify: `components/customers/NewCustomerPanel.tsx`

- [ ] **Step 1: Add first/last state and widen the panel**

In `components/customers/NewCustomerPanel.tsx`:

1. Add `firstName`/`lastName` to local state (keep `phone`/`email`/`source`/`notes` in `form`):

```tsx
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [form, setForm] = useState<Omit<CreateCustomerInput, "name">>({
    phone: "",
    email: "",
    source: "phone",
    notes: "",
  });
```

2. Update `resetForm` to clear the new fields:

```tsx
  function resetForm() {
    setFirstName("");
    setLastName("");
    setForm({ phone: "", email: "", source: "phone", notes: "" });
  }
```

3. Compose `name` in `handleSave`:

```tsx
  async function handleSave() {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!name) {
      showToast("Name required", "Please enter a name");
      return;
    }
    try {
      const created = await createCustomer.mutateAsync({ ...form, name });
      onClose();
      resetForm();
      showToast("Customer saved", created.name);
    } catch {
      showToast("Failed to create customer");
    }
  }
```

4. Set the disabled guard on the Save button to `!firstName.trim() && !lastName.trim()` → require at least one:

```tsx
            disabled={
              (!firstName.trim() && !lastName.trim()) || createCustomer.isPending
            }
```

5. Pass a wider width to `SlidePanel`:

```tsx
    <SlidePanel
      open={open}
      onClose={() => { onClose(); resetForm(); }}
      title="New Customer"
      sub="Add a lead to start"
      width="560px"
      footer={ /* unchanged */ }
    >
```

6. Replace the single `name` entry in the mapped `[{ field: "name" … }]` list with two side-by-side inputs ABOVE the phone/email block. Remove the `name` object from that array (leave `phone` and `email`), and add before it:

```tsx
        {/* Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              First name
            </div>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jordan"
              className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Last name
            </div>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Henderson"
              className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
        </div>
```

Update the remaining mapped array to drop `name`:

```tsx
        {[
          { field: "phone" as const, label: "Phone", placeholder: "(614) 555-..." },
          { field: "email" as const, label: "Email", placeholder: "name@email.com" },
        ].map(({ field, label, placeholder }) => (
          // …unchanged body, but `form[field]` now typed against the Omit; cast as needed:
          // value={(form[field] as string) ?? ""}
        ))}
```

Note: since `form` no longer contains `name`, the `setForm((f) => ({ ...f, [field]: e.target.value }))` handler still works for `phone`/`email`. Keep the existing notes block as-is.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit; npx @biomejs/biome check components/customers/NewCustomerPanel.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/customers/NewCustomerPanel.tsx
git commit -m "feat(customers): split new-customer name into first/last + widen drawer"
```

---

## Task 9: Seed script

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Replace customer `address` strings with structured parts**

In the `customerData` array (lines ~183-230), change each entry's `address: "<street>, <city>"` into structured fields. Example for the first two (apply the same shape to all six, using realistic Columbus-area cities/ZIPs):

```typescript
    {
      name: "Henderson, J.",
      phone: "(614) 555-0142",
      email: "henderson@email.com",
      street: "1247 Elm St",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
      source: "phone",
      notes: "Prefers Mon mornings",
    },
    {
      name: "Martinez, R.",
      phone: "(614) 555-0188",
      email: "rmartinez@email.com",
      street: "89 Oak Ave",
      city: "Worthington",
      state: "OH",
      postalCode: "43085",
      source: "referral",
      notes: "Referred by Henderson",
    },
```

(Continue for Chen → Dublin 43017, Park Family → Bexley 43209, Nguyen → Upper Arlington 43221, Sharma → Westerville 43081.)

- [ ] **Step 2: Update the location-creation loop to use structured parts + derived address**

Add the import at the top of `prisma/seed.ts`:

```typescript
import { formatAddress } from "../lib/locations/formatAddress";
```

Replace the per-customer location creation (lines ~237-248) so it destructures the structured parts and writes the derived `address`:

```typescript
  for (const c of customerData) {
    const { street, city, state, postalCode, ...customerFields } = c;
    const customer = await prisma.customer.upsert({
      where: { id: customers.length + 1 },
      update: {},
      create: { ...customerFields, orgId: org.id },
    });
    customers.push(customer);
    const parts = { street, unit: "", city, state, postalCode };
    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        address: formatAddress(parts),
        ...parts,
      },
    });
    locations.push(location);
  }
```

- [ ] **Step 3: Update the Henderson rental location (lines ~986-993)**

```typescript
  const rentalParts = {
    street: "456 Rental Rd",
    unit: "",
    city: "Columbus",
    state: "OH",
    postalCode: "43204",
  };
  const hendersonRental = await prisma.location.create({
    data: {
      orgId: org.id,
      customerId: customers[0].id,
      address: formatAddress(rentalParts),
      ...rentalParts,
      label: "Rental Unit",
      notes: "Tenant-occupied — call ahead",
    },
  });
```

- [ ] **Step 4: Update the pagination-fixture location (lines ~1255-1261)**

```typescript
    const pgParts = {
      street: `${1000 + i} Pagination Way`,
      unit: "",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
    };
    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        address: formatAddress(pgParts),
        ...pgParts,
      },
    });
```

- [ ] **Step 5: Run the seed against the local DB**

Run: `npx prisma db seed`
Expected: completes without error; locations have structured parts and a composed `address`.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): structured location addresses"
```

---

## Task 10: e2e fixtures + specs

**Files:**
- Modify: `tests/e2e/fixtures/seed.ts:38`
- Modify: `tests/e2e/locations.spec.ts`
- Modify: `tests/e2e/customer-detail.spec.ts`

- [ ] **Step 1: Update the e2e fixture seed default**

In `tests/e2e/fixtures/seed.ts`, the location create currently uses `address: args.address ?? "100 Test Ave"`. Change it to write structured parts + derived address. Inspect the surrounding `args` shape first; then:

```typescript
import { formatAddress } from "../../../lib/locations/formatAddress";

// …inside the location create:
const parts = {
  street: args.street ?? args.address ?? "100 Test Ave",
  unit: "",
  city: args.city ?? "Columbus",
  state: args.state ?? "OH",
  postalCode: args.postalCode ?? "43215",
};
// data: { …, address: formatAddress(parts), ...parts }
```

Keep backward compatibility: if existing fixtures pass `address`, treat it as `street`. Adjust the `args` type accordingly.

- [ ] **Step 2: Update spec assertions**

In `tests/e2e/locations.spec.ts` (around lines 34, 54) and `tests/e2e/customer-detail.spec.ts` (around line 159), the assertions compare `l.address`. Update expected values to the derived format (e.g. `"12 Oak St"` → `"12 Oak St, Columbus, OH 43201"`) OR, where a test creates a location through the UI, drive the new structured fields (Street/City/State/ZIP) instead of a single address input. Match the values the test seeds.

For any test that fills the add-location form via the UI, replace the single address fill with:

```typescript
await page.getByLabel(/street/i).fill("12 Oak St");
await page.getByPlaceholder("Start typing an address…").fill("12 Oak St"); // if label lookup differs
await page.getByLabel(/city/i).fill("Columbus");
await page.getByLabel(/state/i).fill("OH");
await page.getByLabel(/zip/i).fill("43201");
```

(Confirm the exact selectors against the rendered DOM; the form uses div labels, not `<label htmlFor>`, so target by placeholder or surrounding text as the existing specs do.)

- [ ] **Step 3: Run the e2e suite single-worker (matches CI)**

Run: `npx playwright test locations customer-detail --workers=1`
Expected: PASS. (Single worker avoids the known parallel-contention flakiness.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/seed.ts tests/e2e/locations.spec.ts tests/e2e/customer-detail.spec.ts
git commit -m "test(e2e): structured address fixtures + assertions"
```

---

## Task 11: Env docs + full verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the Geoapify key**

Append to `.env.example`:

```bash
# Geoapify address autocomplete (https://www.geoapify.com/). Free tier ~3,000
# req/day. Used by /api/address/autocomplete. If unset, address fields still
# work as plain manual inputs (autocomplete is simply disabled).
GEOAPIFY_API_KEY=
```

Also add the key (with the real value) to your local `.env` to test autocomplete manually.

- [ ] **Step 2: Run lint over the whole repo**

Run: `npx @biomejs/biome ci .`
Expected: PASS, no errors. (Per project rule — must pass before completion.)

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (DB-gated repo tests skip without `VITEST_DB_AVAILABLE`).

- [ ] **Step 4: Run the full e2e suite single-worker**

Run: `npx playwright test --workers=1`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run the app, then:
1. Open New Customer — confirm the drawer is visibly wider and shows First/Last boxes side-by-side; create a customer; confirm it appears as "First Last".
2. On the customer page, Add location — type into Street, pick a Geoapify suggestion (if key set), confirm City/State/ZIP fill; Save; confirm the row shows the composed address.
3. Click "Open in Google Maps" — confirm it opens Google Maps showing the address card (not a bare pin).

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "docs(env): document GEOAPIFY_API_KEY"
```

---

## Self-review notes (for the implementer)

- **Derived `address` invariant:** every write path to `Location` (repo create, seed, e2e fixture) MUST set `address = formatAddress(parts)`. There is no update path for locations today; if one is added later, it must re-derive `address` too.
- **Graceful autocomplete:** the proxy and client both swallow failures to `[]` — verify no console errors when `GEOAPIFY_API_KEY` is unset.
- **Name format mix is expected:** seed/demo customers keep `"Last, F."`; new ones are `"First Last"`. This is the agreed UI-only tradeoff, not a bug.
- **Migration is non-destructive:** the `DEFAULT ''` columns mean the deploy migration succeeds on the populated Neon DB without touching site measures/estimates.
