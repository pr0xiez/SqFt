# New Customer & Address Capture — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)

## Problem

Two forms need work:

1. **New customer form** (`NewCustomerPanel`) — name is a single box, and the drawer is too narrow on desktop.
2. **Location address capture** (`LocationsCard`) — the entire address is one free-text field with no structure and no autocomplete.

## Decisions (from brainstorming)

- **Name split is UI-only.** Two boxes compose into the existing single `Customer.name` column. No name migration.
- **Address goes fully structured**, but the existing single `address` string is **kept as a derived column** (formatted on save) so the ~10 existing consumers and the estimate/invoice snapshots keep working untouched.
- **No backfill.** Existing location data will be wiped and reseeded going forward.
- **Autocomplete provider: Geoapify**, behind a server-side proxy route, swappable later.
- **lat/lon are captured** (nullable) for possible future use, even though the maps button does not use them.
- **"Open in Google Maps" uses the text-query URL** (address card experience), not a coordinate pin.

## 1. Customer name → First / Last boxes

`components/customers/NewCustomerPanel.tsx`:

- Replace the single `name` input with **First name** and **Last name** inputs, side-by-side on desktop (`grid grid-cols-2`), stacked on mobile.
- Local state holds `firstName` / `lastName`. On save, compose `name = \`${firstName.trim()} ${lastName.trim()}\`.trim()`.
- Validation: require a non-empty composed name (at least one of the two filled). The Save button stays disabled until then.
- The Zod schema (`lib/customers/schema.ts`) is **unchanged** — it still receives a single `name`. The split lives entirely in the form.
- Existing customers (`"Last, F."` format) are untouched. New customers use `"First Last"`. This minor format mix is acceptable per the UI-only decision.
- **Scope:** only the new-customer create panel. Edit surfaces elsewhere keep the single field unless separately requested.

## 2. New customer drawer width

- `SlidePanel` already renders `w-full` on mobile and applies `maxWidth: width` only at the `md:` breakpoint. So widening only affects desktop.
- Pass `width="560px"` from `NewCustomerPanel`. Default (420px) stays for all other panels.

## 3. Structured address — schema

`prisma/schema.prisma`, `Location` model. Add:

| Column | Type | Notes |
|---|---|---|
| `street` | `String` | House number + street, e.g. "1247 Elm St" |
| `unit` | `String?` | Apt/suite/line 2 |
| `city` | `String` | |
| `state` | `String` | 2-letter or full; stored as provider returns |
| `postalCode` | `String` | |
| `lat` | `Float?` | Captured from Geoapify; future use |
| `lon` | `Float?` | Captured from Geoapify; future use |
| `address` | `String` | **Kept.** Derived one-line formatted address, written on every create/update. |

`label` and `notes` stay as-is.

**Migration:** Since location data is being wiped (no backfill), the new non-nullable columns can be added cleanly. The migration adds the columns; the seed repopulates with structured + derived values. Follow the project's migration rules (never squash; add on top; `prisma migrate deploy` runs at deploy).

### `formatAddress` helper

A small pure helper (e.g. `lib/locations/formatAddress.ts`) composes the derived `address` from the structured parts:

```
formatAddress({ street, unit, city, state, postalCode })
  → "1247 Elm St, Apt 2, Columbus, OH 43215"  (skips empty parts)
```

Called server-side in the create/update location flow so `address` always stays in sync with the parts. All existing `.address` readers (LocationsCard, SiteMeasureList/Builder, EstimateList/Builder, dashboard SiteMeasuresTable, CustomerHeader/Detail, estimate-approval + invoice-send snapshots) keep working unchanged.

### Zod schema

`lib/locations/schema.ts` `locationCreateSchema` changes: `street`, `city`, `state`, `postalCode` are required; `unit` is optional; `lat`/`lon` are optional numbers; `label`/`notes` stay optional. The single `address` field is removed from the input schema — the API derives `address` server-side via `formatAddress`, so clients never send it directly.

## 4. Address form — structured inputs + autocomplete

`components/customers/LocationsCard.tsx` add-location form:

- Replace the single Address input with structured inputs: **Street** (with autocomplete), **Unit** (optional), **City**, **State**, **ZIP**, plus the existing **Label**.
- **Street field drives autocomplete.** As the user types (debounced ~250ms, min ~3 chars), query the proxy route and show a suggestions dropdown. Selecting a suggestion fills street/unit/city/state/postalCode and stashes lat/lon. All fields remain hand-editable afterward.
- Keep the inline collapsible-section pattern; lay fields out in a responsive grid.
- `onAddLocation` callback signature expands to carry the structured payload (street/unit/city/state/postalCode/label/lat/lon) instead of `(address, label)`. The orchestrator in `CustomerDetail` passes it through to the create-location hook.

## 5. Autocomplete proxy + provider

- **Route:** `app/api/address/autocomplete/route.ts`. Accepts `?q=<partial>`; calls Geoapify Address Autocomplete with `GEOAPIFY_API_KEY` (env, server-only); returns normalized
  `{ formatted, street, unit, city, state, postalCode, lat, lon }[]`.
- Provider details (parsing Geoapify's `properties`: `housenumber`+`street`→street, `city`, `state`/`state_code`, `postcode`, `lat`, `lon`) live in a small adapter so swapping to Radar later only touches that adapter.
- **Graceful degradation:** if `GEOAPIFY_API_KEY` is unset or the upstream call fails, the route returns an empty list (or the client treats errors as "no suggestions"). The structured fields remain fully usable as manual inputs.
- Add `GEOAPIFY_API_KEY` to env config / `.env.example` and note it in setup docs.

## 6. Open in Google Maps button

- On each location row in `LocationsCard`, add an **"Open in Google Maps"** button next to **"+ Site measure"**.
- Link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}` opened in a new tab. Uses the derived `address` text → Google shows the full address card (the "Maps experience"), not a coordinate pin.
- Works for any location with an `address`, including hand-typed ones.

## Out of scope

- Splitting name in edit surfaces other than the create panel.
- Using lat/lon for anything yet (captured only).
- Backfilling existing location rows (wiped instead).
- Switching providers (adapter leaves the door open).

## Verification

- `biome ci .` passes.
- Seed script updated for the new `Location` columns (structured + derived `address`).
- Full test suite passes; update `locationRepo`, `locations.spec`, `customer-detail.spec`, and `seed.ts` for the new shape.
- Manual: create a customer with first/last; add a location via autocomplete; confirm derived `address` shows in lists/snapshots; click Open in Google Maps.
