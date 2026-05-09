# Estimate builder — change customer

**Date:** 2026-05-09
**Roadmap parent:** [`2026-05-09-design-gap-roadmap-design.md`](./2026-05-09-design-gap-roadmap-design.md) — Tier 1, Gap #4
**Source design:** `design/SqFt - App.html` — `cust-bar` actions on `screen-estimates` (HTML lines 713–723) plus `cp-panel` mini-picker (HTML lines 863–870)

## Problem

The customer bar on the estimate builder (`components/estimates/EstimateBuilder.tsx`) only has a **View** button. The design has both **View** and **Change**. If a customer was mis-attached at estimate creation, today's only fix is to delete and recreate the estimate, losing all rooms and notes.

## Solution

Add a **Change** button to the right of **View** on the customer bar. Clicking it opens a small popover anchored to the button — a customer-picker mini-panel modeled on the existing `RoomLinkPicker` popover pattern (`components/quotes/RoomLinkPicker.tsx`). Selecting a customer calls `useUpdateEstimate({ customerId })` and immediately reflects the change in the bar via React Query cache invalidation.

The picker only handles **selection** — creating a new customer is out of scope here (the design has a "+ New customer" footer button, but introducing the new-customer slide-panel into the estimate builder doubles the surface area for a relatively rare flow). A user who needs a brand-new customer can still navigate to Customers, create one, and come back.

## Components

### `components/estimates/CustomerPickerPanel.tsx` (new)

A popover panel anchored to the **Change** button, structurally cloned from `RoomLinkPicker`:

```ts
interface Props {
  customers: Customer[];          // from useCustomers()
  currentCustomerId: number;      // highlight & disable selecting the same one
  anchorRect: DOMRect;            // for fixed-positioning under the button
  onSelect: (customerId: number) => void;
  onClose: () => void;
}
```

**Behavior:**

- Fixed-positioned under the anchor rect, clamped to viewport (same math as `RoomLinkPicker`).
- Header with "Change customer" title and `×` close button.
- Search input (reuse the picker's local-search pattern from `RoomLinkPicker` — bare `<input>` styled to match `mp-search`, not the shared `SearchInput` primitive, because this is inside a popover with its own header/body/footer chrome).
- Scrolling list of customers. Each row shows `name` (semibold) and `address` (muted, mono). The current customer is marked active and its row is disabled (selecting it would be a no-op).
- Click a row → call `onSelect(customer.id)` then `onClose()`.
- Closes on outside click and `Escape`.

**Search match:** case-insensitive substring across `name`, `phone`, `email`, `address`, mirroring the `filterCustomers` helper. Inline filter — no shared helper extraction yet (single call site).

### `components/estimates/EstimateBuilder.tsx` (modified)

- Add a **Change** button next to **View** on the customer bar (same `<Button size="sm">` styling).
- Hold a ref on the Change button to capture its `getBoundingClientRect()` for popover anchoring.
- `useState<DOMRect | null>(null)` for picker open/closed state (also drives anchoring).
- On Change click: capture the rect and open the picker.
- On select: `await updateEstimate.mutateAsync({ customerId: newId })`; on error, `showToast("Failed to change customer")`.

### `app/api/estimates/[id]/route.ts` (modified)

Extend the PATCH `updateSchema` to accept `customerId: z.number().int().positive().optional()`. The handler already passes the parsed body straight to `saveEstimate`.

### `lib/repositories/estimateRepo.ts` (modified)

Extend `EstimatePatch` to include `customerId?: number`. The existing `topLevel` path passes it directly to `prisma.estimate.updateMany({ data: topLevel })`, which works because `customerId` is a scalar foreign-key column on `Estimate`. No schema migration needed.

If the new `customerId` doesn't exist or doesn't belong to the same `orgId`, Prisma's foreign-key constraint will throw — surfacing as a 500. We deliberately don't pre-validate; the only realistic caller is the picker panel which lists customers from `useCustomers()` (already org-scoped).

### `lib/hooks/useEstimates.ts` (modified)

Add `customerId?: number` to `UpdateEstimateInput`.

## State and persistence

- Picker open state lives in `EstimateBuilderView` (local React state).
- No URL sync.
- Cache invalidation: existing `useUpdateEstimate.onSuccess` already invalidates `["estimates"]` and `["estimates", id]`, so the customer bar re-renders with the new customer.

## Tests

1. `__tests__/api/estimates.[id].test.ts` — add a case: PATCH with `{ customerId: 12 }` calls `saveEstimate(id, orgId, expect.objectContaining({ customerId: 12 }))` and returns 200. Add a 400 case for `customerId: -1` (fails `.positive()`).
2. `__tests__/repositories/estimateRepo.test.ts` — extend the "updates only top-level fields" case (or add a new one) to assert `customerId` is forwarded to `estimate.updateMany`'s `data`.

No component test for `CustomerPickerPanel` — same justification as the customers-search spec: vitest is `environment: "node"` with no testing-library installed.

## Out of scope

- "+ New customer" footer button in the picker (deferred — see Solution rationale above).
- Confirmation dialog before changing customer. The action is reversible (re-open picker, pick original) and the design has no confirmation.
- Keyboard navigation in the picker list (arrow keys, Enter to select).
- Highlighting search matches in customer names.

## Acceptance

- A **Change** button appears next to **View** on the customer bar.
- Clicking **Change** opens a popover anchored to the button.
- The popover shows all org customers, with the current one marked and disabled.
- Typing in the search input filters the list by name/phone/email/address (case-insensitive substring).
- Selecting a different customer updates the estimate's customer; the bar reflects the new customer immediately; a toast confirms (or surfaces an error).
- The popover closes on outside click, `Escape`, the close `×`, and after a successful select.
- `biome ci .` passes; `vitest` passes including the new API + repo cases.
