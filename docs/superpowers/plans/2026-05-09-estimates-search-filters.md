# Estimates Search + Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a text-search input and four status-filter chips (All / No rooms / Measured / Quoted) to the Estimates list, mirroring the customers-search precedent.

**Architecture:** Two-file change: a pure `filterEstimates` helper that's vitest-testable in isolation, and a wiring change to `EstimateList.tsx` that adds `query` + `status` state, renders the filter bar, and delegates filtering to the helper. The `SearchInput` UI primitive already exists from Gap #2.

**Spec:** `docs/superpowers/specs/2026-05-09-estimates-search-filters-design.md`

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `components/estimates/filterEstimates.ts` | **Create** | Pure helper that filters an `Estimate[]` by query + status. |
| `__tests__/components/estimates/filterEstimates.test.ts` | **Create** | Vitest tests for the pure helper. |
| `components/estimates/EstimateList.tsx` | **Modify** | Add state, render filter bar, delegate filtering to helper, branch empty-state copy. |

---

## Task 1: Pure `filterEstimates` helper (TDD)

- [ ] **Step 1: Write failing tests** at `__tests__/components/estimates/filterEstimates.test.ts`.
- [ ] **Step 2: Verify tests fail** with `npx vitest run __tests__/components/estimates/filterEstimates.test.ts`.
- [ ] **Step 3: Write minimal implementation** at `components/estimates/filterEstimates.ts`.
- [ ] **Step 4: Verify tests pass.**
- [ ] **Step 5: Lint** with `npx biome ci components/estimates/filterEstimates.ts __tests__/components/estimates/filterEstimates.test.ts`.
- [ ] **Step 6: Commit** as `feat(estimates): add filterEstimates helper for query+status filtering`.

## Task 2: Wire filter bar into `EstimateList`

- [ ] **Step 1: Add imports** for `useState`, `SearchInput`, `filterEstimates`, `EstimateStatus`.
- [ ] **Step 2: Add `query` and `status` state** inside `EstimateListView`.
- [ ] **Step 3: Render the filter bar** between the page header and the table — `SearchInput` first, then four chips, then the hidden-count span. Use the same chip styling pattern as `CustomerList.tsx`.
- [ ] **Step 4: Replace the rendered list source** with `filterEstimates(estimates, query, status)`.
- [ ] **Step 5: Branch the empty-state copy** — when any filter is narrowing and result is empty, show `No estimates match "<query>".` or `No estimates match.`; otherwise keep the existing `No estimates yet.` copy.
- [ ] **Step 6: Type-check** with `npx tsc --noEmit`.
- [ ] **Step 7: Lint** with `npx biome ci components/estimates/EstimateList.tsx`.
- [ ] **Step 8: Run full test suite** with `npx vitest run`.
- [ ] **Step 9: Commit** as `feat(estimates): add search input and status filters to list`.

## Task 3: Final verification

- [ ] **Step 1:** `npx biome ci .`
- [ ] **Step 2:** `npx vitest run`
- [ ] **Step 3:** `npx tsc --noEmit`
- [ ] **Step 4:** `git status` clean.
- [ ] **Step 5:** Push and open PR.
