# Plan — Estimate builder: change customer

**Spec:** `docs/superpowers/specs/2026-05-09-estimate-change-customer-design.md`
**Branch:** `feat/estimate-change-customer`

## Steps

1. **Backend wiring (small)**
   - `lib/repositories/estimateRepo.ts` — add `customerId?: number` to `EstimatePatch`.
   - `app/api/estimates/[id]/route.ts` — add `customerId: z.number().int().positive().optional()` to `updateSchema`.
   - `lib/hooks/useEstimates.ts` — add `customerId?: number` to `UpdateEstimateInput`.

2. **Picker component**
   - Create `components/estimates/CustomerPickerPanel.tsx`. Clone the popover scaffolding from `components/quotes/RoomLinkPicker.tsx` (anchor-rect positioning, outside-click + Escape handling). Replace body with a search input + customer list. Active row = current customer (disabled).

3. **Wire the Change button**
   - In `components/estimates/EstimateBuilder.tsx`, add a Change button to the customer bar (right of View). On click, capture `getBoundingClientRect()` and open the picker. On select, call `updateEstimate.mutateAsync({ customerId })`; toast on error.
   - Use `useCustomers()` to fetch the list when the picker opens (it's cached, so this is cheap if the user's been on Customers recently).

4. **Tests**
   - `__tests__/api/estimates.[id].test.ts` — PATCH happy-path with `customerId`, plus a 400 for invalid `customerId`.
   - `__tests__/repositories/estimateRepo.test.ts` — assert `customerId` flows through to `estimate.updateMany`.

5. **Verify**
   - `npx biome ci .`
   - `npx vitest run`
   - Push, open PR, watch checks.

## Risk notes

- Foreign-key violation if a stale `customerId` is passed. Acceptable to surface as 500 because the only path is the picker, which sources customers from the same org.
- Cache invalidation already handled by `useUpdateEstimate`. No new query keys to manage.
